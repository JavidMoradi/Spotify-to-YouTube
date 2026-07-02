import { auth } from './state.js';

// Escapes text pulled from Spotify (song/artist/playlist names) before it's
// interpolated into HTML, so a name containing characters like `<` or `"`
// can't break the markup or inject a stored script.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Theme ──────────────────────────────────────────────────────────────────
// Default (no class on <html>) is the dark theme; html.light overrides every
// design token in index.html's <style> block for the light theme.

const THEME_STORAGE_KEY = "s2y_theme";

function applyTheme(theme) {
  document.documentElement.classList.toggle("light", theme === "light");
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

// Restores the persisted theme (defaulting to dark) — call once on load.
export function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(saved === "light" ? "light" : "dark");
}

// Flips between light and dark — called by the theme toggle switch.
export function toggleTheme() {
  applyTheme(document.documentElement.classList.contains("light") ? "dark" : "light");
}

// ─── Connect / Initiate ─────────────────────────────────────────────────────

export function markConnected(service) {
  const btn = document.getElementById(`${service}Btn`);
  btn.textContent = "Connected";
  btn.disabled = true;
}

export function checkBothConnected() {
  if (auth.spotifyAccessToken && auth.youtubeAccessToken) {
    const btn = document.getElementById("initiateBtn");
    btn.disabled = false;
    btn.textContent = "Initiate transfer";
  }
}

// How long the screen crossfade / content-fade transitions take, in ms —
// kept in one place since JS has to wait this long before swapping content,
// matching the CSS `transition` durations declared in index.html.
const SCREEN_FADE_MS  = 250;
const CONTENT_FADE_MS = 200;

// Fades `el` out (via the CSS `fade-hidden` class), waits for the CSS
// transition to finish, then hands control to `swap` to change the DOM —
// used for anything replaced abruptly (screens, song list, a song's add
// cell) so the change reads as a transition rather than a jump cut.
function fadeSwap(el, swap, fadeMs = CONTENT_FADE_MS) {
  el.classList.add("fade-hidden");
  window.setTimeout(() => {
    swap();
    // Force the browser to register the "hidden" state before removing it
    // on the next frame, so fading back in actually animates.
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("fade-hidden")));
  }, fadeMs);
}

// Crossfades from one full-screen section to another: fades `from` out,
// swaps which one is actually laid out via `display`, then fades `to` in.
// `onHidden` (optional) runs right after `from` is set to display:none — for
// cleanup (e.g. clearing the song list) that would otherwise visibly jump if
// done before the fade-out finishes.
function crossfadeScreens(from, to, toDisplay, onHidden) {
  fadeSwap(from, () => {
    from.style.display = "none";
    if (onHidden) onHidden();
    to.style.display = toDisplay;
  }, SCREEN_FADE_MS);
}

// There are three top-level screens — #loadingScreen (shown by default,
// before app.js has decided anything), #authSection, and #appScreen — and
// exactly one is ever visible at a time. Uses computed style, not inline
// style, since the initially-visible screen is only visible via its base
// CSS rule and has no inline style set yet.
const SCREEN_IDS = ["loadingScreen", "authSection", "appScreen"];

function currentScreenEl() {
  for (const id of SCREEN_IDS) {
    const el = document.getElementById(id);
    if (getComputedStyle(el).display !== "none") return el;
  }
  return document.getElementById("loadingScreen");
}

// Crossfades from whichever screen is currently showing to `targetId`.
function goToScreen(targetId, onHidden) {
  const from = currentScreenEl();
  if (from.id === targetId) return;
  crossfadeScreens(from, document.getElementById(targetId), "flex", onHidden);
}

// Crossfades to the auth screen — used the first time app.js determines the
// user isn't (yet, or anymore) fully connected. Unlike resetToAuthScreen,
// this doesn't reset any fields, since on a fresh load they're already in
// whatever state loadPersistedAuth/setSourceDirection left them in.
export function showAuthScreen() {
  goToScreen("authSection");
}

// Crossfades to the app screen (top bar + filters + song list) once
// Initiate has finished loading the library. brandText reflects the
// direction locked in at Initiate time, e.g. "Spotify → Youtube" — innerHTML
// (not textContent) since app.js sometimes passes a trailing <sup>Beta</sup>
// tag; brandText is always app-built from fixed service labels, never from
// user/API-controlled text, so this is safe without escaping.
export function showAppScreen(brandText) {
  document.getElementById("brandText").innerHTML = brandText;
  goToScreen("appScreen");
}

