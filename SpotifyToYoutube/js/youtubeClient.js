// Low-level YouTube layer shared by youtubeSource.js (reading, when YouTube
// is the transfer source) and youtubeDestination.js (writing, when YouTube
// is the transfer destination): GIS auth, paginated fetching, and error typing.

import { GOOGLE_CLIENT_ID } from '../config.js';
import { auth, persistAuth } from './state.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

// Thrown when YouTube reports the daily quota (or a short-term rate limit)
// has been exhausted — callers should stop retrying and tell the user to
// come back once it resets, rather than treating it as "no result found".
export class YouTubeQuotaError extends Error {}

// Thrown when the stored YouTube access token has been rejected — callers
// should prompt the user to reconnect rather than continuing.
export class YouTubeAuthError extends Error {}

const QUOTA_ERROR_REASONS = new Set([
  "quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded",
]);

// Inspects a parsed YouTube API response for an error payload and throws a
// typed error so callers can react appropriately instead of treating an API
// failure the same as a legitimate empty result.
export function throwIfApiError(data, res) {
  if (!data.error) return;

  const reason = data.error.errors?.[0]?.reason || "";

  if (res.status === 401 || reason === "authError") {
    throw new YouTubeAuthError(data.error.message || "YouTube authorization expired.");
  }
  if (QUOTA_ERROR_REASONS.has(reason)) {
    throw new YouTubeQuotaError(data.error.message || "YouTube API quota exceeded.");
  }

  throw new Error(data.error.message || "YouTube API request failed.");
}

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
      auth.youtubeTokenExpiry = Date.now() + response.expires_in * 1000;
      persistAuth();
      onSuccess();
    },
  });

  tokenClient.requestAccessToken();
}

// ─── Pagination ───────────────────────────────────────────────────────────────

// YouTube list endpoints paginate via a `nextPageToken` param (rather than a
// full `next` URL like Spotify) — follows it until exhausted. `baseUrl` must
// not already have a trailing pageToken param.
export async function fetchAllYouTubeItems(baseUrl) {
  const items = [];
  let pageToken = "";

  do {
    const res  = await fetch(
      `${baseUrl}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${auth.youtubeAccessToken}` } }
    );
    const data = await res.json();
    throwIfApiError(data, res);

    items.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return items;
}
