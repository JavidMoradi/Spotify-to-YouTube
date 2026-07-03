#!/bin/sh
# Generates SpotifyToYoutube/config.js from environment variables at build
# time (set these as Cloudflare Pages project environment variables), so the
# real Spotify/Google Client IDs never need to be committed to git — config.js
# stays gitignored, same as it is for local development.
set -e

if [ -z "$SPOTIFY_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_ID" ]; then
  echo "Missing SPOTIFY_CLIENT_ID or GOOGLE_CLIENT_ID environment variable." >&2
  exit 1
fi

cat > SpotifyToYoutube/config.js <<EOF
// Generated at build time by generate-config.sh from Cloudflare Pages
// environment variables — do not edit directly, and do not commit this file.
export const SPOTIFY_CLIENT_ID = "${SPOTIFY_CLIENT_ID}";
export const GOOGLE_CLIENT_ID  = "${GOOGLE_CLIENT_ID}";

// Computed dynamically so no change is needed when the server URL changes.
// Strips a trailing "index.html" so the URI stays identical whether it's
// opened at ".../SpotifyToYoutube/" or ".../SpotifyToYoutube/index.html"
// — Spotify requires an exact string match against the registered Redirect URI.
export const SPOTIFY_REDIRECT_URI =
  window.location.origin + window.location.pathname.replace(/index\.html?$/, "");
EOF

echo "Wrote SpotifyToYoutube/config.js"
