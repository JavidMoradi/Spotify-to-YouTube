import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } from '../config.js';
import { auth, songs, persistAuth } from './state.js';

// Fallback shown for tracks missing an album cover — sized to match the
// smallest Spotify art (64px) since that's what's used for thumbnails.
const PLACEHOLDER_ALBUM_ART = "https://placehold.co/64x64?text=No+Image";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Spotify has no fixed daily quota — instead it enforces a short rolling
// rate limit and responds with 429 plus a `Retry-After` header (seconds)
// when it's exceeded. Retries such responses, and bare network failures,
// with backoff before giving up, so a brief dip doesn't fail the whole sync.
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 1;
      await sleep(retryAfter * 1000);
      continue;
    }

    return res;
  }
}

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
  const res      = await fetchWithRetry("https://accounts.spotify.com/api/token", {
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
  auth.spotifyTokenExpiry = Date.now() + data.expires_in * 1000;
  persistAuth();
}

// Fetches the authenticated user's profile and stores their ID in auth.
export async function fetchSpotifyProfile() {
  const res     = await fetchWithRetry("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${auth.spotifyAccessToken}` },
  });
  const profile = await res.json();
  auth.spotifyUserID = profile.id;
  persistAuth();
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

// Spotify's list endpoints (playlists, playlist tracks) cap out at 50–100
// items per page and return a `next` URL when more pages remain. Follows it
// until exhausted so libraries larger than one page aren't silently truncated.
// Returns null (instead of throwing) if a page comes back without `items`,
// e.g. an expired token.
async function fetchAllPages(url) {
  let items = [];
  let next  = url;

  while (next) {
    const res  = await fetchWithRetry(next, { headers: { Authorization: `Bearer ${auth.spotifyAccessToken}` } });
    const data = await res.json();
    if (!data.items) return null;
    items = items.concat(data.items);
    next  = data.next;
  }

  return items;
}

// Loads all playlists and their tracks into the songs state object.
// Returns false if the API call fails (e.g. expired token).
export async function fetchAllTracks() {
  const playlists = await fetchAllPages(
    `https://api.spotify.com/v1/users/${auth.spotifyUserID}/playlists?limit=50`
  );

  if (!playlists) {
    alert("Failed to load Spotify playlists. Your token may have expired — please reconnect.");
    return false;
  }

  for (const playlist of playlists) {
    const tracks = await fetchAllPages(`${playlist.tracks.href}?limit=100`);
    if (!tracks) continue;

    for (const item of tracks) {
      // track can be null if the song was removed from Spotify since it was
      // saved, and a missing name leaves nothing to search/display or match
      // against on YouTube — skip both rather than showing a placeholder row.
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