// ─── Loading Screen Timeout ─────────────────────────────────────────────────
// Gives the user an escape hatch if startup ever gets stuck (a hung
// request, an unexpected error) instead of leaving them staring at a
// spinner forever with no way out.

let loadingTimeoutTimer = null;

// Arms the "taking too long" fallback — call once when startup begins.
export function startLoadingTimeout(delayMs = 8000) {
  clearTimeout(loadingTimeoutTimer);
  loadingTimeoutTimer = window.setTimeout(showLoadingTimeoutMessage, delayMs);
}

// Disarms it — call once startup has resolved (landed on either screen).
export function cancelLoadingTimeout() {
  clearTimeout(loadingTimeoutTimer);
}

// Reveals the fallback message immediately — used both by the timer above
// and by an explicit startup failure, so the user isn't left waiting the
// full timeout to find out something went wrong.
export function showLoadingTimeoutMessage() {
  document.getElementById("loadingTimeoutMsg").classList.add("visible");
}

// Disables the Spotify/Youtube source-direction toggle once Initiate has
// been clicked — the direction is locked in for the rest of the session,
// the same way the connect buttons lock once connected. The sliding
// indicator stays right where it was, showing the locked-in selection.
export function lockDirectionToggle() {
  document.getElementById("sourceSpotifyBtn").disabled = true;
  document.getElementById("sourceYoutubeBtn").disabled = true;
}

// Reverts the page back to the initial "connect your accounts" screen —
// used after logout.
export function resetToAuthScreen() {
  document.getElementById("brandText").textContent = "Spotify to Youtube";

  document.getElementById("searchInput").value = "";
  document.getElementById("playlistFilter").innerHTML = `<option value="">All Playlists</option>`;
  document.getElementById("pageSizeFilter").value = "100";
  const customPageSizeInput = document.getElementById("customPageSizeInput");
  customPageSizeInput.value = "";
  customPageSizeInput.style.display = "none";

  const spotifyBtn = document.getElementById("spotifyBtn");
  spotifyBtn.textContent = "Connect";
  spotifyBtn.disabled = false;

  const youtubeBtn = document.getElementById("youtubeBtn");
  youtubeBtn.textContent = "Connect";
  youtubeBtn.disabled = false;

  const initiateBtn = document.getElementById("initiateBtn");
  initiateBtn.disabled = true;
  initiateBtn.textContent = "Connect both accounts to continue";
  initiateBtn.removeAttribute("aria-busy");

  setSourceDirection("spotify");

  // Clear the song list only once the outgoing screen has actually faded out
  // and gone display:none — clearing it immediately would make it vanish
  // instantly while the rest of the screen was still visibly fading around it.
  // (Logout can happen from the loading screen too — the loading-timeout
  // escape hatch calls this — not just from the app screen.)
  goToScreen("authSection", () => { document.getElementById("mainDiv").innerHTML = ""; });
}

// Slides the direction indicator behind whichever source is selected, flips
// the arrow between them to keep pointing source -> destination, and
// re-enables both buttons (used on load and after logout — the opposite of
// lockDirectionToggle).
export function setSourceDirection(source) {
  document.getElementById("sourceSpotifyBtn").disabled = false;
  document.getElementById("sourceYoutubeBtn").disabled = false;
  document.getElementById("directionIndicator").classList.toggle("is-youtube", source === "youtube");
  document.getElementById("directionArrow").classList.toggle("is-youtube", source === "youtube");
}

// Fills the playlist filter dropdown with the distinct playlist names
// present in the song table, keeping "All Playlists" as the default option.
export function populatePlaylistFilter(playlists) {
  const unique  = [...new Set(playlists)].sort((a, b) => a.localeCompare(b));
  const options = unique
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");

  document.getElementById("playlistFilter").innerHTML =
    `<option value="">All Playlists</option>${options}`;
}

