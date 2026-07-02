// Writing to YouTube (YouTube as transfer destination).

import { auth } from './state.js';
import { throwIfApiError, fetchAllYouTubeItems } from './youtubeClient.js';
import { normalizeTitle } from './textMatch.js';

// Creates a new private YouTube playlist and returns its ID.
async function createYouTubePlaylist(title) {
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
  const playlists = await fetchAllYouTubeItems(
    "https://youtube.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50"
  );
  const match = playlists.find((p) => p.snippet.title === title);
  return match ? match.id : null;
}

// Returns everything already in a playlist needed for duplicate detection:
// exact video ids, plus normalized titles (see textMatch.js) so a song
// present under a *different* video — added manually, or matched by an
// earlier/different search — is still caught even when the id doesn't match.
async function fetchPlaylistContents(playlistId) {
  const items = await fetchAllYouTubeItems(
    `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}`
  );

  const videoIds = new Set();
  const titles   = new Set();

  items.forEach((item) => {
    videoIds.add(item.snippet.resourceId.videoId);
    titles.add(normalizeTitle(item.snippet.title));
  });

  return { videoIds, titles };
}

// Finds the user's "Spotify to Youtube" playlist (creating it if it doesn't
// exist yet) and returns its id along with what it already contains, so
// callers can detect and skip duplicates before adding.
export async function ensureYouTubePlaylist(title = "Spotify to Youtube") {
  let playlistId = await findPlaylistByTitle(title);
  if (!playlistId) {
    playlistId = await createYouTubePlaylist(title);
  }

  const { videoIds, titles } = await fetchPlaylistContents(playlistId);
  return { id: playlistId, videoIds, titles };
}
