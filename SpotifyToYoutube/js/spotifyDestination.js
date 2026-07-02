// Writing to Spotify (Spotify as transfer destination). Mirrors
// youtubeDestination.js's ensureYouTubePlaylist / searchVideo /
// addVideoToPlaylist for the reverse direction (YouTube -> Spotify).

import { auth } from './state.js';
import { fetchWithRetry, fetchAllPages, throwIfApiError } from './spotifyClient.js';
import { normalizeTitle } from './textMatch.js';

// Returns the id of the user's own playlist with the given name, or null if
// none exists yet. Filtered to playlists the user actually owns — /me/playlists
// also includes playlists they merely follow, which shouldn't be written into.
async function findSpotifyPlaylistByTitle(title) {
  const playlists = await fetchAllPages("https://api.spotify.com/v1/me/playlists?limit=50");
  if (!playlists) return null;

  const match = playlists.find((p) => p.name === title && p.owner?.id === auth.spotifyUserID);
  return match ? match.id : null;
}

// Creates a new private Spotify playlist and returns its id. Doesn't retry
// on a bare network error (only on 429) — unlike a GET, a lost response
// here doesn't mean the request failed, only that we didn't hear back, and
// retrying blindly risks creating two identically-named playlists.
async function createSpotifyPlaylist(title) {
  const res  = await fetchWithRetry(
    `https://api.spotify.com/v1/users/${auth.spotifyUserID}/playlists`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${auth.spotifyAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: title, public: false }),
    },
    { retryOnNetworkError: false }
  );
  const data = await res.json();
  throwIfApiError(data, res);
  return data.id;
}

// Returns everything already in a playlist needed for duplicate detection:
// exact track uris, plus normalized "name artists" titles (see textMatch.js)
// so a song present under a *different* track — a different release, or a
// version added manually or by an earlier/different search — is still
// caught even when the uri doesn't match. Paginates through all results.
async function fetchSpotifyPlaylistContents(playlistId) {
  const items = await fetchAllPages(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(uri,name,artists(name))),next&limit=100`
  );
  const uris   = new Set();
  const titles = new Set();
  if (!items) return { uris, titles };

  items.forEach((item) => {
    if (!item.track) return;
    uris.add(item.track.uri);
    const artistNames = item.track.artists.map((a) => a.name).join(" ");
    titles.add(normalizeTitle(`${item.track.name} ${artistNames}`));
  });

  return { uris, titles };
}

// Finds the user's Spotify playlist matching `title` (creating it if it
// doesn't exist) and returns its id along with what it already contains, so
// callers can detect and skip duplicates before adding.
export async function ensureSpotifyPlaylist(title) {
  let playlistId = await findSpotifyPlaylistByTitle(title);
  if (!playlistId) {
    playlistId = await createSpotifyPlaylist(title);
  }

  const { uris, titles } = await fetchSpotifyPlaylistContents(playlistId);
  return { id: playlistId, uris, titles };
}

// Searches Spotify for a track and returns { uri, title } for the top
// result, or null if nothing was found. The title rides along so the UI can
// show what was actually matched, same as searchVideo does for YouTube.
export async function searchSpotifyTrack(query) {
  const res  = await fetchWithRetry(
    `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${auth.spotifyAccessToken}` } }
  );
  const data = await res.json();
  throwIfApiError(data, res);

  const track = data.tracks?.items?.[0];
  if (!track) return null;

  const artistNames = track.artists.map((a) => a.name).join(", ");
  return { uri: track.uri, title: `${track.name} - ${artistNames}` };
}

// Adds a track to a Spotify playlist. Doesn't retry on a bare network error
// (only on 429) — see createSpotifyPlaylist above for why: a lost response
// after a successful insert would otherwise cause a blind retry to append
// the same track a second time.
export async function addTrackToSpotifyPlaylist(playlistId, uri) {
  const res  = await fetchWithRetry(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${auth.spotifyAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [uri] }),
    },
    { retryOnNetworkError: false }
  );
  const data = await res.json();
  throwIfApiError(data, res);
}
