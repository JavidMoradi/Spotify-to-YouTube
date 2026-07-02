// This file has been split into focused modules. See js/ for the current source:
//
//   config.js               ← Spotify & Google client IDs
//   js/state.js             ← shared state (auth, songs) + auth/match persistence
//   js/spotifyClient.js     ← Spotify PKCE auth, retrying fetch, error typing
//   js/spotifySource.js     ← reading from Spotify (Spotify as transfer source)
//   js/spotifyDestination.js ← writing to Spotify (Spotify as transfer destination)
//   js/youtubeClient.js     ← YouTube GIS auth, paginated fetch, error typing
//   js/youtubeSource.js     ← reading from YouTube (YouTube as transfer source)
//   js/youtubeDestination.js ← writing to YouTube (YouTube as transfer destination)
//   js/transfer.js          ← direction-agnostic transfer orchestration
//   js/ui.js                ← DOM helpers, table/pagination builder
//   js/app.js               ← entry point, event wiring
