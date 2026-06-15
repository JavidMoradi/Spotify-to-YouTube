import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } from '../config.js';
import { auth, songs } from './state.js';

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(length = 128) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function generateCodeChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Redirects the browser to Spotify's authorization page.
export async function connectSpotify() {
  const verifier  = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  // Persist the verifier so it survives the redirect round-trip.
  sessionStorage.setItem("spotify_code_verifier", verifier);

  const params = new URLSearchParams({
    client_id:             SPOTIFY_CLIENT_ID,
    response_type:         "code",
    redirect_uri:          SPOTIFY_REDIRECT_URI,
    scope:                 "user-read-private playlist-read-private playlist-read-collaborative",
    code_challenge_method: "S256",
    code_challenge:        challenge,
    state:                 "spotify",
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

// Exchanges the one-time auth code for an access token and stores it in auth.
export async function exchangeSpotifyCode(code) {
  const verifier = sessionStorage.getItem("spotify_code_verifier");
  const res      = await fetch("https://accounts.spotify.com/api/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      redirect_uri:  SPOTIFY_REDIRECT_URI,
      client_id:     SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Spotify returned a non-JSON body — log the raw response to help diagnose the cause.
    console.error("Spotify token exchange failed. Raw response:", text);
    console.error("Redirect URI sent:", SPOTIFY_REDIRECT_URI);
    alert("Spotify connection failed. Check the browser console for details.");
    return;
  }

  if (data.error) {
    console.error("Spotify token exchange error:", data.error, "-", data.error_description);
    alert(`Spotify error: ${data.error_description || data.error}`);
    return;
  }

  auth.spotifyAccessToken = data.access_token;
}

// Fetches the authenticated user's profile and stores their ID in auth.
export async function fetchSpotifyProfile() {
  const res     = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${auth.spotifyAccessToken}` },
  });
  const profile = await res.json();
  auth.spotifyUserID = profile.id;
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

// Loads all playlists and their tracks into the songs state object.
// Returns false if the API call fails (e.g. expired token).
export async function fetchAllTracks() {
  const res  = await fetch(
    `https://api.spotify.com/v1/users/${auth.spotifyUserID}/playlists`,
    { headers: { Authorization: `Bearer ${auth.spotifyAccessToken}` } }
  );
  const data = await res.json();

  if (!data.items) {
    alert("Failed to load Spotify playlists. Your token may have expired — please reconnect.");
    return false;
  }

  for (const playlist of data.items) {
    const tracksRes  = await fetch(playlist.tracks.href, {
      headers: { Authorization: `Bearer ${auth.spotifyAccessToken}` },
    });
    const tracksData = await tracksRes.json();

    for (const item of tracksData.items) {
      // track can be null if the song was removed from Spotify since it was saved.
      if (!item.track) continue;

      songs.names.push(item.track.name);
      songs.artists.push(item.track.artists);
      songs.playlists.push(playlist.name);

      // Spotify provides images at 640, 300, and 64 px — use the smallest for thumbnails.
      const images = item.track.album.images;
      songs.albumArts.push(images.length > 0 ? images[images.length - 1].url : null);
    }
  }

  return true;
}
