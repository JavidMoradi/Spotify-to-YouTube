# Spotify to YouTube
This project aims to add a user's all Spotify playlists' songs to their YouTube acoount. Pupose of the project is to familiarize with the usage of JavaScript's fetch and synchronization topics.

How to Run
===
- Provide your Spotify User ID. 
  - User ID is same as username on your profile section. To see it, open the Spotify application, on top right, press your Profile icon, where a drop-down menu will show up. Then, press on Account. You'll be redirected to your Profile page, where your all information related to your Spotify account will be displayed, including your username/user ID. Login might be required.
- Provide a Spotify Access Token.
  - Methodology used for simple testing purposes is to go [here](https://developer.spotify.com/console/get-playlists/), where console with API documentation and tests are present. Request a token from the website.
- Go to Google API Console, and create a project. Login might be required.
- Then, go to Library section, and search for "YouTube Data API v3." Install/add this to the project.
- Afterwards, go to Credentials section, and create both API Keys and OAuth 2.0 Client IDs. You should have your api key, client ID and secret.
- Navigate to Google Developers OAuth 2.0 Playground, and on top right section, press setting and check the "Use your own OAuth credentials" box. Then, provide your both client id and secret. 
- On the left, authorize the YouTube API, and press the Authorize APIs button.
- You should be given a Authorization code that can be exchanged for YouTube Access Token. Please note that the token expires after a duration.
- Paste the required information on the main.js and run the project.
  - To run the project, XAMPP is recommended. Please follow [this](https://www.youtube.com/watch?v=K-qXW9ymeYQ) tutorial to get started with XAMPP.
<br/>

Noteworthy remark that this project might not be funtional for an extensive list of Spotify songs due to limited daily quota of YouTube Data Api v3.
