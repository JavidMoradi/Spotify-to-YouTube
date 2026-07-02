// Shared mutable state — imported directly by whichever module needs it.

// Fallback shown for songs missing cover art (a Spotify track with no album
// image, or a YouTube video with no retrievable thumbnail) — sized to match
// the smallest images either service provides.
export const PLACEHOLDER_ALBUM_ART = "https://placehold.co/64x64?text=No+Image";

export const auth = {
  spotifyAccessToken: null,
  spotifyUserID: null,
  spotifyTokenExpiry: null,
  youtubeAccessToken: null,
  youtubeTokenExpiry: null,
};

export const songs = {
  names: [],
  artists: [],      // each element is the raw Spotify artist-object array
  playlists: [],    // Spotify playlist name each song belongs to
  albums: [],       // album name each song belongs to
  albumArts: [],
  trackIds: [],     // source service's unique id for the song (Spotify track id, or YouTube video id) — key used for the match cache below
};

// ─── Auth Persistence ───────────────────────────────────────────────────────
// Tokens are kept in localStorage (rather than sessionStorage) so a page
// refresh or a closed tab doesn't force the user to reconnect — only an
// explicit logout or actual token expiry does.

const STORAGE_KEY = "s2y_auth";

export function persistAuth() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

// Restores any saved tokens that haven't expired yet. Expired or missing
// fields are simply left as null, so the caller can tell what still needs
// to be (re)connected.
export function loadPersistedAuth() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const now = Date.now();

  if (saved.spotifyAccessToken && saved.spotifyTokenExpiry > now) {
    auth.spotifyAccessToken = saved.spotifyAccessToken;
    auth.spotifyUserID      = saved.spotifyUserID;
    auth.spotifyTokenExpiry = saved.spotifyTokenExpiry;
  }

  if (saved.youtubeAccessToken && saved.youtubeTokenExpiry > now) {
    auth.youtubeAccessToken = saved.youtubeAccessToken;
    auth.youtubeTokenExpiry = saved.youtubeTokenExpiry;
  }

  persistAuth(); // drop any expired fields that weren't copied over
}

export function clearPersistedAuth() {
  localStorage.removeItem(STORAGE_KEY);
  auth.spotifyAccessToken = null;
  auth.spotifyUserID      = null;
  auth.spotifyTokenExpiry = null;
  auth.youtubeAccessToken = null;
  auth.youtubeTokenExpiry = null;
}

// ─── Match Cache ──────────────────────────────────────────────────────────────
// Once a song has been resolved to a match on the destination service, the
// match is cached here by a cache key built from the source id (see
// getOrSearchMatch in app.js) so a later "Add All" doesn't re-spend a search
// call re-finding something it already knows about. This is a song-to-match
// fact, not account-specific state, so — unlike auth — it deliberately
// survives logout, and works the same regardless of transfer direction.
const MATCH_CACHE_KEY = "s2y_video_matches";

let matchCache = loadMatchCacheFromStorage();

function loadMatchCacheFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(MATCH_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function persistMatchCache() {
  localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify(matchCache));
}

export function getCachedMatch(trackId) {
  return trackId ? matchCache[trackId] || null : null;
}

export function setCachedMatch(trackId, match) {
  if (!trackId) return;
  matchCache[trackId] = match;
  persistMatchCache();
}

export function clearCachedMatch(trackId) {
  if (!trackId) return;
  delete matchCache[trackId];
  persistMatchCache();
}
