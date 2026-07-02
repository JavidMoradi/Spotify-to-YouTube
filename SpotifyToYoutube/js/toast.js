// Toast notifications — the non-blocking replacement for alert() used
// throughout the app. Import showToast() wherever a user-facing status or
// error message needs to be shown.

const TOAST_DURATION_MS = 6000;
const FADE_OUT_MS       = 220; // matches the `transition` duration on .toast in css/toast.css

// Fades a toast out (via the CSS `toast-hiding` class), then removes it from
// the DOM once the transition finishes, instead of vanishing instantly.
function dismissToast(toast) {
  if (toast.classList.contains("toast-hiding")) return; // already dismissing
  toast.classList.add("toast-hiding");
  window.setTimeout(() => toast.remove(), FADE_OUT_MS);
}

// Mirrors ui.js's escapeHtml — messages can include song/playlist names
// pulled from Spotify/YouTube, which aren't safe to interpolate raw.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Shows `message` in a glass toast at the bottom-left of the screen. A ring
// in its corner counts down to auto-dismiss; hovering pauses the countdown
// and swaps the ring for a close (×) button, resuming on mouseleave.
export function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "glass toast";
  toast.innerHTML = `
    <div class="toast-message">${escapeHtml(message)}</div>
    <div class="toast-expiry">
      <svg class="toast-expiry-ring" viewBox="0 0 24 24">
        <circle class="toast-expiry-track" cx="12" cy="12" r="10"></circle>
        <circle class="toast-expiry-progress" cx="12" cy="12" r="10"
                style="animation-duration:${TOAST_DURATION_MS}ms;"></circle>
      </svg>
      <span class="toast-close-x">×</span>
    </div>`;
  container.appendChild(toast);

  // The CSS animation pausing on :hover keeps the ring visually frozen; this
  // mirrors that in JS so the toast doesn't get silently removed underneath
  // a still-visible (paused) ring while the user is reading it.
  let remainingMs  = TOAST_DURATION_MS;
  let startedAt    = Date.now();
  let dismissTimer = window.setTimeout(() => dismissToast(toast), remainingMs);

  toast.addEventListener("mouseenter", () => {
    clearTimeout(dismissTimer);
    remainingMs -= Date.now() - startedAt;
  });
  toast.addEventListener("mouseleave", () => {
    startedAt    = Date.now();
    dismissTimer = window.setTimeout(() => dismissToast(toast), remainingMs);
  });
  toast.querySelector(".toast-close-x").addEventListener("click", () => {
    clearTimeout(dismissTimer);
    dismissToast(toast);
  });
}
