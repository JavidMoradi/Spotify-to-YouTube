// Direction-agnostic transfer logic — the only place that branches on which
// service is the source vs. the destination. Everything here is written
// once and works for both "spotify-to-youtube" and "youtube-to-spotify".

import { songs, getCachedMatch, setCachedMatch, clearCachedMatch } from './state.js';
import { fetchAllTracks } from './spotifySource.js';
import { ensureSpotifyPlaylist, searchSpotifyTrack, addTrackToSpotifyPlaylist } from './spotifyDestination.js';
import { SpotifyAuthError } from './spotifyClient.js';
import { fetchAllYouTubePlaylists } from './youtubeSource.js';
import { ensureYouTubePlaylist, searchVideo, addVideoToPlaylist } from './youtubeDestination.js';
import { YouTubeQuotaError, YouTubeAuthError } from './youtubeClient.js';
import { markSongAdded } from './ui.js';

// "spotify-to-youtube" (default) or "youtube-to-spotify" — set by the
// Spotify/Youtube toggle in the header, locked once Initiate is clicked.
// Persisted (like auth) so a page refresh that restores an existing session
// resumes the same direction instead of silently falling back to the default.
const DIRECTION_STORAGE_KEY = "s2y_direction";

function loadPersistedDirection() {
  return localStorage.getItem(DIRECTION_STORAGE_KEY) === "youtube-to-spotify"
    ? "youtube-to-spotify"
    : "spotify-to-youtube";
}

let direction = loadPersistedDirection();

export function setDirection(newDirection) {
  direction = newDirection;
  localStorage.setItem(DIRECTION_STORAGE_KEY, direction);
}

export function currentSourceLabel() {
  return direction === "spotify-to-youtube" ? "Spotify" : "Youtube";
}

// "spotify" or "youtube" — the source half of the current direction, for
// syncing the header toggle's visual active state (e.g. right after
// restoring a persisted direction on page load, before Initiate runs).
export function currentSourceKey() {
  return direction === "spotify-to-youtube" ? "spotify" : "youtube";
}

export function currentSourceFetcher() {
  return direction === "spotify-to-youtube" ? fetchAllTracks : fetchAllYouTubePlaylists;
}

// Each direction reuses the same add-flow logic against a different pair of
// service calls — this adapter is the only per-service branching needed.
const destinations = {
  youtube: {
    label:          "YouTube",
    ensurePlaylist: ensureYouTubePlaylist,
    existingIds:    (playlist) => playlist.videoIds,
    search:         searchVideo,
    matchKey:       (match) => match.videoId,
    insert:         (playlistId, match) => addVideoToPlaylist(playlistId, match.videoId, match.kind),
    viewUrl:        (match) => `https://www.youtube.com/watch?v=${encodeURIComponent(match.videoId)}`,
    isQuotaError:   (err) => err instanceof YouTubeQuotaError,
    isAuthError:    (err) => err instanceof YouTubeAuthError,
  },
  spotify: {
    label:          "Spotify",
    ensurePlaylist: ensureSpotifyPlaylist,
    existingIds:    (playlist) => playlist.uris,
    search:         searchSpotifyTrack,
    matchKey:       (match) => match.uri,
    insert:         (playlistId, match) => addTrackToSpotifyPlaylist(playlistId, match.uri),
    viewUrl:        (match) => `https://open.spotify.com/track/${match.uri.split(":").pop()}`,
    isQuotaError:   () => false, // Spotify has no hard daily quota, only a rolling rate limit (already retried)
    isAuthError:    (err) => err instanceof SpotifyAuthError,
  },
};

function currentDestination() {
  return direction === "spotify-to-youtube" ? destinations.youtube : destinations.spotify;
}

export function currentDestinationLabel() {
  return currentDestination().label;
}

// Mirrors each source playlist to a same-named playlist on the destination
// service rather than dumping every song into one — e.g. a song from "XYZ"
// goes into a destination playlist also named "XYZ" (reusing it if the user
// already has one). Resolves playlist title -> Promise<{ id, <existingIds> }>,
// cached so each title is only looked up/created once per session.
const playlistCache = new Map();

function getPlaylistFor(title) {
  if (!playlistCache.has(title)) {
    // Don't let a failed lookup permanently poison the cache for this title —
    // a later retry (e.g. after a transient network error) should get a fresh attempt.
    const lookup = currentDestination().ensurePlaylist(title).catch((err) => {
      playlistCache.delete(title);
      throw err;
    });
    playlistCache.set(title, lookup);
  }
  return playlistCache.get(title);
}

// Shown once per quota error so a batch that fails on song 1 of 50 doesn't
// pop 50 identical alerts on its way to stopping. Only YouTube has this
// failure mode (Spotify has no hard daily quota).
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

// The match cache is shared by both directions and survives logout (see
// state.js), so cache keys are prefixed with direction — a Spotify track id
// and a YouTube video id are different formats and won't collide in
// practice, but the prefix also keeps a song's YouTube match and its Spotify
// match cleanly separate if it's ever transferred both ways.
function matchCacheKey(index) {
  return `${direction}:${songs.trackIds[index]}`;
}

