class VideoChat {
  constructor(appId) {
    this.APP_ID = appId;
    this.token = null;
    this.uid = String(Math.floor(Math.random() * 10000));
    this.client = null;
    this.channel = null;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.servers = {
      iceServers: [
        // Detailed list of STUN servers
        { urls: "stun:stun.vodafone.ro:3478" },
        { urls: "stun:stun.services.mozilla.com:3478" },
        { urls: "stun:stun.gmx.net:3478" },
        { urls: "stun:stun.nottingham.ac.uk:3478" },
        { urls: "stun:stun1.l.google.com" },
        { urls: "stun:stun2.l.google.com" },
        { urls: "stun:freestun.net:3479" },
        { urls: "stun:freestun.net:5350" },
        { urls: "stun:stun.l.google.com" },
      ],
    };
    this.constraints = {
      video: {
        width: { min: 640, ideal: 1920, max: 1920 },
        height: { min: 480, ideal: 1080, max: 1080 },
      },
      audio: true,
    };
    this.roomId = new URLSearchParams(window.location.search).get("room");
    if (!this.roomId) {
      window.location = "lobby.html";
    }
    this.queuedCandidates = [];
    this.init();
  }

  async init() {
    this.client = await AgoraRTM.createInstance(this.APP_ID);
    console.log("RTM client initialized.");
    await this.client.login({ uid: this.uid, token: this.token });
    console.log("Logged into Agora RTM system.");

    this.channel = this.client.createChannel(this.roomId);
    await this.channel.join();
    console.log("Joined channel successfully.");

    this.channel.on("MemberJoined", this.handleUserJoined.bind(this));
    this.channel.on("MemberLeft", this.handleUserLeft.bind(this));
    this.client.on("MessageFromPeer", this.handleMessageFromPeer.bind(this));

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(
        this.constraints
      );
      document.getElementById("user-1").srcObject = this.localStream;
      document.getElementById("user-1").muted = true; // Mute the local video element to prevent echo
      console.log("Local stream obtained and set.");
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  }

  handleUserLeft(MemberId) {
    document.getElementById("user-2").style.display = "none";
    document.getElementById("user-1").classList.remove("smallFrame");
  }

  processQueuedCandidates() {
    while (this.queuedCandidates.length > 0) {
      const candidate = this.queuedCandidates.shift();
      this.peerConnection
        .addIceCandidate(candidate)
        .then(() => console.log("Queued candidate added successfully."))
        .catch((error) =>
          console.error("Failed to add queued candidate:", error)
        );
    }
  }

