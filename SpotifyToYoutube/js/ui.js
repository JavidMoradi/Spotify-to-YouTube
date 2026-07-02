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

export function markConnected(service) {
  document.getElementById(`${service}Status`).textContent = "Connected";
  document.getElementById(`${service}Btn`).disabled = true;
}

export function checkBothConnected() {
  if (auth.spotifyAccessToken && auth.youtubeAccessToken) {
    document.getElementById("initiateBtn").disabled = false;
  }
}

// How long the screen crossfade / content-fade transitions take, in ms —
// kept in one place since JS has to wait this long before swapping content,
// matching the CSS `transition` durations declared in index.html.
const SCREEN_FADE_MS  = 250;
const CONTENT_FADE_MS = 200;

// Fades `el` out (via the CSS `fade-hidden` class), waits for the CSS
// transition to finish, then hands control to `swap` to change the DOM —
// used for anything replaced abruptly (screens, table body, a song's add
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

// Crossfades from one full-screen section to another (auth screen <->
// app screen): fades `from` out, swaps which one is actually laid out via
// `display`, then fades `to` in. `onHidden` (optional) runs right after
// `from` is set to display:none — for cleanup (e.g. clearing the table)
// that would otherwise visibly jump if done before the fade-out finishes.
function crossfadeScreens(from, to, toDisplay, onHidden) {
  fadeSwap(from, () => {
    from.style.display = "none";
    if (onHidden) onHidden();
    to.style.display = toDisplay;
  }, SCREEN_FADE_MS);
}

// Crossfades from the auth screen to the app screen (top bar + filters +
// song table) once Initiate has finished loading the library. brandText
// reflects the direction locked in at Initiate time, e.g. "Spotify → Youtube".
export function showAppScreen(brandText) {
  document.getElementById("brandText").textContent = brandText;
  crossfadeScreens(document.getElementById("authSection"), document.getElementById("appScreen"), "flex");
}

// Disables the Spotify/Youtube source-direction toggle once Initiate has
// been clicked — the direction is locked in for the rest of the session,
// the same way the connect buttons lock once connected.
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

  document.getElementById("spotifyStatus").textContent = "";
  document.getElementById("youtubeStatus").textContent = "";
  document.getElementById("spotifyBtn").disabled = false;
  document.getElementById("youtubeBtn").disabled = false;

  const initiateBtn = document.getElementById("initiateBtn");
  initiateBtn.disabled = true;
  initiateBtn.textContent = "Initiate";

  setSourceDirection("spotify");

  // Clear the table only once the app screen has actually faded out and
  // gone display:none — clearing it immediately would make the table vanish
  // instantly while the rest of the screen was still visibly fading around it.
  crossfadeScreens(
    document.getElementById("appScreen"),
    document.getElementById("authSection"),
    "flex",
    () => { document.getElementById("mainDiv").innerHTML = ""; }
  );
}

// Selects which source-direction button is visually active and re-enables
// both (used on load and after logout — the opposite of lockDirectionToggle).
export function setSourceDirection(source) {
  const spotifyBtn = document.getElementById("sourceSpotifyBtn");
  const youtubeBtn = document.getElementById("sourceYoutubeBtn");

  spotifyBtn.disabled = false;
  youtubeBtn.disabled = false;
  spotifyBtn.classList.toggle("active", source === "spotify");
  youtubeBtn.classList.toggle("active", source === "youtube");
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
  return `
    <button type="button" class="btn btn-sm btn-outline-success add-song-btn" id="addSongBtn-${index}" data-index="${index}">
      Add
    </button>`;
}

// matchUrl is precomputed by app.js (it knows whether the destination is
// YouTube or Spotify) — ui.js stays destination-agnostic.
function addedCellHtml(index, match, matchUrl) {
  return `
    <div class="d-flex flex-column align-items-center gap-1">
      <button type="button" class="btn btn-sm btn-secondary" disabled>Added</button>
      <a href="${matchUrl}" target="_blank" rel="noopener noreferrer" class="small" title="${escapeHtml(match.title)}">View match</a>
      <button type="button" class="btn btn-sm btn-link p-0 re-search-btn" data-index="${index}">Re-search</button>
    </div>`;
}

