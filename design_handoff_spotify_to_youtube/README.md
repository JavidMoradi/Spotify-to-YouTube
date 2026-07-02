# Handoff: SpotifyToYoutube — Liquid Glass Redesign

## Overview
A visual redesign of the existing SpotifyToYoutube transfer tool (vanilla JS + Bootstrap app that lets a user connect Spotify and YouTube accounts and copy songs/playlists between them). The redesign covers both app states — the **Auth screen** (connect accounts) and the **Library screen** (browse/search/transfer songs) — in a premium, iOS 26–style "liquid glass" aesthetic with a working light/dark theme.

## About the Design Files
The bundled file, `SpotifyToYoutube Redesign.dc.html`, is a **design reference built in HTML** — a clickable prototype showing intended look, states, and motion. It is not production code to copy verbatim. Your task is to **recreate this design inside the existing SpotifyToYoutube codebase** (`index.html` + `js/*.js`, currently vanilla JS with Bootstrap 5), replacing the current Bootstrap-driven markup/CSS with the new visual language while preserving all existing functionality (OAuth flows, pagination, search/filter, add/re-search logic, persisted auth, etc. — see `js/app.js`, `js/ui.js`, `js/transfer.js`).

Do not add a frontend framework unless one is already planned — keep the existing vanilla-JS module structure (`app.js`, `ui.js`, `state.js`, `transfer.js`) and swap in the new markup/CSS/class names inside `ui.js`'s template strings and `index.html`'s `<style>` block.

## Fidelity
**High-fidelity.** Exact colors, blur values, radii, spacing, and copy are specified below and should be matched pixel-for-pixel. The prototype's interactivity (theme toggle, connect flow, add/re-search) mirrors the real app's states and can be used as the functional reference for how each state should look.

## Screens / Views

### 1. Auth screen
**Purpose:** User picks transfer direction (Spotify→YouTube or YouTube→Spotify), connects both accounts, then starts the transfer.

**Layout:** Full-viewport, centered flex (align-items/justify-content: center). A single glass card, `440px` wide (`max-width: 100%`), `border-radius: 32px`, padding `40px 36px`.

**Card contents, top to bottom:**
- Heading "Move your music" — 26px / weight 700 / letter-spacing -0.02em, centered.
- Subtext "Connect both accounts, then transfer your library in one tap." — 15px, secondary text color, 6px margin-top.
- 28px gap.
- **Direction segmented control**: pill-shaped container (`border-radius: 16px`, padding `5px`) containing two buttons ("Spotify", "YouTube") with a small colored dot before each label (Spotify dot `#1ED760`, YouTube dot `#FF3B30`) and a "→" glyph between them. An animated pill indicator (accent-tinted background + accent border, `border-radius: 12px`) slides behind whichever button is active, transition `0.45s cubic-bezier(0.22,1,0.36,1)`. Disabled/locked (no longer clickable, but still shows the locked selection) once the user has moved to the Library screen.
- 28px gap.
- **Two connect rows** (Spotify, YouTube), each a glass row (`border-radius: 18px`, padding `14px 16px`, flex row, space-between): leading side has a `38×38px` rounded-square icon tile (brand color background: Spotify `#1ED760`, YouTube `#FF3B30`; white bold letter "S"/"Y"; soft colored drop shadow) + two-line label ("Spotify"/"YouTube" bold 15px, status line 12.5px — "Not connected" in tertiary text color, or "Connected" in success green once connected). Trailing side is a pill button ("Connect" → becomes "Connected" and disabled once clicked; background switches from the brand color to the glass surface color, text switches from white to tertiary, opacity 0.7 when connected).
- 24px gap.
- **Initiate button**: full-width, `border-radius: 16px`, padding `15px`, weight 700. Disabled state (either account not connected): background = glass surface color, text = **secondary** text color (not white — this must have real contrast against the light-mode glass, previously a bug), opacity 0.85, cursor default, label reads "Connect both accounts to continue". Enabled state (both connected): background `linear-gradient(135deg, accent, #8b5cf6)`, white text, glowing accent-tinted box-shadow, label "Initiate transfer".

