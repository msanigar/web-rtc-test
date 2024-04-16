const APP_ID = "05e0a4c74bfb4211ab5afb2d41b25691";
const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ]
};

const constraints = {
  video: { width: { min: 640, ideal: 1920, max: 1920 }, height: { min: 480, ideal: 1080, max: 1080 } },
  audio: true
};

const getUrlParam = (param) => {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get(param);
};

const redirectToLobbyIfNoRoom = () => {
  const roomId = getUrlParam('room');
  if (!roomId) {
    window.location = 'lobby.html';
    return null;
  }
  return roomId;
};

class StreamManager {
  constructor() {
    this.localStream = null;
    this.remoteStream = null;
  }

  async initializeLocalStream() {
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('user-1').srcObject = this.localStream;
  }

  toggleTrack(kind, btnId, colorOn, colorOff) {
    const track = this.localStream.getTracks().find(track => track.kind === kind);
    if (track.enabled) {
      track.enabled = false;
      document.getElementById(btnId).style.backgroundColor = colorOff;
    } else {
      track.enabled = true;
      document.getElementById(btnId).style.backgroundColor = colorOn;
    }
  }
}

class ConnectionManager {
    constructor(appId, roomId) {
      this.appId = appId;
      this.roomId = roomId;
      this.client = null;
      this.channel = null;
      this.peerConnection = null;
      this.uid = String(Math.floor(Math.random() * 10000));
      this.streamManager = new StreamManager();
    }
  
    async init() {
      this.client = await AgoraRTM.createInstance(this.appId);
      await this.client.login({ uid: this.uid, token: null });
      this.channel = this.client.createChannel(this.roomId);
      await this.channel.join();
      this.addEventListeners();
      await this.streamManager.initializeLocalStream();
    }

  addEventListeners() {
    this.channel.on('MemberJoined', memberId => this.handleUserJoined(memberId));
    this.channel.on('MemberLeft', () => this.handleUserLeft());
    this.client.on('MessageFromPeer', (message, memberId) => this.handleMessageFromPeer(message, memberId));
    window.addEventListener('beforeunload', () => this.leaveChannel());
    document.getElementById('camera-btn').addEventListener('click', () => this.streamManager.toggleTrack('video', 'camera-btn', 'rgb(179, 102, 249, .9)', 'rgb(255, 80, 80)'));
    document.getElementById('mic-btn').addEventListener('click', () => this.streamManager.toggleTrack('audio', 'mic-btn', 'rgb(179, 102, 249, .9)', 'rgb(255, 80, 80)'));
  }
}

(async () => {
  const roomId = redirectToLobbyIfNoRoom();
  if (!roomId) return;
  const connectionManager = new ConnectionManager(APP_ID, roomId);
  await connectionManager.init();
})();