// Marks a row as added and shows a link to the matched song plus a
// "Re-search" control, so a wrong match (e.g. a cover version outranking the
// original) can be spotted and corrected instead of silently trusted forever.
// No-ops if the row isn't the one currently on screen (a different page).
export function markSongAdded(index, match, matchUrl) {
  const cell = document.getElementById(`addCell-${index}`);
  if (!cell) return;
  fadeSwap(cell, () => { cell.innerHTML = addedCellHtml(index, match, matchUrl); });
}

// Reverts a row back to its initial "Add" button — used after "Re-search" is
// clicked, discarding whatever match (right or wrong) was previously found.
export function resetSongRow(index) {
  const cell = document.getElementById(`addCell-${index}`);
  if (!cell) return;
  fadeSwap(cell, () => { cell.innerHTML = addButtonHtml(index); });
}

// addedEntry is { match, matchUrl } from app.js's addedMatches map, or
// undefined if this song hasn't been added this session.
function buildRow(songs, i, addedEntry) {
  const artists  = songs.artists[i].map((a) => a.name).join(", ");
  const playlist = songs.playlists[i];
  const album    = songs.albums[i];
  const artCell  = `<img src="${songs.albumArts[i]}" width="48" height="48" style="border-radius:4px; display:block;" alt="Album art" loading="lazy">`;
  const addCell  = addedEntry ? addedCellHtml(i, addedEntry.match, addedEntry.matchUrl) : addButtonHtml(i);

  return `
    <tr>
      <td>${i + 1}</td>
      <td class="art-cell">${artCell}</td>
      <td>${escapeHtml(songs.names[i])}</td>
      <td>${escapeHtml(artists)}</td>
      <td>${escapeHtml(album)}</td>
      <td>${escapeHtml(playlist)}</td>
      <td class="text-center" id="addCell-${i}">${addCell}</td>
    </tr>`;
}

// Builds the static table shell (header + empty body) plus the pagination
// controls and "Add All" button. Rendered once per Initiate; only the
// table body and pagination label are replaced after that (see renderPage).
// destinationName labels the "Add All" button, e.g. "Add All to Youtube".
export function buildTableShell(destinationName) {
  return `
    <table class="excel-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Art</th>
          <th>Song Name</th>
          <th>Artist</th>
          <th>Album</th>
          <th>Playlist</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="songTableBody"></tbody>
    </table>
    <div class="d-flex align-items-center justify-content-center gap-2" style="margin-top: 0.8rem;">
      <button type="button" class="btn btn-sm btn-outline-secondary" id="prevPageBtn">Prev</button>
      <span id="pageLabel" class="small"></span>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="nextPageBtn">Next</button>
    </div>
    <div class="d-flex align-items-center gap-2" style="margin-top: 1.2rem;">
      <button type="button" class="btn btn-outline-secondary" id="backToTopBtn">Back to Top</button>
      <button type="button" class="btn btn-success" id="addAllBtn">
        Add All to ${escapeHtml(destinationName)}
      </button>
    </div>`;
}

// Renders just the current page's slice of matchingIndexes into the table
// body, fading the swap so paging/filtering doesn't feel like an abrupt
// content jump. addedMatches (index -> { match, matchUrl }) lets a row
// rendered on a page you've navigated back to still show "Added" instead of
// reverting to a plain "Add" button. pageSize of Infinity (the "All" option)
// shows everything — handled as its own branch since `(1 - 1) * Infinity` is NaN, not 0.
export function renderPage(songs, matchingIndexes, page, pageSize, addedMatches) {
  const pageIndexes = pageSize === Infinity
    ? matchingIndexes
    : matchingIndexes.slice((page - 1) * pageSize, page * pageSize);

  const tbody = document.getElementById("songTableBody");
  fadeSwap(tbody, () => {
    tbody.innerHTML = pageIndexes.map((i) => buildRow(songs, i, addedMatches.get(i))).join("");
  });
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