### 2. Library screen
**Purpose:** Browse the fetched song library, filter/search it, and add songs to the destination service individually or all at once.

**Layout:** Full-height flex column.
- **Top nav bar**: glass surface, sticky top, `padding: 16px 28px`, flex row space-between. Left: small `10px` gradient dot (accent → pink) + brand text ("Spotify → YouTube" or reverse, 16px bold). Right: "Log out" pill button (glass surface, 1px border, 12.5px bold).
- **Filter bar**: `padding: 16px 28px`, 1px bottom border, flex row space-between wrapping. Left group: "All Playlists" pill `<select>` + "100 / page" pill `<select>` (both glass pills, `border-radius: 999px`, `padding: 8px 14px`, 12.5px). Right: search field — glass pill (`border-radius: 999px`, `padding: 8px 16px`, width 280px) containing a small magnifying-glass icon (9px circle + short diagonal line, both in tertiary text color) and a borderless text input, placeholder "Search by song or artist…".
- **Song list**: centered column, max-width 880px, `gap: 10px` between rows. Each **song row** is a glass card (`border-radius: 18px`, padding `12px 18px`, flex row space-between):
  - Leading: `46×46px` rounded-rect album-art placeholder (diagonal stripe pattern over an accent-tinted gradient — swap for real album art), then song title (14.5px bold, truncates with ellipsis at 260px) and, below it, "Artist · Album" (13px, secondary color, same truncation).
  - Trailing: a playlist tag pill (e.g. "Focus", "Road Trip" — the playlist the song came from; 11.5px bold, secondary color, glass-tinted pill), then either:
    - **Not added**: single "Add" pill button (accent-outlined, accent-tinted fill, accent text).
    - **Added**: green "Added" pill (non-interactive) + "View match" link (accent-colored, 12px, links to the matched track) + "Re-search" text button (underlined, tertiary color) to discard the match and revert to "Add".
  - Empty state: if a search/filter yields nothing, centered "No songs match your search." in tertiary text, 40px vertical padding.
- **Pagination row** (below the list): "Prev" / "Next" pill buttons (disabled look, 0.6 opacity, glass) flanking a small label "Page X of Y (showing A-B of N songs)".
- **Footer actions**: "Back to top" (glass pill button) and "Add all to {Destination}" (solid accent gradient pill, white text, accent glow shadow).

