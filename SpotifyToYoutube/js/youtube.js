import { GOOGLE_CLIENT_ID } from '../config.js';
import { auth, songs, persistAuth } from './state.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

// Thrown when YouTube reports the daily quota (or a short-term rate limit)
// has been exhausted — callers should stop retrying and tell the user to
// come back once it resets, rather than treating it as "no result found".
export class YouTubeQuotaError extends Error {}

// Thrown when the stored YouTube access token has been rejected — callers
// should prompt the user to reconnect rather than continuing.
export class YouTubeAuthError extends Error {}

const QUOTA_ERROR_REASONS = new Set([
  "quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded",
]);

// Inspects a parsed YouTube API response for an error payload and throws a
// typed error so callers can react appropriately instead of treating an API
// failure the same as a legitimate empty result.
function throwIfApiError(data, res) {
  if (!data.error) return;

  const reason = data.error.errors?.[0]?.reason || "";

  if (res.status === 401 || reason === "authError") {
    throw new YouTubeAuthError(data.error.message || "YouTube authorization expired.");
  }
  if (QUOTA_ERROR_REASONS.has(reason)) {
    throw new YouTubeQuotaError(data.error.message || "YouTube API quota exceeded.");
  }

  throw new Error(data.error.message || "YouTube API request failed.");
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Opens the GIS popup and stores the access token in auth on success.
// onSuccess is called after the token is stored so the caller can update the UI.
export function connectYouTube(onSuccess) {
  // GIS loads asynchronously — guard against clicking the button before it's ready.
  if (typeof google === "undefined") {
    alert("Google services are still loading. Please try again in a moment.");
    return;
  }

  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope:     "https://www.googleapis.com/auth/youtube",
    callback:  (response) => {
      if (response.error) return;
      auth.youtubeAccessToken = response.access_token;
      auth.youtubeTokenExpiry = Date.now() + response.expires_in * 1000;
      persistAuth();
      onSuccess();
    },
  });

  tokenClient.requestAccessToken();
}

// ─── API Calls ────────────────────────────────────────────────────────────────

// Creates a new private YouTube playlist and returns its ID.
export async function createYouTubePlaylist(title = "Spotify to Youtube") {
  const res  = await fetch(
    "https://youtube.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      method:  "POST",
      headers: {
        Accept:         "application/json",
        "Content-Type": "application/json",
        Authorization:  `Bearer ${auth.youtubeAccessToken}`,
      },
      body: JSON.stringify({
        snippet: { title },
        status:  { privacyStatus: "private" },
      }),
    }
  );
  const data = await res.json();
  throwIfApiError(data, res);
  return data.id;
}

// Searches YouTube for a query and returns the top result as { kind, videoId, title },
// or null if no results were found. The title rides along so the UI can show
// what was actually matched, letting a wrong match (e.g. a cover outranking
// the original) be spotted instead of trusted blindly.
export async function searchVideo(query) {
  const res  = await fetch(
    `https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${auth.youtubeAccessToken}` } }
  );
  const data = await res.json();
  throwIfApiError(data, res);

  if (!data.items || data.items.length === 0) return null;

  const { id, snippet } = data.items[0];
  return { ...id, title: snippet?.title || "" };
}

// Inserts a video into a YouTube playlist.
export async function addVideoToPlaylist(playlistId, videoId, kind) {
  const res  = await fetch("https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${auth.youtubeAccessToken}`,
      Accept:         "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { videoId, kind },
      },
    }),
  });
  const data = await res.json();
  throwIfApiError(data, res);
}

// Returns the id of the user's own playlist with the given title, or null
// if none exists yet — used so repeated runs reuse the same playlist
// instead of creating a duplicate each time.
async function findPlaylistByTitle(title) {
  const res  = await fetch(
    "https://youtube.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50",
    { headers: { Accept: "application/json", Authorization: `Bearer ${auth.youtubeAccessToken}` } }
  );
  const data  = await res.json();
  throwIfApiError(data, res);

  const match = (data.items || []).find((p) => p.snippet.title === title);
  return match ? match.id : null;
}

// Returns the set of video IDs already present in a playlist, paginating
// through all pages of results.
async function fetchPlaylistVideoIds(playlistId) {
  const videoIds = new Set();
  let pageToken  = "";

  do {
    const res  = await fetch(
      `https://youtube.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${playlistId}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${auth.youtubeAccessToken}` } }
    );
    const data = await res.json();
    throwIfApiError(data, res);

    (data.items || []).forEach((item) => videoIds.add(item.contentDetails.videoId));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return videoIds;
}

// Finds the user's "Spotify to Youtube" playlist (creating it if it doesn't
// exist yet) and returns its id along with the video IDs it already
// contains, so callers can detect and skip duplicates before adding.
export async function ensureYouTubePlaylist(title = "Spotify to Youtube") {
  let playlistId = await findPlaylistByTitle(title);
  if (!playlistId) {
    playlistId = await createYouTubePlaylist(title);
  }

  const videoIds = await fetchPlaylistVideoIds(playlistId);
  return { id: playlistId, videoIds };
}
