import { auth } from './state.js';

export function markConnected(service) {
  document.getElementById(`${service}Status`).textContent = "Connected";
  document.getElementById(`${service}Btn`).disabled = true;
}

export function checkBothConnected() {
  if (auth.spotifyAccessToken && auth.youtubeAccessToken) {
    document.getElementById("initiateBtn").disabled = false;
  }
}

// Builds the Excel-like song table HTML string from the songs state object.
export function buildSongTable(songs) {
  let rows = "";
  songs.names.forEach((name, i) => {
    const artists = songs.artists[i].map((a) => a.name).join(", ");
    const artUrl  = songs.albumArts[i];
    const artCell = artUrl
      ? `<img src="${artUrl}" width="48" height="48" style="border-radius:4px; display:block;">`
      : "";

    rows += `
      <tr>
        <td>${i + 1}</td>
        <td class="art-cell">${artCell}</td>
        <td>${name}</td>
        <td>${artists}</td>
        <td>${songs.playlists[i]}</td>
      </tr>`;
  });

  return `
    <table class="excel-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Art</th>
          <th>Song Name</th>
          <th>Artist</th>
          <th>Playlist</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <button type="button" class="btn btn-success" id="addToYoutubeBtn" style="margin-top: 1.2rem;">
      Add All to YouTube
    </button>`;
}
