// Spotify Credential
const USER_ID = "[Spotify USER ID]";
const accessToken = "[Spotify ACCESS TOKEN]";

// YouTube Credential
const YT_my_api_key = "[YouTube API KEY]";
const YT_accessToken = "[YouTube ACCESS TOKEN]";
const YT_clientID = "[YouTube CLIENT ID]";

// ...
var songNames = [];
var songArtists = [];

var playlistID = "";

window.onload = async () => {
  await fetch("https://api.spotify.com/v1/users/" + USER_ID + "/playlists", {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
  })
    .then((res) => {
      return res.json();
    })
    .then((data) => {
      data.items.forEach(async (element) => {
        await fetch(element.tracks.href, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: "Bearer " + accessToken,
          },
        })
          .then((res) => {
            return res.json();
          })
          .then(async (data) => {
            await data.items.forEach((e) => {
              songArtists.push(e.track.artists);
              songNames.push(e.track.name);
            });

            // Print each song's name on the display
            let myHtml = "";
            let i = 1;
            myHtml +=
              '<table id="songs" class="display" style="width:99%; margin: 0 auto;">';
            myHtml += "<thead><tr><th>Position</th><th>Name</th></tr></thead>";
            myHtml += "<tbody>";
            await songNames.forEach((e) => {
              myHtml +=
                "<tr>" + "<td>" + i + "</td>" + "<td>" + e + "</td>" + "</tr>";
              i++;
            });
            myHtml += "</tbody></table>";
            myHtml +=
              '<button type="button" class="btn btn-success" style="margin-left: .2cm; margin-bottom: .2cm; margin-top: .2cm" onclick="execute()">Add All</button>';
            document.getElementById("mainDiv").innerHTML = myHtml;
          });
      });
    });
};

async function execute() {
  let tempName = "";
  for (let j = 0; j < songArtists.length; j++) {
    for (let k = 0; k < songArtists[j].length; k++) {
      tempName += songArtists[j][k].name + " ";
    }

    songArtists[j] = tempName.substring(0, tempName.length - 1);
    tempName = "";
  }

  for (let i = 0; i < songNames.length; i++) {
    songNames[i] += " - " + songArtists[i];
  }

  // Create a playlist on YouTube
  await fetch(
    "https://youtube.googleapis.com/youtube/v3/playlists?part=localizations&part=status&part=snippet&key=" +
      YT_my_api_key,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + YT_accessToken,
      },
      body: {
        snippet: {
          title: "Spotify to Youtube",
          defaultLanguage: "[YOUR REGION, e.g. TR]",
        },
        status: {
          privacyStatus: "private",
        },
        kind: "youtube#playlist",
      },
    }
  )
    .then((res) => {
      return res.json();
    })
    .then((data) => {
      console.log(data);

      playlistID = data.id;
    });

  // Insert each song to our new playlist
  songNames.forEach(async (e) => {
    // using this get, the id and kind of the desired song will be found
    await fetch(
      "https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&q=" +
        e +
        "&key=" +
        YT_my_api_key,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    )
      .then((res) => {
        return res.json();
      })
      .then(async (data) => {
        console.log(data);

        data.items[0].id.forEach(async (element) => {
          // insert item to the new playlist
          await fetch(
            "https://youtube.googleapis.com/youtube/v3/playlistItems?part=contentDetails&part=id&part=snippet&part=status&key=" +
              YT_my_api_key,
            {
              method: "POST",
              headers: {
                Authorization: "Bearer " + YT_accessToken,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: {
                snippet: {
                  playlistId: playlistID, // playlist id to the inserted
                  resourceId: {
                    videoId: element.videoId, // the vid id to be inserted
                    kind: element.kind, // the kind of the content must be specified for successful insert
                  },
                },
              },
            }
          );
        });
      });
  });
}
window.execute = execute;