// Returns the indexes into `songs` whose song/artist/album text matches the
// search term and whose playlist matches the playlist filter (empty string
// = all playlists). Operates directly on the data rather than the DOM, since
// with pagination only one page's rows exist in the DOM at a time — this is
// also what scopes "Add All" to everything matching the filter, not just
// whatever page happens to be on screen.
export function getMatchingIndexes(songs, searchTerm, playlistTerm) {
  const term    = searchTerm.trim().toLowerCase();
  const indexes = [];

  songs.names.forEach((name, i) => {
    const artists = songs.artists[i].map((a) => a.name).join(", ");
    const album   = songs.albums[i];

    const matchesSearch = !term
      || name.toLowerCase().includes(term)
      || artists.toLowerCase().includes(term)
      || album.toLowerCase().includes(term);
    const matchesPlaylist = !playlistTerm || songs.playlists[i] === playlistTerm;

    if (matchesSearch && matchesPlaylist) indexes.push(i);
  });

  return indexes;
}

function addButtonHtml(index) {
  return `<button type="button" class="add-btn add-song-btn" id="addSongBtn-${index}" data-index="${index}">Add</button>`;
}

// One pill per outcome, recolored via css/app-screen.css's .status-* classes
// so a long list (especially after "Add all") is scannable at a glance:
// "added" (we just inserted it), "duplicate" (search found it already in the
// destination playlist — no insert needed), "notfound" (destination search
// came up empty), "failed" (insert itself errored, e.g. a transient network
// blip). matchUrl/match are only present for added/duplicate.
const STATUS_ICON  = { added: "✓", duplicate: "◆", notfound: "⚠", failed: "⚠" };
const STATUS_LABEL = {
  added:     "Added",
  duplicate: "Already in playlist",
  notfound:  "No match found",
  failed:    "Failed",
};

// matchUrl is precomputed by app.js (it knows whether the destination is
// YouTube or Spotify) — ui.js stays destination-agnostic.
function statusCellHtml(index, status, match, matchUrl) {
  const pill = `<div class="status-pill status-${status}"><span class="status-icon">${STATUS_ICON[status]}</span>${STATUS_LABEL[status]}</div>`;

  const viewMatchLink = matchUrl
    ? `<a href="${matchUrl}" target="_blank" rel="noopener noreferrer" class="view-match-link" title="${escapeHtml(match.title)}">View match</a>`
    : "";

  // added/duplicate already have a match — "Re-search" discards it and
  // starts over, for when the match itself might be wrong. notfound/failed
  // have no match (or a request that simply didn't go through) — "Retry"
  // re-attempts the same add instead of discarding anything. Reuses the
  // addSongBtn-${index} id so addSongToDestination's existing button lookup
  // (disabling it, showing "Adding...") works unchanged for a retry.
  const actionBtn = (status === "added" || status === "duplicate")
    ? `<button type="button" class="research-btn re-search-btn" data-index="${index}">Re-search</button>`
    : `<button type="button" class="retry-btn" id="addSongBtn-${index}" data-index="${index}">Retry</button>`;

  return `<div class="added-actions">${pill}${viewMatchLink}${actionBtn}</div>`;
}

// Marks a row with the outcome of an add attempt (see statusCellHtml above
// for the four possible statuses). No-ops if the row isn't the one currently
// on screen (a different page).
export function markSongStatus(index, status, match, matchUrl) {
  const cell = document.getElementById(`addCell-${index}`);
  if (!cell) return;
  fadeSwap(cell, () => { cell.innerHTML = statusCellHtml(index, status, match, matchUrl); });
}

// Reverts a row back to its initial "Add" button — used after "Re-search" is
// clicked, discarding whatever match (right or wrong) was previously found.
export function resetSongRow(index) {
  const cell = document.getElementById(`addCell-${index}`);
  if (!cell) return;
  fadeSwap(cell, () => { cell.innerHTML = addButtonHtml(index); });
}