  async handleMessageFromPeer(message, MemberId) {
    message = JSON.parse(message.text);

    if (message.type === "offer") {
      await this.createAnswer(MemberId, message.offer);
    } else if (message.type === "answer") {
      await this.addAnswer(message.answer);
    } else if (message.type === "candidate") {
      let candidate = new RTCIceCandidate(message.candidate);
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        try {
          await this.peerConnection.addIceCandidate(candidate);
          console.log("ICE candidate added:", candidate);
        } catch (error) {
          console.error("Failed to add ICE candidate:", error);
        }
      } else {
        this.queuedCandidates.push(candidate);
        console.log("ICE candidate queued:", candidate);
      }
    }
  }

  async handleUserJoined(MemberId) {
    console.log("A new user joined the channel:", MemberId);
    if (!this.localStream) {
      console.log("Local stream not ready when handling new user.");
      return;
    }
    await this.createOffer(MemberId);
  }

  async createPeerConnection(MemberId) {
    this.peerConnection = new RTCPeerConnection(this.servers);
    console.log("Peer connection created.");

    this.remoteStream = new MediaStream();
    document.getElementById("user-2").srcObject = this.remoteStream;
    document.getElementById("user-2").style.display = "block";
    document.getElementById("user-1").classList.add("smallFrame");

    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
      console.log(`Local track added: ${track.kind}`);
    });

    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        document.getElementById("user-2").srcObject = this.remoteStream;
      }
      event.streams[0].getTracks().forEach((track) => {
        this.remoteStream.addTrack(track);
        console.log("Track added to remote stream:", track.kind);
      });
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(
        `ICE Connection State Change: ${this.peerConnection.iceConnectionState}`
      );
      if (this.peerConnection.iceConnectionState === "failed") {
        console.error(
          "ICE Connection has failed. Check network or STUN/TURN configurations."
        );
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send each candidate to the remote peer as soon as it's available
        this.client.sendMessageToPeer(
          {
            text: JSON.stringify({
              type: "candidate",
              candidate: event.candidate,
            }),
          },
          MemberId
        );
      } else {
        // ICE gathering has finished
        console.log("ICE gathering state complete");
        this.client.sendMessageToPeer(
          {
            text: JSON.stringify({
              type: "endOfCandidates",
            }),
          },
          MemberId
        );
      }
    };

    while (this.queuedCandidates.length > 0) {
      const candidate = this.queuedCandidates.shift();
      this.peerConnection.addIceCandidate(candidate);
    }
  }

  async createOffer(MemberId) {
    if (!this.localStream) {
      console.log("Local stream not ready when creating offer.");
      return;
    }
    console.log("Creating offer for member:", MemberId);
    await this.createPeerConnection(MemberId);

    let offer = await this.peerConnection.createOffer();
    console.log("Offer created:", offer);
    await this.peerConnection.setLocalDescription(offer);
    console.log("Local description set to offer");

    this.client.sendMessageToPeer(
      {
        text: JSON.stringify({ type: "offer", offer: offer }),
      },
      MemberId
    );
  }

  async createAnswer(MemberId, offer) {
    if (!this.localStream) {
      console.log("Local stream not ready when creating answer.");
      await this.waitForStreamSetup();
      return this.createAnswer(MemberId, offer);
    }
    console.log("Creating answer for offer from:", MemberId);
    await this.createPeerConnection(MemberId);

    // Ensure the remote description is set before adding any ICE candidates
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer)
    );
    console.log("Remote description set to offer");

    let answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    console.log("Local description set to answer");

    this.client.sendMessageToPeer(
      {
        text: JSON.stringify({ type: "answer", answer: answer }),
      },
      MemberId
    );
    // Now that the remote description is set, add any queued candidates
    this.processQueuedCandidates();
  }

  async waitForStreamSetup() {
    let attempts = 0;
    while (!this.localStream && attempts < 10) {
      // Maximum 10 attempts
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for 500 ms
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(
          this.constraints
        );
        document.getElementById("user-1").srcObject = this.localStream;
      } catch (error) {
        console.error("Failed to get local stream on retry:", error);
        attempts++;
      }
    }
    if (!this.localStream) {
      console.error("Failed to setup local stream after retries.");
      alert(
        "Unable to access your camera/microphone. Please check permission settings and hardware."
      );
    }
  }

  async addAnswer(answer) {
    if (!this.peerConnection) {
      console.log("Peer connection not established when trying to add answer.");
      return;
    }
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
    while (this.queuedCandidates.length > 0) {
      const candidate = this.queuedCandidates.shift();
      this.peerConnection.addIceCandidate(candidate);
    }
    this.processQueuedCandidates(); // Process any candidates that were queued
  }

  async leaveChannel() {
    await this.channel.leave();
    await this.client.logout();
  }

  async toggleCamera() {
    let videoTrack = this.localStream
      .getTracks()
      .find((track) => track.kind === "video");
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById("camera-btn").style.backgroundColor =
        videoTrack.enabled ? "rgb(179, 102, 249, .9)" : "rgb(255, 80, 80)";
    } else {
      console.error("No video track available in the local stream.");
      alert(
        "No video track found. Please check your camera settings and permissions."
      );
    }
  }

  async toggleMic() {
    let audioTrack = this.localStream
      .getTracks()
      .find((track) => track.kind == "audio");
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById("mic-btn").style.backgroundColor =
        audioTrack.enabled ? "rgb(179, 102, 249, .9)" : "rgb(255, 80, 80)";
    } else {
      console.error("No audio track available in the local stream.");
      alert(
        "No audio track found. Please check your microphone settings and permissions."
      );
    }
  }
}

// Event listeners and instance creation
const videoChat = new VideoChat("05e0a4c74bfb4211ab5afb2d41b25691");
window.addEventListener("beforeunload", () => videoChat.leaveChannel());
document
  .getElementById("camera-btn")
  .addEventListener("click", () => videoChat.toggleCamera());
document
  .getElementById("mic-btn")
  .addEventListener("click", () => videoChat.toggleMic());
