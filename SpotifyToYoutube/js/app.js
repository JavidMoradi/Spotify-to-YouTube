import {
  auth, songs, loadPersistedAuth, clearPersistedAuth,
  persistLibrary, loadPersistedLibrary, clearPersistedLibrary,
} from './state.js';
import { connectSpotify, exchangeSpotifyCode, fetchSpotifyProfile } from './spotifyClient.js';
import { connectYouTube } from './youtubeClient.js';
import {
  setDirection, currentSourceLabel, currentSourceFetcher, currentSourceKey, currentDestinationLabel,
  addedMatches, addAllToDestination, addSongToDestination, forgetMatch, resetTransferState,
} from './transfer.js';
import {
  markConnected, checkBothConnected, showAppScreen, showAuthScreen, resetToAuthScreen,
  resetSongRow, populatePlaylistFilter, setSourceDirection, lockDirectionToggle,
  getMatchingIndexes, buildLibraryShell, renderPage, renderPaginationControls,
  initTheme, toggleTheme, startLoadingTimeout, cancelLoadingTimeout, showLoadingTimeoutMessage,
} from './ui.js';

initTheme();
document.getElementById("themeToggle").addEventListener("click", toggleTheme);

let matchingIndexes = []; // song indexes matching the current search/playlist filter
let currentPage     = 1;
let pageSize        = 100; // 50 / 100 / 200, or Infinity for "All"
let cancelStartup   = false; // set by the loading-timeout escape hatch, checked by initiate()

// Escape hatch shown on the loading screen if startup is taking a while (or
// fails outright) — lets the user bail out and reconnect instead of staring
// at a spinner forever.
document.getElementById("loadingTimeoutLink").addEventListener("click", (e) => {
  e.preventDefault();
  cancelStartup = true;
  cancelLoadingTimeout();
  logout();
});

// ─── Spotify OAuth Callback ───────────────────────────────────────────────────
// Module scripts are deferred, so the DOM is ready at this point.
// If Spotify just redirected back with an authorization code, handle it now.

const params = new URLSearchParams(window.location.search);
const code   = params.get("code");
const state  = params.get("state");

(async () => {
  // Shown by default (see #loadingScreen in index.html) until this resolves
  // one way or the other — reveals the escape-hatch message if that takes
  // more than a few seconds, so a hung request never leaves the user staring
  // at a bare spinner with no way out.
  startLoadingTimeout();

  try {
    // Restore any previously saved tokens before deciding what to show.
    loadPersistedAuth();
    // Reflect the restored transfer direction in the header toggle immediately —
    // otherwise it would visually default to "Spotify" while initiate() (below)
    // silently uses whichever direction was actually last selected.
    setSourceDirection(currentSourceKey());
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
    // skip straight to the song table instead of making the user click Initiate,
    // and (crucially) without ever showing the auth screen in between.
    if (auth.spotifyAccessToken && auth.youtubeAccessToken) {
      await initiate();
    } else {
      cancelLoadingTimeout();
      showAuthScreen();
    }
  } catch (err) {
    // Something in startup itself broke (not a normal, already-handled API
    // failure) — surface the escape hatch immediately rather than making
    // the user wait out the full timeout to discover they're stuck.
    console.error("Startup failed:", err);
    showLoadingTimeoutMessage();
  }
})();

// ─── Core Flows ───────────────────────────────────────────────────────────────

async function initiate() {
  cancelStartup = false;

  const btn = document.getElementById("initiateBtn");
  btn.innerHTML   = '<span class="spinner" aria-hidden="true"></span>';
  btn.setAttribute("aria-busy", "true");
  btn.disabled    = true;
  lockDirectionToggle();

  // A page refresh re-runs this (see the IIFE above) with auth already
  // restored — reuse the library already fetched this tab session instead
  // of silently re-listing every playlist and track again. Keyed by
  // direction so switching source correctly falls through to a fresh fetch.
  const restoredFromSession = loadPersistedLibrary(currentSourceKey());

  if (!restoredFromSession) {
    const ok = await currentSourceFetcher()();
    // The loading-timeout escape hatch was clicked while this was in
    // flight — the user has already been sent back to the auth screen, so
    // don't let a late-arriving response pull them back into the app screen.
    if (cancelStartup) return;
    if (!ok) {
      // A restored token can still be rejected by the API (e.g. revoked
      // server-side) even though it hadn't reached our stored expiry — treat
      // that the same as an explicit logout so the user can reconnect.
      logout();
      return;
    }
    persistLibrary(currentSourceKey());
  }

  if (cancelStartup) return;
  cancelLoadingTimeout();

  document.getElementById("mainDiv").innerHTML = buildLibraryShell(currentDestinationLabel());
  populatePlaylistFilter(songs.playlists);

  matchingIndexes = songs.names.map((_, i) => i);
  currentPage     = 1;
  renderCurrentPage();

  if (currentSourceKey() === "youtube")
    showAppScreen(`${currentSourceLabel()} → ${currentDestinationLabel()}<sup style="color:#999;font-size:0.65em;"> \u0020Beta</sup>`);
  else 
    showAppScreen(`${currentSourceLabel()} → ${currentDestinationLabel()}`);
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

function logout() {
  clearPersistedAuth();
  clearPersistedLibrary();

  songs.names = [];
  songs.artists = [];
  songs.playlists = [];
  songs.albums = [];
  songs.albumArts = [];
  songs.trackIds = [];
  resetTransferState();
  matchingIndexes = [];
  currentPage     = 1;
  pageSize        = 100;

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

document.getElementById("sourceSpotifyBtn").addEventListener("click", () => {
  setDirection("spotify-to-youtube");
  setSourceDirection("spotify");
});

document.getElementById("sourceYoutubeBtn").addEventListener("click", () => {
  setDirection("youtube-to-spotify");
  setSourceDirection("youtube");
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
  if (e.target.id === "addAllBtn") {
    addAllToDestination(matchingIndexes, logout);
  } else if (e.target.matches(".add-song-btn")) {
    addSongToDestination(Number(e.target.dataset.index), logout);
  } else if (e.target.matches(".re-search-btn")) {
    const index = Number(e.target.dataset.index);
    forgetMatch(index);
    resetSongRow(index);
  } else if (e.target.id === "prevPageBtn") {
    goToPage(-1);
  } else if (e.target.id === "nextPageBtn") {
    goToPage(1);
  } else if (e.target.id === "backToTopBtn") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});
