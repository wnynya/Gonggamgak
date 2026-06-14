import EventEmitter from './eventemitter.js';
import WebSocketClient from './websocket-client.js';

class WebRTCReceiver extends EventEmitter {
  constructor(signalUrl, options = {}) {
    super();

    this.signalUrl = signalUrl;
    this.iceServers = options.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
    ];
    this.role = options.role || 'webrtc-receiver';
    this.sourceRole = options.sourceRole || '';
    this.mediaStream = new MediaStream();

    this.wsc = null;
    this.pc = null;
    this.localPeerId = '';
    this.senderPeerId = '';
    this.pendingCandidates = [];

    if (options.autoConnect !== false) {
      queueMicrotask(() => this.connect());
    }
  }

  connect() {
    if (this.wsc && !this.wsc.closed) {
      return;
    }

    this.wsc = new WebSocketClient(this.signalUrl, {
      autoReconnect: true,
    });

    this.wsc.on('open', () => {
      this.emit('open');
      this.setStatus('시그널 연결됨');
      this.wsc.event('webrtc-join', { role: this.role });
      this.sendReady();
    });

    this.wsc.on('json', (con, event, data, message) => {
      this.handleSignalMessage({ event, data, message }).catch((error) => {
        console.error(error);
        this.setStatus('신호 처리 실패');
      });
    });

    this.wsc.on('close', (event) => {
      this.emit('close', event);
      this.setStatus('시그널 끊김');
    });

    this.wsc.on('error', (error) => {
      this.emit('error', error);
      this.setStatus('시그널 오류');
    });

    this.wsc.open();
  }

  stop() {
    this.send('webrtc-bye', { id: this.localPeerId });
    this.pc?.close();
    this.wsc?.close();

    this.pc = null;
    this.wsc = null;
    this.senderPeerId = '';
    this.pendingCandidates = [];

    for (const track of this.mediaStream.getTracks()) {
      this.mediaStream.removeTrack(track);
    }
  }

  setStatus(text) {
    this.emit('status', text);
  }

  send(event, data = {}, target = this.senderPeerId) {
    if (!this.wsc || !this.wsc.connected) {
      return;
    }

    this.wsc.send({
      event,
      data: { ...this.toSignalData(data), target },
      message: event,
    });
  }

  toSignalData(data = {}) {
    if (data && typeof data.toJSON === 'function') {
      return data.toJSON();
    }

    if (data && typeof data === 'object') {
      return data;
    }

    return {};
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

  async handleSignalMessage(message) {
    if (message.event === 'webrtc-peer-id') {
      this.localPeerId = message.data.id;
      this.sendReady();
      return;
    }

    if (this.acceptsSource(message)) {
      this.sendReady(message.data?.from);
    } else if (message.event === 'webrtc-offer') {
      await this.answerOffer(message);
    } else if (message.event === 'webrtc-ice') {
      if (!this.senderPeerId || message.data?.from === this.senderPeerId) {
        await this.addIceCandidate(this.stripSignalData(message.data));
      }
    } else if (
      message.event === 'webrtc-bye' &&
      message.data?.from === this.senderPeerId
    ) {
      this.stop();
      this.setStatus('스트림 종료');
    }
  }

  async answerOffer(message) {
    this.senderPeerId = message.data?.from || '';
    this.createPeerConnection();

    await this.pc.setRemoteDescription(this.stripSignalData(message.data));
    await this.flushPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.send('webrtc-answer', this.pc.localDescription);
    this.setStatus('answer 전송');
  }

  stripSignalData(data = {}) {
    const { from, target, role, sourceRole, id, ...payload } = data;
    return payload;
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
      this.emit('stream', this.mediaStream);
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
