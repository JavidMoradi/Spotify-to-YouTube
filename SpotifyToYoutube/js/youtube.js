import { GOOGLE_CLIENT_ID } from '../config.js';
import { auth, songs } from './state.js';

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
  return data.id;
}

// Searches YouTube for a query and returns the top result's id object { kind, videoId },
// or null if no results were found.
export async function searchVideo(query) {
  const res  = await fetch(
    `https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${auth.youtubeAccessToken}` } }
  );
  const data = await res.json();

  // items can be missing entirely when the daily quota is exceeded.
  if (!data.items || data.items.length === 0) return null;

  return data.items[0].id;
}

// Inserts a video into a YouTube playlist.
export async function addVideoToPlaylist(playlistId, videoId, kind) {
  await fetch("https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet", {
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
}
