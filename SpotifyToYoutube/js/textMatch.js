// Shared text-normalization for cross-service duplicate detection. Used by
// youtubeDestination.js/spotifyDestination.js (to index what's already in a
// playlist) and transfer.js (to check a fresh match against that index), so
// a song already present under a *different* track/video id — a different
// upload, release, or a version added manually or by an earlier version of
// this app's matching logic — still gets caught as a duplicate instead of
// only ever comparing exact ids.
export function normalizeTitle(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
