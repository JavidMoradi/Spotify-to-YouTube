# Spotify to YouTube

Transfers all songs from a user's Spotify playlists into a new private YouTube playlist. Authorization is handled entirely in the browser — no backend required.

---

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) with the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension installed
- A [Spotify Developer](https://developer.spotify.com/dashboard) account
- A [Google Cloud](https://console.cloud.google.com) account with the YouTube Data API v3 enabled

---

## Setup

### 1. Register a Spotify App

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create a new app.
2. Inside the app settings, add the following as a **Redirect URI**:
   ```
   http://127.0.0.1:5500/SpotifyToYoutube/
   ```
   > Live Server's default port is 5500. Adjust the path if your folder structure differs.
3. Copy your **Client ID**.

### 2. Register a Google Cloud App

1. Go to the [Google Cloud Console](https://console.cloud.google.com) and create a new project.
2. Navigate to **APIs & Services → Library**, search for **YouTube Data API v3**, and enable it.
3. Navigate to **APIs & Services → Credentials** and create an **OAuth 2.0 Client ID** (Application type: **Web application**).
4. Under **Authorized JavaScript Origins**, add:
   ```
   http://127.0.0.1:5500
   ```
5. Copy your **Client ID**.

### 3. Add Your Client IDs

Open `SpotifyToYoutube/config.js` and fill in both values:

```js
export const SPOTIFY_CLIENT_ID = "your_spotify_client_id";
export const GOOGLE_CLIENT_ID  = "your_google_client_id";
```

---

## Running the App

1. Open the project folder in VS Code.
2. Right-click `SpotifyToYoutube/index.html` and select **Open with Live Server**.
3. The app opens in the browser at `http://127.0.0.1:5500/SpotifyToYoutube/`.

---

## Usage

1. Click **Connect Spotify** and authorize the app. You will be redirected back to the page automatically.
2. Click **Connect YouTube** and authorize in the popup that appears.
3. Once both show **Connected**, click **Initiate** — your Spotify songs will load in a table.
4. Click **Add All to YouTube** to create a new private playlist on your YouTube account and populate it with the songs.

---

## Limitations

The YouTube Data API v3 has a daily free quota of ~10,000 units. Each song requires a search (~100 units) and an insert (~50 units), which caps transfers at roughly 65 songs per day before the quota resets.
