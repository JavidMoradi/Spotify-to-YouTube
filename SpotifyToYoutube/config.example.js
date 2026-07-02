// Copy this file to config.js and fill in your own Client IDs before running.
// See README.md for instructions on obtaining each value.
export const SPOTIFY_CLIENT_ID = "your_spotify_client_id_here";
export const GOOGLE_CLIENT_ID  = "your_google_client_id_here";

// Computed dynamically so no change is needed when the server URL changes.
// Strips a trailing "index.html" so the URI stays identical whether Live
// Server opens at ".../SpotifyToYoutube/" or ".../SpotifyToYoutube/index.html"
// — Spotify requires an exact string match against the registered Redirect URI.
export const SPOTIFY_REDIRECT_URI =
  window.location.origin + window.location.pathname.replace(/index\.html?$/, "");
