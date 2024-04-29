const APP_ID = "05e0a4c74bfb4211ab5afb2d41b25691";

let uid = sessionStorage.getItem("uid");
if (!uid) {
  uid = String(Math.floor(Math.random() * 10000));
  sessionStorage.setItem("uid", uid);
}

let token = null;
let client;

let rtmClient;
let channel;

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("room")?.toLowerCase();

if (!roomId) {
  window.location = "index.html";
}

let displayName = sessionStorage.getItem("display_name");
if (!displayName) {
  window.location = "index.html";
}

let localTracks = [];
let remoteUsers = {};

let localScreenTracks;
let sharingScreen = false;

async function populateDeviceLists() {
  let videoInputSelect = document.getElementById("videoInputSelect");
  let audioInputSelect = document.getElementById("audioInputSelect");
  let audioOutputSelect = document.getElementById("audioOutputSelect");

  console.warn("populating device list");

  await navigator.mediaDevices.enumerateDevices().then(function (devices) {
    devices.forEach((device) => {
      let option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `${device.kind}: ${device.deviceId}`;
      if (device.kind === "videoinput" && videoInputSelect) {
        videoInputSelect.appendChild(option);
      } else if (device.kind === "audioinput" && audioInputSelect) {
        audioInputSelect.appendChild(option);
      } else if (device.kind === "audiooutput" && audioOutputSelect) {
        audioOutputSelect.appendChild(option);
      }
    });
  });
}

async function changeDevice(trackKind, deviceId) {
  const tracks =
    trackKind === "video"
      ? localTracks.filter((t) => t.track.kind === "video")
      : localTracks.filter((t) => t.track.kind === "audio");
  if (tracks.length > 0) {
    await tracks[0].setDevice(deviceId);
  }
}

let joinRoomInit = async () => {
  rtmClient = await AgoraRTM.createInstance(APP_ID);
  await rtmClient.login({ uid, token });

  await rtmClient.addOrUpdateLocalUserAttributes({ name: displayName });

  channel = await rtmClient.createChannel(roomId);
  await channel.join();

  channel.on("MemberJoined", handleMemberJoined);
  channel.on("MemberLeft", handleMemberLeft);
  channel.on("ChannelMessage", handleChannelMessage);

  getMembers();
  addBotMessageToDom(`Welcome to the room ${displayName}! 👋`);

  client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  await client.join(APP_ID, roomId, token, uid);

  joinStream(true);

  client.on("user-published", handleUserPublished);
  client.on("user-left", handleUserLeft);
};

let joinStream = async (isLocal = false) => {
  document.getElementsByClassName("stream__actions")[0].style.display = "flex";

  localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
    {
      microphone: {
        AEC: true,
        ANS: true,
        AGC: true,
      },
    },
    {
      encoderConfig: {
        width: { min: 640, ideal: 1920, max: 1920 },
        height: { min: 480, ideal: 1080, max: 1080 },
      },
    }
  );

  let player;

  if (isLocal) {
    player = `<div class="video-player local-stream" id="user-${uid}"></div>`;
  } else {
    player = `<div class="video-player" id="user-${uid}"></div>`;
  }
  document
    .getElementById("streams__container")
    .insertAdjacentHTML("afterbegin", player);

  localTracks[1].play(`user-${uid}`);
  await client.publish([localTracks[0], localTracks[1]]);
  populateDeviceLists();
};

let switchToCamera = async () => {
  let player = `<div class="video-player" id="user-${uid}"></div>`;
  displayFrame.insertAdjacentHTML("beforeend", player);

  await localTracks[0];
  await localTracks[1];

  document.getElementById("mic-btn").classList.remove("active");

  localTracks[1].play(`user-${uid}`);
  await client.publish([localTracks[1]]);
};

let handleUserPublished = async (user, mediaType) => {
  remoteUsers[user.uid] = user;

  await client.subscribe(user, mediaType);

  let player = document.getElementById(`user-${user.uid}`);
  if (player === null) {
    player = `<div class="video-player" id="user-${user.uid}"></div>`;

    document
      .getElementById("streams__container")
      .insertAdjacentHTML("beforeend", player);
  }

  if (mediaType === "video") {
    user.videoTrack.play(`user-${user.uid}`);
  }

  if (mediaType === "audio") {
    user.audioTrack.play();
  }
};

