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
                {
                    urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
                }
            ]
        };
        this.constraints = {
            video: {
                width: { min: 640, ideal: 1920, max: 1920 },
                height: { min: 480, ideal: 1080, max: 1080 },
            },
            audio: true
        };
        this.roomId = new URLSearchParams(window.location.search).get('room');
        if (!this.roomId) {
            window.location = 'lobby.html';
        }
        this.init();
    }

    async init() {
        this.client = await AgoraRTM.createInstance(this.APP_ID);
        await this.client.login({ uid: this.uid, token: this.token });

        this.channel = this.client.createChannel(this.roomId);
        await this.channel.join();

        this.channel.on('MemberJoined', this.handleUserJoined.bind(this));
        this.channel.on('MemberLeft', this.handleUserLeft.bind(this));

        this.client.on('MessageFromPeer', this.handleMessageFromPeer.bind(this));

        this.localStream = await navigator.mediaDevices.getUserMedia(this.constraints);
        document.getElementById('user-1').srcObject = this.localStream;
    }

    handleUserLeft(MemberId) {
        document.getElementById('user-2').style.display = 'none';
        document.getElementById('user-1').classList.remove('smallFrame');
    }

    async handleMessageFromPeer(message, MemberId) {
        message = JSON.parse(message.text);

        if (message.type === 'offer') {
            this.createAnswer(MemberId, message.offer);
        }
        if (message.type === 'answer') {
            this.addAnswer(message.answer);
        }
        if (message.type === 'candidate') {
            if (this.peerConnection) {
                this.peerConnection.addIceCandidate(message.candidate);
            }
        }
    }

    async handleUserJoined(MemberId) {
        console.log('A new user joined the channel:', MemberId);
        this.createOffer(MemberId);
    }

    async createPeerConnection(MemberId) {
        this.peerConnection = new RTCPeerConnection(this.servers);

        this.remoteStream = new MediaStream();
        document.getElementById('user-2').srcObject = this.remoteStream;
        document.getElementById('user-2').style.display = 'block';

        document.getElementById('user-1').classList.add('smallFrame');

        if (!this.localStream) {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            document.getElementById('user-1').srcObject = this.localStream;
        }

        this.localStream.getTracks().forEach((track) => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        this.peerConnection.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => {
                this.remoteStream.addTrack(track);
            });
        };

        this.peerConnection.onicecandidate = async (event) => {
            if (event.candidate) {
                this.client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId);
            }
        };
    }

    async createOffer(MemberId) {
        await this.createPeerConnection(MemberId);

        let offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        this.client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'offer', 'offer': offer }) }, MemberId);
    }

    async createAnswer(MemberId, offer) {
        await this.createPeerConnection(MemberId);

        await this.peerConnection.setRemoteDescription(offer);

        let answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'answer', 'answer': answer }) }, MemberId);
    }

    async addAnswer(answer) {
        if (!this.peerConnection.currentRemoteDescription) {
            this.peerConnection.setRemoteDescription(answer);
        }
    }

    async leaveChannel() {
        await this.channel.leave();
        await this.client.logout();
    }

    async toggleCamera() {
        let videoTrack = this.localStream.getTracks().find(track => track.kind === 'video');

        if (videoTrack.enabled) {
            videoTrack.enabled = false;
            document.getElementById('camera-btn').style.backgroundColor = 'rgb(255, 80, 80)';
        } else {
            videoTrack.enabled = true;
            document.getElementById('camera-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)';
        }
    }

    async toggleMic() {
        if (!this.localStream) {
            console.error('Local stream not initialized.');
            return;
        }
    
        let audioTrack = this.localStream.getTracks().find(track => track.kind === 'audio');
        if (!audioTrack) {
            console.error('No audio track available in the local stream.');
            return;
        }
    
        audioTrack.enabled = !audioTrack.enabled;  // Toggle the current state
        document.getElementById('mic-btn').style.backgroundColor = audioTrack.enabled ? 'rgb(179, 102, 249, .9)' : 'rgb(255, 80, 80)';
    }
}

// Event listeners and instance creation
window.addEventListener('beforeunload', () => videoChat.leaveChannel());
document.getElementById('camera-btn').addEventListener('click', () => videoChat.toggleCamera());
document.getElementById('mic-btn').addEventListener('click', () => videoChat.toggleMic());

const videoChat = new VideoChat("05e0a4c74bfb4211ab5afb2d41b25691");