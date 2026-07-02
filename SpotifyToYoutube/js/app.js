import {
  auth, songs, loadPersistedAuth, clearPersistedAuth,
  getCachedMatch, setCachedMatch, clearCachedMatch,
} from './state.js';
import { connectSpotify, exchangeSpotifyCode, fetchSpotifyProfile, fetchAllTracks } from './spotify.js';
import {
  connectYouTube, ensureYouTubePlaylist, searchVideo, addVideoToPlaylist,
  YouTubeQuotaError, YouTubeAuthError,
} from './youtube.js';
import {
  markConnected, checkBothConnected, showTopBar, resetToAuthScreen,
  markSongAdded, resetSongRow, populatePlaylistFilter,
  getMatchingIndexes, buildTableShell, renderPage, renderPaginationControls,
} from './ui.js';

let matchingIndexes = []; // song indexes matching the current search/playlist filter
let currentPage     = 1;
let pageSize        = 100; // 50 / 100 / 200, or Infinity for "All"
const addedMatches  = new Map(); // song index -> match, remembered across page navigation this session

// Each Spotify playlist is mirrored to a same-named YouTube playlist rather
// than dumping every song into one — e.g. a song from Spotify's "XYZ"
// playlist goes into a YouTube playlist also named "XYZ" (reusing it if the
// user already has one). Resolves playlist title -> Promise<{ id, videoIds }>,
// cached so each title is only looked up/created once per session.
const playlistCache = new Map();

function getPlaylistFor(title) {
  if (!playlistCache.has(title)) {
    // Don't let a failed lookup permanently poison the cache for this title —
    // a later retry (e.g. after a transient network error) should get a fresh attempt.
    const lookup = ensureYouTubePlaylist(title).catch((err) => {
      playlistCache.delete(title);
      throw err;
    });
    playlistCache.set(title, lookup);
  }
  return playlistCache.get(title);
}

// Shown once per quota error so a batch that fails on song 1 of 50 doesn't
// pop 50 identical alerts on its way to stopping.
function notifyQuotaExceeded() {
  alert(
    "The daily YouTube API quota has been reached. YouTube resets it around midnight " +
    "Pacific Time — please come back after that to keep adding songs."
  );
}

function searchQueryFor(index) {
  const artistStr = songs.artists[index].map((a) => a.name).join(" ");
  return `${songs.names[index]} - ${artistStr}`;
}

// Returns the song's previously-found YouTube match without spending a
// search call, or searches fresh (and caches the result) if this is the
// first time this Spotify track has ever been matched.
async function getOrSearchMatch(index) {
  const trackId = songs.trackIds[index];
  const cached  = getCachedMatch(trackId);
  if (cached) return cached;

  const match = await searchVideo(searchQueryFor(index));
  if (!match) return null;

  setCachedMatch(trackId, match);
  return match;
}

// Inserts the matched video into the playlist. If that fails for a reason
// other than quota/auth — most likely the cached match points at a video
// that's since been deleted, made private, or had its channel terminated —
// the stale cache entry is evicted and one fresh search + insert is
// attempted before giving up.
async function addVideoWithSelfHeal(index, playlist, match) {
  try {
    await addVideoToPlaylist(playlist.id, match.videoId, match.kind);
    return match;
  } catch (err) {
    if (err instanceof YouTubeQuotaError || err instanceof YouTubeAuthError) throw err;

    clearCachedMatch(songs.trackIds[index]);
    const fresh = await searchVideo(searchQueryFor(index));
    if (!fresh) throw err;

    await addVideoToPlaylist(playlist.id, fresh.videoId, fresh.kind);
    setCachedMatch(songs.trackIds[index], fresh);
    return fresh;
  }
}

// ─── Spotify OAuth Callback ───────────────────────────────────────────────────
// Module scripts are deferred, so the DOM is ready at this point.
// If Spotify just redirected back with an authorization code, handle it now.

const params = new URLSearchParams(window.location.search);
const code   = params.get("code");
const state  = params.get("state");

(async () => {
  // Restore any previously saved tokens before deciding what to show.
  loadPersistedAuth();
  if (auth.spotifyAccessToken) markConnected("spotify");
  if (auth.youtubeAccessToken) markConnected("youtube");
  checkBothConnected();

  if (code && state === "spotify") {
    // Remove the query string so refreshing the page doesn't re-attempt the exchange.
    window.history.replaceState({}, document.title, window.location.pathname);

    await exchangeSpotifyCode(code);
    sessionStorage.removeItem("spotify_code_verifier");
    if (auth.spotifyAccessToken) {
      await fetchSpotifyProfile();
      markConnected("spotify");
      checkBothConnected();
    }
  }

  // Both accounts already connected (just now, or restored from storage) —
  // skip straight to the song table instead of making the user click Initiate.
  if (auth.spotifyAccessToken && auth.youtubeAccessToken) {
    await initiate();
  }
})();

// ─── Core Flows ───────────────────────────────────────────────────────────────

async function initiate() {
  const btn = document.getElementById("initiateBtn");
  btn.textContent = "Loading...";
  btn.disabled    = true;

  const ok = await fetchAllTracks();
  if (!ok) {
    // A restored token can still be rejected by the API (e.g. revoked
    // server-side) even though it hadn't reached our stored expiry — treat
    // that the same as an explicit logout so the user can reconnect.
    logout();
    return;
  }

  document.getElementById("authSection").style.display = "none";

  document.getElementById("mainDiv").innerHTML = buildTableShell();
  populatePlaylistFilter(songs.playlists);

  matchingIndexes = songs.names.map((_, i) => i);
  currentPage     = 1;
  renderCurrentPage();

  showTopBar();
}