// statusEntry is { status, match, matchUrl } from app.js's songStatuses map,
// or undefined if this song hasn't been attempted this session. ordinal is
// this song's 1-based position in the current filtered/searched list (not
// the raw library) — renumbered from 1 whenever the filter changes, and
// continuous across pages so it lines up with the "showing A-B of N" label.
function buildRow(songs, i, statusEntry, ordinal) {
  const artists  = songs.artists[i].map((a) => a.name).join(", ");
  const playlist = songs.playlists[i];
  const album    = songs.albums[i];
  const name     = songs.names[i];
  const metaText = `${artists} · ${album}`;
  const addCell  = statusEntry
    ? statusCellHtml(i, statusEntry.status, statusEntry.match, statusEntry.matchUrl)
    : addButtonHtml(i);

  return `
    <div class="song-row-wrap">
      <span class="song-index">${ordinal}</span>
      <div class="glass song-row">
        <div class="song-row-left">
          <img class="song-art" width="46" height="46" src="${songs.albumArts[i]}" alt="Album art" loading="lazy">
          <div class="song-info">
            <div class="song-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="song-meta" title="${escapeHtml(metaText)}">${escapeHtml(metaText)}</div>
          </div>
        </div>
        <div class="song-row-right">
          <div class="playlist-tag">${escapeHtml(playlist)}</div>
          <div id="addCell-${i}">${addCell}</div>
        </div>
      </div>
    </div>`;
}

// Builds the static library shell (empty song list + pagination controls +
// footer actions). Rendered once per Initiate; only the song list and
// pagination label are replaced after that (see renderPage). destinationName
// is stashed on the button's dataset so setAddAllLabel can relabel it later
// without needing the destination threaded through every call site.
export function buildLibraryShell(destinationName) {
  return `
    <div id="songList" class="song-list"></div>

    <div class="page-nav">
      <button type="button" class="page-nav-btn" id="prevPageBtn">Prev</button>
      <span id="pageLabel" class="page-label"></span>
      <button type="button" class="page-nav-btn" id="nextPageBtn">Next</button>
    </div>

    <div class="footer-actions">
      <button type="button" class="back-to-top-btn" id="backToTopBtn">Back to top</button>
      <button type="button" class="add-all-btn" id="addAllBtn" data-destination="${escapeHtml(destinationName)}">
        Add all to ${escapeHtml(destinationName)}
      </button>
    </div>`;
}

// Labels the "Add all" button with how many songs are actually on the
// current page — "Add all" only ever acts on what's currently shown (see
// app.js's currentPageIndexes), so the label says so instead of implying it
// covers the whole filtered list across every page. No-ops while a batch is
// running (the button is showing "Stop" — see app.js's runAddAll).
export function setAddAllLabel(count) {
  const btn = document.getElementById("addAllBtn");
  if (!btn || btn.classList.contains("is-running")) return;
  btn.textContent = `Add ${count} shown to ${btn.dataset.destination}`;
}

// Renders just the current page's slice of matchingIndexes into the song
// list, fading the swap so paging/filtering doesn't feel like an abrupt
// content jump. songStatuses (index -> { status, match, matchUrl }) lets a
// row rendered on a page you've navigated back to still show its outcome
// instead of reverting to a plain "Add" button. pageSize of Infinity (the
// "All" option) shows everything — handled as its own branch since
// `(1 - 1) * Infinity` is NaN, not 0.
export function renderPage(songs, matchingIndexes, page, pageSize, songStatuses) {
  const pageIndexes = pageSize === Infinity
    ? matchingIndexes
    : matchingIndexes.slice((page - 1) * pageSize, page * pageSize);
  // Same offset renderPaginationControls' "showing A-B" label uses, so a
  // row's number always matches its position in that range.
  const startOffset = pageSize === Infinity ? 0 : (page - 1) * pageSize;

  const list = document.getElementById("songList");
  fadeSwap(list, () => {
    list.innerHTML = pageIndexes.length > 0
      ? pageIndexes.map((i, k) => buildRow(songs, i, songStatuses.get(i), startOffset + k + 1)).join("")
      : `<div class="empty-state">No songs match your search.</div>`;
  });

  setAddAllLabel(pageIndexes.length);
}

// Updates the "Page X of Y (showing N of M songs)" label and disables
// Prev/Next at the ends of the range (always disabled when showing "All").
export function renderPaginationControls(page, totalMatches, pageSize) {
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(totalMatches / pageSize));
  const start      = totalMatches === 0 ? 0 : (pageSize === Infinity ? 1 : (page - 1) * pageSize + 1);
  const end        = pageSize === Infinity ? totalMatches : Math.min(page * pageSize, totalMatches);

  document.getElementById("pageLabel").textContent =
    `Page ${page} of ${totalPages} (showing ${start}-${end} of ${totalMatches} songs)`;
  document.getElementById("prevPageBtn").disabled = page <= 1;
  document.getElementById("nextPageBtn").disabled = page >= totalPages;
}
