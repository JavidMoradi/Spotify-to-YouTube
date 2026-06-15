import { auth, songs } from './state.js';
import { connectSpotify, exchangeSpotifyCode, fetchSpotifyProfile, fetchAllTracks } from './spotify.js';
import { connectYouTube, createYouTubePlaylist, searchVideo, addVideoToPlaylist } from './youtube.js';
import { markConnected, checkBothConnected, buildSongTable } from './ui.js';

// ─── Spotify OAuth Callback ───────────────────────────────────────────────────
// Module scripts are deferred, so the DOM is ready at this point.
// If Spotify just redirected back with an authorization code, handle it now.

const params = new URLSearchParams(window.location.search);
const code   = params.get("code");
const state  = params.get("state");

if (code && state === "spotify") {
  // Remove the query string so refreshing the page doesn't re-attempt the exchange.
  window.history.replaceState({}, document.title, window.location.pathname);

  (async () => {
    await exchangeSpotifyCode(code);
    sessionStorage.removeItem("spotify_code_verifier");
    if (!auth.spotifyAccessToken) return;

    await fetchSpotifyProfile();
    markConnected("spotify");
    checkBothConnected();
  })();
}

// ─── Core Flows ───────────────────────────────────────────────────────────────

async function initiate() {
  const btn = document.getElementById("initiateBtn");
  btn.textContent = "Loading...";
  btn.disabled    = true;

  const ok = await fetchAllTracks();
  if (!ok) return;

  document.getElementById("authSection").style.display = "none";

  const mainDiv       = document.getElementById("mainDiv");
  mainDiv.innerHTML   = buildSongTable(songs);

  document.getElementById("addToYoutubeBtn").addEventListener("click", addAllToYouTube);
}

// Transfers all collected Spotify tracks to a new private YouTube playlist.
// Note: YouTube Data API v3 has a daily quota (~10,000 units). Each search costs
// ~100 units and each insert ~50 units, so large libraries may hit the limit early.
async function addAllToYouTube() {
  songs.youtubePlaylistId = await createYouTubePlaylist("Spotify to Youtube");

  for (let i = 0; i < songs.names.length; i++) {
    const artistStr = songs.artists[i].map((a) => a.name).join(" ");
    const query     = `${songs.names[i]} - ${artistStr}`;
    const result    = await searchVideo(query);
    if (!result) continue;
    await addVideoToPlaylist(songs.youtubePlaylistId, result.videoId, result.kind);
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

document.getElementById("spotifyBtn").addEventListener("click", connectSpotify);

document.getElementById("youtubeBtn").addEventListener("click", () => {
  connectYouTube(() => {
    markConnected("youtube");
    checkBothConnected();
  });
});

document.getElementById("initiateBtn").addEventListener("click", initiate);