// Returns the song's previously-found destination match without spending a
// search call, or searches fresh (and caches the result) if this is the
// first time this song has ever been matched in this direction.
async function getOrSearchMatch(index) {
  const cacheKey = matchCacheKey(index);
  const cached   = getCachedMatch(cacheKey);
  if (cached) return cached;

  const match = await currentDestination().search(searchQueryFor(index));
  if (!match) return null;

  setCachedMatch(cacheKey, match);
  return match;
}

// Inserts the matched song into the destination playlist. If that fails for
// a reason other than quota/auth — most likely the cached match points at
// something that's since been removed (a deleted/private YouTube video, or
// a Spotify track pulled from the catalog) — the stale cache entry is
// evicted and one fresh search + insert is attempted before giving up.
async function insertWithSelfHeal(index, playlist, match) {
  const dest = currentDestination();
  try {
    await dest.insert(playlist.id, match);
    return match;
  } catch (err) {
    if (dest.isQuotaError(err) || dest.isAuthError(err)) throw err;

    const cacheKey = matchCacheKey(index);
    clearCachedMatch(cacheKey);
    const fresh = await dest.search(searchQueryFor(index));
    if (!fresh) throw err;

    await dest.insert(playlist.id, fresh);
    setCachedMatch(cacheKey, fresh);
    return fresh;
  }
}

// index -> { match, matchUrl }, remembered across page navigation for the
// current session (so pagination doesn't "forget" a song was added).
export const addedMatches = new Map();

function recordAdded(index, match, dest) {
  const matchUrl = dest.viewUrl(match);
  addedMatches.set(index, { match, matchUrl });
  markSongAdded(index, match, matchUrl);
}

// Discards a song's cached match (used by the "Re-search" control) so the
// next Add attempt searches fresh instead of reusing a wrong match.
export function forgetMatch(index) {
  clearCachedMatch(matchCacheKey(index));
  addedMatches.delete(index);
}

// Transfers every song matching the active search/playlist filter (across
// all pages, not just the one currently on screen) to a destination
// playlist that mirrors its source playlist's name, reusing an existing
// destination playlist of that name (and skipping songs already in it)
// rather than creating a new one. `onAuthExpired` is called (instead of
// this module depending on app.js directly) if the destination's
// credentials turn out to be invalid.
// Note: YouTube Data API v3 has a daily quota (~10,000 units). Each search costs
// ~100 units and each insert ~50 units, so large libraries may hit the limit early
// when YouTube is the destination. Spotify has no equivalent hard quota.
export async function addAllToDestination(matchingIndexes, onAuthExpired) {
  const dest = currentDestination();

  for (const i of matchingIndexes) {
    try {
      const playlist = await getPlaylistFor(songs.playlists[i]);

      const match = await getOrSearchMatch(i);
      if (!match) continue;

      const existingIds = dest.existingIds(playlist);
      if (existingIds.has(dest.matchKey(match))) {
        recordAdded(i, match, dest);
        continue;
      }

      const added = await insertWithSelfHeal(i, playlist, match);
      existingIds.add(dest.matchKey(added));
      recordAdded(i, added, dest);
    } catch (err) {
      if (dest.isQuotaError(err)) {
        notifyQuotaExceeded();
        return; // stop the whole batch — every remaining song will fail the same way
      }
      if (dest.isAuthError(err)) {
        alert(`Your ${dest.label} connection has expired. Please reconnect.`);
        onAuthExpired();
        return;
      }
      // One-off failure (network blip, unexpected API error) — log it and move
      // on to the next song rather than aborting the whole batch.
      console.error(`Failed to add "${songs.names[i]}":`, err);
    }
  }
}

// Adds a single song to the destination playlist matching its source
// playlist's name (creating that playlist if it doesn't exist yet),
// notifying the user if it's already there instead of adding a duplicate.
export async function addSongToDestination(index, onAuthExpired) {
  const dest = currentDestination();
  const btn  = document.getElementById(`addSongBtn-${index}`);
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const playlistName = songs.playlists[index];
    const playlist      = await getPlaylistFor(playlistName);

    const match = await getOrSearchMatch(index);

    if (!match) {
      alert(`Couldn't find a match for "${songs.names[index]}" on ${dest.label}.`);
      btn.disabled = false;
      btn.textContent = "Add";
      return;
    }

    const existingIds = dest.existingIds(playlist);
    if (existingIds.has(dest.matchKey(match))) {
      alert(`"${songs.names[index]}" is already in the ${playlistName} playlist on ${dest.label}.`);
      recordAdded(index, match, dest);
      return;
    }

    const added = await insertWithSelfHeal(index, playlist, match);
    existingIds.add(dest.matchKey(added));
    recordAdded(index, added, dest);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Add";

    if (dest.isQuotaError(err)) {
      notifyQuotaExceeded();
      return;
    }
    if (dest.isAuthError(err)) {
      alert(`Your ${dest.label} connection has expired. Please reconnect.`);
      onAuthExpired();
      return;
    }

    console.error(`Failed to add "${songs.names[index]}":`, err);
    alert(`Something went wrong adding "${songs.names[index]}" — please try again.`);
  }
}

// Clears all in-session transfer state — called on logout. The match cache
// itself is NOT cleared (see state.js) since it isn't account-specific.
export function resetTransferState() {
  playlistCache.clear();
  addedMatches.clear();
  setDirection("spotify-to-youtube"); // also persists the reset, not just the in-memory default
}
