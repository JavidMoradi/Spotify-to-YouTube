// Low-level Spotify layer shared by spotifySource.js (reading, when Spotify
// is the transfer source) and spotifyDestination.js (writing, when Spotify
// is the transfer destination): PKCE auth, retrying fetch, and error typing.

import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } from '../config.js';
import { auth, persistAuth } from './state.js';
import { showToast } from './toast.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

// Thrown when the stored Spotify access token has been rejected — callers
// should prompt the user to reconnect rather than continuing. Spotify has no
// hard daily quota (just a short rolling rate limit already handled by
// fetchWithRetry below), so there's no Spotify equivalent of YouTubeQuotaError.
export class SpotifyAuthError extends Error {}

// Inspects a parsed Spotify API response for an error payload and throws a
// typed error so callers can react appropriately instead of treating an API
// failure the same as a legitimate empty result.
export function throwIfApiError(data, res) {
  if (!data.error) return;

  if (res.status === 401) {
    throw new SpotifyAuthError(data.error.message || "Spotify authorization expired.");
  }
  throw new Error(data.error.message || "Spotify API request failed.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Spotify has no fixed daily quota — instead it enforces a short rolling
// rate limit and responds with 429 plus a `Retry-After` header (seconds)
// when it's exceeded. Retrying a 429 is always safe — the request was
// rejected before Spotify did anything with it.
//
// A bare network exception (fetch() throwing) is a different story: it's
// ambiguous whether the request ever reached the server, or reached it and
// succeeded but the *response* got lost (dropped connection, timeout).
// Retrying is safe for idempotent reads (GET) but not for a write like
// "add this track" — resubmitting a POST that already succeeded appends the
// same track a second time, since Spotify doesn't dedupe on its own. Callers
// making a non-idempotent write should pass `retryOnNetworkError: false`.
export async function fetchWithRetry(url, options, { maxRetries = 3, retryOnNetworkError = true } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (!retryOnNetworkError || attempt >= maxRetries) throw err;
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

// Spotify's list endpoints (playlists, playlist tracks) cap out at 50–100
// items per page and return a `next` URL when more pages remain. Follows it
// until exhausted so libraries larger than one page aren't silently truncated.
// Returns null (instead of throwing) if a page comes back without `items`,
// e.g. an expired token.
export async function fetchAllPages(url) {
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
    // modify-private/public are needed when Spotify is the transfer destination
    // (creating playlists and adding tracks), not just when it's the source.
    scope:                 "user-read-private playlist-read-private playlist-read-collaborative " +
                            "playlist-modify-private playlist-modify-public",
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
    showToast("Spotify connection failed. Check the browser console for details.");
    return;
  }

  if (data.error) {
    console.error("Spotify token exchange error:", data.error, "-", data.error_description);
    showToast(`Spotify error: ${data.error_description || data.error}`);
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