let handleUserLeft = async (user) => {
  delete remoteUsers[user.uid];
  let item = document.getElementById(`user-${user.uid}`);
  if (item) {
    item.remove();
  }

  if (userIdInDisplayFrame === `user-${user.uid}`) {
    displayFrame.style.display = null;
  }
};

let toggleMic = async (e) => {
  let button = e.currentTarget;

  if (localTracks[0].muted) {
    await localTracks[0].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[0].setMuted(true);
    button.classList.remove("active");
  }
};

let toggleCamera = async (e) => {
  let button = e.currentTarget;

  if (localTracks[1].muted) {
    await localTracks[1].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[1].setMuted(true);
    button.classList.remove("active");
  }
};

let toggleScreen = async (e) => {
  let screenButton = e.currentTarget;
  let cameraButton = document.getElementById("camera-btn");

  if (!sharingScreen) {
    sharingScreen = true;

    localScreenTracks = await AgoraRTC.createScreenVideoTrack();

    document.getElementById("streams__container").style.display = "none";
    displayFrame.style.display = "flex";

    let player = `<div class="video-player" id="user-${uid}"></div>`;

    displayFrame.insertAdjacentHTML("beforeend", player);

    userIdInDisplayFrame = `user-${uid}`;
    localScreenTracks.play(`user-${uid}`);

    await client.unpublish([localTracks[1]]);
    await client.publish([localScreenTracks]);

    screenButton.style.display = "none";
    cameraButton.classList.remove("active");
    cameraButton.style.display = "none";

    // handle chrome 'stop sharing'
    localScreenTracks.on("track-ended", async () => {
      sharingScreen = false;
      await client.unpublish([localScreenTracks]);
      cameraButton.style.display = "block";
      displayFrame.style.display = "none";
      screenButton.style.display = "block";
      document.getElementById("streams__container").style.display = "flex";
      document.getElementById(`user-${uid}`).remove();
      console.warn("unpublish localScreenTracks");
      hideDisplayFrame();
      switchToCamera();
    });
  } else {
    sharingScreen = false;
    cameraButton.style.display = "block";
    displayFrame.style.display = "none";
    screenButton.style.display = "block";
    document.getElementById("streams__container").style.display = "flex";
    document.getElementById(`user-${uid}`).remove();
    await client.unpublish([localScreenTracks]);
    console.warn("unpublish localScreenTracks");
    hideDisplayFrame();
    switchToCamera();
  }
};

let leaveStream = async (e) => {
  e.preventDefault();

  document.getElementsByClassName("stream__actions")[0].style.display = "none";

  for (let i = 0; localTracks.length > i; i++) {
    localTracks[i].stop();
    localTracks[i].close();
  }

  await client.unpublish([localTracks[0], localTracks[1]]);

  document.getElementById(`user-${uid}`).remove();

  if (userIdInDisplayFrame === `user-${uid}`) {
    displayFrame.style.display = null;
  }

  if (localScreenTracks) {
    console.warn("leaveStream localScreenTracks");
    await client.unpublish([localScreenTracks]);
  }

  channel.sendMessage({
    text: JSON.stringify({ type: "user_left", uid: uid }),
  });

  setTimeout(() => {
    window.location = "index.html";
  }, 1000);
};

document.getElementById("camera-btn").addEventListener("click", toggleCamera);
document.getElementById("mic-btn").addEventListener("click", toggleMic);
document.getElementById("leave-btn").addEventListener("click", leaveStream);
document.getElementById("screen-btn").addEventListener("click", toggleScreen);
document
  .getElementById("videoInputSelect")
  .addEventListener("change", async (event) => {
    await changeDevice("video", event.target.value);
  });

document
  .getElementById("audioInputSelect")
  .addEventListener("change", async (event) => {
    await changeDevice("audio", event.target.value);
  });

document
  .getElementById("audioOutputSelect")
  .addEventListener("change", async (event) => {
    const audioOutputDeviceId = event.target.value;
    const audioElement = document.querySelector("audio");
    if (audioElement && audioElement.setSinkId) {
      audioElement.setSinkId(audioOutputDeviceId).catch((error) => {
        console.error("Error assigning audio output device.", error);
      });
    }
  });

joinRoomInit();
