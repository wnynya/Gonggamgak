class WebRTCReceiver extends EventTarget {
  constructor(signalUrl, options = {}) {
    super();

    this.signalUrl = signalUrl;
    this.iceServers = options.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
    ];
    this.role = options.role || 'webrtc-receiver';
    this.sourceRole = options.sourceRole || '';
    this.mediaStream = new MediaStream();

    this.ws = null;
    this.pc = null;
    this.localPeerId = '';
    this.senderPeerId = '';
    this.pendingCandidates = [];

    if (options.autoConnect !== false) {
      queueMicrotask(() => this.connect());
    }
  }

  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(this.signalUrl);

    this.ws.addEventListener('open', () => {
      this.setStatus('시그널 연결됨');
      this.send('webrtc-join', { role: this.role }, '');
      this.sendReady();
    });

    this.ws.addEventListener('message', (event) => {
      this.handleSignalMessage(event).catch((error) => {
        console.error(error);
        this.setStatus('신호 처리 실패');
      });
    });

    this.ws.addEventListener('close', () => {
      this.setStatus('시그널 끊김');
    });

    this.ws.addEventListener('error', () => {
      this.setStatus('시그널 오류');
    });
  }

  stop() {
    this.send('webrtc-bye', { id: this.localPeerId });
    this.pc?.close();
    this.ws?.close();

    this.pc = null;
    this.ws = null;
    this.senderPeerId = '';
    this.pendingCandidates = [];

    for (const track of this.mediaStream.getTracks()) {
      this.mediaStream.removeTrack(track);
    }
  }

  setStatus(text) {
    this.dispatchEvent(new CustomEvent('status', { detail: text }));
  }

  send(event, data = {}, target = this.senderPeerId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({ event, data, message: event, target }));
  }

  sendReady(target = '') {
    this.send(
      'webrtc-receiver-ready',
      { id: this.localPeerId, role: this.role, sourceRole: this.sourceRole },
      target,
    );
  }

  acceptsSource(message) {
    if (message.event !== 'webrtc-join') {
      return false;
    }

    if (!this.sourceRole) {
      return true;
    }

    return message.data?.role === this.sourceRole;
  }

  async handleSignalMessage(event) {
    const message = JSON.parse(event.data);

    if (message.event === 'webrtc-peer-id') {
      this.localPeerId = message.data.id;
      this.sendReady();
      return;
    }

    if (this.acceptsSource(message)) {
      this.sendReady(message.from);
    } else if (message.event === 'webrtc-offer') {
      await this.answerOffer(message);
    } else if (message.event === 'webrtc-ice') {
      if (!this.senderPeerId || message.from === this.senderPeerId) {
        await this.addIceCandidate(message.data);
      }
    } else if (
      message.event === 'webrtc-bye' &&
      message.from === this.senderPeerId
    ) {
      this.stop();
      this.setStatus('스트림 종료');
    }
  }

  async answerOffer(message) {
    this.senderPeerId = message.from || '';
    this.createPeerConnection();

    await this.pc.setRemoteDescription(message.data);
    await this.flushPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.send('webrtc-answer', this.pc.localDescription);
    this.setStatus('answer 전송');
  }

  createPeerConnection() {
    this.pc?.close();
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pendingCandidates = [];

    for (const track of this.mediaStream.getTracks()) {
      this.mediaStream.removeTrack(track);
    }

    this.pc.addEventListener('track', (event) => {
      for (const track of event.streams[0]?.getTracks() || [event.track]) {
        if (!this.mediaStream.getTracks().includes(track)) {
          this.mediaStream.addTrack(track);
        }
      }

      this.setStatus('스트림 수신 중');
      this.dispatchEvent(
        new CustomEvent('stream', { detail: this.mediaStream }),
      );
    });

    this.pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        this.send('webrtc-ice', event.candidate);
      }
    });

    this.pc.addEventListener('connectionstatechange', () => {
      this.setStatus(`WebRTC ${this.pc.connectionState}`);
    });
  }

  async addIceCandidate(candidate) {
    if (!this.pc) {
      return;
    }

    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }

    await this.pc.addIceCandidate(candidate);
  }

  async flushPendingCandidates() {
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(candidate);
    }

    this.pendingCandidates = [];
  }
}

export default WebRTCReceiver;
