// Reading from Spotify (Spotify as transfer source).

import { auth, songs, PLACEHOLDER_ALBUM_ART } from './state.js';
import { fetchAllPages } from './spotifyClient.js';
import { showToast } from './toast.js';

// Loads all playlists and their tracks into the songs state object.
// Returns false if the API call fails (e.g. expired token).
export async function fetchAllTracks() {
  const playlists = await fetchAllPages(
    `https://api.spotify.com/v1/users/${auth.spotifyUserID}/playlists?limit=50`
  );

  if (!playlists) {
    showToast("Failed to load Spotify playlists. Your token may have expired — please reconnect.");
    return false;
  }

  for (const playlist of playlists) {
    const tracks = await fetchAllPages(`${playlist.tracks.href}?limit=100`);
    if (!tracks) continue;

    for (const item of tracks) {
      // track can be null if the song was removed from Spotify since it was
      // saved, and a missing name leaves nothing to search/display or match
      // against the destination service — skip both rather than showing a
      // placeholder row.
      if (!item.track || !item.track.name) continue;

      songs.names.push(item.track.name);
      songs.trackIds.push(item.track.id || null);

      // Local files or otherwise incomplete tracks can carry an empty artist list.
      const artists = item.track.artists && item.track.artists.length > 0
        ? item.track.artists
        : [{ name: "Unknown Artist" }];
      songs.artists.push(artists);

      songs.playlists.push(playlist.name || "Not Found");
      songs.albums.push(item.track.album?.name || "Not Found");

      // Spotify provides images at 640, 300, and 64 px — use the smallest for thumbnails.
      const images = item.track.album?.images;
      songs.albumArts.push(
        images && images.length > 0 ? images[images.length - 1].url : PLACEHOLDER_ALBUM_ART
      );
    }
  }

  return true;
}