// Recomputes which songs match the current search/playlist filter and jumps
// back to page 1 — called whenever either filter input changes.
function refreshFilterAndRender() {
  const searchTerm   = document.getElementById("searchInput").value;
  const playlistTerm = document.getElementById("playlistFilter").value;

  matchingIndexes = getMatchingIndexes(songs, searchTerm, playlistTerm);
  currentPage     = 1;
  renderCurrentPage();
}

function renderCurrentPage() {
  renderPage(songs, matchingIndexes, currentPage, pageSize, addedMatches);
  renderPaginationControls(currentPage, matchingIndexes.length, pageSize);
}

function goToPage(delta) {
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(matchingIndexes.length / pageSize));
  currentPage = Math.min(Math.max(currentPage + delta, 1), totalPages);
  renderCurrentPage();
}

// Transfers every song matching the active search/playlist filter (across
// all pages, not just the one currently on screen) to a YouTube playlist
// that mirrors its Spotify playlist's name, reusing an existing YouTube
// playlist of that name (and skipping songs already in it) rather than
// creating a new one.
// Note: YouTube Data API v3 has a daily quota (~10,000 units). Each search costs
// ~100 units and each insert ~50 units, so large libraries may hit the limit early.
async function addAllToYouTube() {
  for (const i of matchingIndexes) {
    try {
      const playlist = await getPlaylistFor(songs.playlists[i]);

      const match = await getOrSearchMatch(i);
      if (!match) continue;

      if (playlist.videoIds.has(match.videoId)) {
        addedMatches.set(i, match);
        markSongAdded(i, match);
        continue;
      }

      const added = await addVideoWithSelfHeal(i, playlist, match);
      playlist.videoIds.add(added.videoId);
      addedMatches.set(i, added);
      markSongAdded(i, added);
    } catch (err) {
      if (err instanceof YouTubeQuotaError) {
        notifyQuotaExceeded();
        return; // stop the whole batch — every remaining song will fail the same way
      }
      if (err instanceof YouTubeAuthError) {
        alert("Your YouTube connection has expired. Please reconnect.");
        logout();
        return;
      }
      // One-off failure (network blip, unexpected API error) — log it and move
      // on to the next song rather than aborting the whole batch.
      console.error(`Failed to add "${songs.names[i]}" to YouTube:`, err);
    }
  }
}

// Adds a single song to the YouTube playlist matching its Spotify playlist's
// name (creating that playlist if it doesn't exist yet), notifying the user
// if it's already there instead of adding a duplicate.
async function addSongToYouTube(index) {
  const btn = document.getElementById(`addSongBtn-${index}`);
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const playlistName = songs.playlists[index];
    const playlist     = await getPlaylistFor(playlistName);

    const match = await getOrSearchMatch(index);

    if (!match) {
      alert(`Couldn't find a YouTube match for "${songs.names[index]}".`);
      btn.disabled = false;
      btn.textContent = "Add";
      return;
    }

    if (playlist.videoIds.has(match.videoId)) {
      alert(`"${songs.names[index]}" is already in the ${playlistName} playlist.`);
      addedMatches.set(index, match);
      markSongAdded(index, match);
      return;
    }

    const added = await addVideoWithSelfHeal(index, playlist, match);
    playlist.videoIds.add(added.videoId);
    addedMatches.set(index, added);
    markSongAdded(index, added);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Add";

    if (err instanceof YouTubeQuotaError) {
      notifyQuotaExceeded();
      return;
    }
    if (err instanceof YouTubeAuthError) {
      alert("Your YouTube connection has expired. Please reconnect.");
      logout();
      return;
    }

    console.error(`Failed to add "${songs.names[index]}" to YouTube:`, err);
    alert(`Something went wrong adding "${songs.names[index]}" — please try again.`);
  }
}

function logout() {
  clearPersistedAuth();

  songs.names = [];
  songs.artists = [];
  songs.playlists = [];
  songs.albums = [];
  songs.albumArts = [];
  songs.trackIds = [];
  playlistCache.clear();
  addedMatches.clear();
  matchingIndexes = [];
  currentPage     = 1;
  pageSize        = 100;
  // The video match cache is intentionally NOT cleared here — a Spotify
  // track's matched YouTube video isn't tied to which account is logged in,
  // so keeping it saves quota on the next login too.

  resetToAuthScreen();
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

document.getElementById("spotifyBtn").addEventListener("click", connectSpotify);

document.getElementById("youtubeBtn").addEventListener("click", () => {
  connectYouTube(() => {
    markConnected("youtube");
    checkBothConnected();
  });
});

document.getElementById("initiateBtn").addEventListener("click", initiate);

document.getElementById("logoutBtn").addEventListener("click", logout);

document.getElementById("searchInput").addEventListener("input", refreshFilterAndRender);
document.getElementById("playlistFilter").addEventListener("change", refreshFilterAndRender);

document.getElementById("pageSizeFilter").addEventListener("change", (e) => {
  pageSize    = e.target.value === "all" ? Infinity : Number(e.target.value);
  currentPage = 1;
  renderCurrentPage();
});

// The song table body is rebuilt on every page/filter change, so listen on
// the stable parent instead of binding to individual buttons.
document.getElementById("mainDiv").addEventListener("click", (e) => {
  if (e.target.id === "addToYoutubeBtn") {
    addAllToYouTube();
  } else if (e.target.matches(".add-song-btn")) {
    addSongToYouTube(Number(e.target.dataset.index));
  } else if (e.target.matches(".re-search-btn")) {
    const index = Number(e.target.dataset.index);
    clearCachedMatch(songs.trackIds[index]);
    addedMatches.delete(index);
    resetSongRow(index);
  } else if (e.target.id === "prevPageBtn") {
    goToPage(-1);
  } else if (e.target.id === "nextPageBtn") {
    goToPage(1);
  }
});
