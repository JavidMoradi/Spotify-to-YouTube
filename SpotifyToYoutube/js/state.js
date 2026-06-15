// Shared mutable state — imported directly by whichever module needs it.

export const auth = {
  spotifyAccessToken: null,
  spotifyUserID: null,
  youtubeAccessToken: null,
};

export const songs = {
  names: [],
  artists: [],      // each element is the raw Spotify artist-object array
  playlists: [],
  albumArts: [],
  youtubePlaylistId: "",
};