## Interactions & Behavior
- **Theme toggle**: iOS-style switch (52×30px glass pill, 22px circular knob) flips the entire app between light and dark instantly (color-only change, `~0.2s ease` on the knob).
- **Direction toggle**: clicking Spotify/YouTube on the auth screen swaps the sliding indicator and updates which service is the source; locked (non-interactive) once the transfer has started.
- **Connect buttons**: click → button becomes disabled/"Connected", status label turns green "Connected"; once both are connected the Initiate button becomes enabled.
- **Initiate**: navigates from Auth screen to Library screen.
- **Add**: click → row transitions to the "Added" state (fade/instant swap is acceptable; original app used a 200ms opacity fade on cell swap — keep that).
- **Re-search**: click → row reverts to "Add" state, discarding the previous match.
- **Add all**: marks every currently visible song as "Added".
- **Search / playlist filter**: filters the song list client-side by substring match on name/artist and exact playlist match; resets to page 1 (pagination itself was out of scope for the mock — only 6 songs shown — but the real app's existing pagination logic in `js/ui.js`/`js/app.js` should be preserved).
- **Log out**: returns to Auth screen and resets connection/song state (mirrors existing `logout()` in `app.js`).
- All transitions use either `0.45s cubic-bezier(0.22,1,0.36,1)` (larger/structural changes — sliding indicators, theme background) or `0.2s ease` (small state flips — buttons, knobs).

## State Management
Mirrors the existing app's state shape in `js/state.js` / `js/transfer.js` — no new state concepts introduced, only a `theme` (`light`/`dark`, new — persist e.g. to `localStorage`) and `screen` (`auth`/`app`, already implicit in the existing show/hide logic). Per-song `added` boolean already exists via `addedMatches` in `transfer.js`.

## Design Tokens

**Accent (unified primary action color):** `#6366f1` (indigo), used with `#8b5cf6` in gradients. Tweakable — alternates considered: `#0ea5e9` (sky), `#ec4899` (pink), `#10b981` (emerald).

**Brand colors (kept recognizable):**
- Spotify green: `#1ED760`
- YouTube red: `#FF3B30`

**Dark theme:**
- Background: layered radial + linear gradient — `radial-gradient(1200px 800px at 15% 0%, #241f4d 0%, transparent 60%), radial-gradient(1000px 700px at 100% 100%, #1a1440 0%, transparent 55%), linear-gradient(160deg, #0f1120 0%, #171233 55%, #1c1442 100%)`
- Text primary: `rgba(255,255,255,0.94)`
- Text secondary: `rgba(255,255,255,0.62)`
- Text tertiary: `rgba(255,255,255,0.4)`
- Glass surface: `rgba(255,255,255,0.07)` (strong variant `0.1`), border `rgba(255,255,255,0.14)`
- Glass shadow: `0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)`
- Nav bar surface: `rgba(15,16,28,0.55)`
- Input surface: `rgba(255,255,255,0.06)`
- Success: `#34d399`

**Light theme:**
- Background: `radial-gradient(1200px 800px at 15% 0%, #eef0ff 0%, transparent 60%), radial-gradient(1000px 700px at 100% 100%, #f5f0ff 0%, transparent 55%), linear-gradient(160deg, #fbfbff 0%, #f3f4fb 55%, #f0eefb 100%)`
- Text primary: `rgba(20,20,30,0.92)`
- Text secondary: `rgba(20,20,30,0.58)`
- Text tertiary: `rgba(20,20,30,0.38)`
- Glass surface: `rgba(255,255,255,0.55)` (strong variant `0.72`), border `rgba(255,255,255,0.7)`
- Glass shadow: `0 20px 50px rgba(30,30,60,0.12), inset 0 1px 0 rgba(255,255,255,0.8)`
- Nav bar surface: `rgba(255,255,255,0.55)`
- Input surface: `rgba(255,255,255,0.6)`
- Success: `#059669`

**Glass surface recipe (all glass elements):** `backdrop-filter: blur(28px) saturate(160%)` (+ `-webkit-` prefix) over the surface color, `1px solid` border in the border color above, plus the theme's glass shadow (drop shadow + inset top highlight for the specular edge).

**Typography:** `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif` throughout. Sizes used: 26px/700 (headline), 16px/700 (brand), 15px/600 (body-strong), 14.5px/600 (song title), 13–13.5px (body/buttons), 12–12.5px (labels/pills), 11.5px (tags).

**Radii:** 32px (auth card), 18px (rows/cards), 16px (buttons, inputs container), 12px (segmented control inner), 999px (all pill buttons/tags/inputs).

**Ambient background accents:** two large (520px) blurred (90px blur) circular color blobs positioned top-left and bottom-right, low opacity (0.35 dark / 0.5 light), subtle infinite float animation (14s, ±2–3% translate/scale) — purely decorative, sits behind all content.

## Assets
No external images used. Album art is a placeholder (diagonal stripe pattern) — swap in real album art from Spotify's API (already fetched in `js/spotifySource.js`) once implemented. Service icons are simple colored letter tiles ("S"/"Y") rather than official logos — replace with your own licensed Spotify/YouTube logo marks if desired, sized to fit the 38×38px tile.

## Files
- `SpotifyToYoutube Redesign.dc.html` — the full interactive design reference (single file, includes both screens, the theme toggle, and a screen switcher used only for demoing the design — remove that switcher in the real implementation since screen navigation is already driven by app state).

Original app files for behavioral reference (in the attached `SpotifyToYoutube` folder, not included in this bundle): `index.html`, `js/app.js`, `js/ui.js`, `js/state.js`, `js/transfer.js`, `js/spotifyClient.js`, `js/spotifySource.js`, `js/spotifyDestination.js`, `js/youtubeClient.js`, `js/youtubeSource.js`, `js/youtubeDestination.js`.
