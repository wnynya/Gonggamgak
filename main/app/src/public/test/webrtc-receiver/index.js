const remoteVideo = document.querySelector('#remote-video');
const statusText = document.querySelector('#status');

const SIGNAL_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/webrtc`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let ws;
let pc;
let remoteStream;
let pendingCandidates = [];

function setStatus(text) {
  statusText.textContent = text;
}

function send(event, data = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify({ event, data, message: event }));
}

function createPeerConnection() {
  pc?.close();
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pendingCandidates = [];
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc.addEventListener('track', (event) => {
    remoteStream.addTrack(event.track);
    setStatus('비디오 수신 중');
  });

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      send('webrtc-ice', event.candidate);
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    setStatus(`WebRTC ${pc.connectionState}`);
  });
}

async function addIceCandidate(candidate) {
  if (!pc) {
    return;
  }

  if (!pc.remoteDescription) {
    pendingCandidates.push(candidate);
    return;
  }

  await pc.addIceCandidate(candidate);
}

async function flushPendingCandidates() {
  for (const candidate of pendingCandidates) {
    await pc.addIceCandidate(candidate);
  }

  pendingCandidates = [];
}

function connectSignal() {
  ws = new WebSocket(SIGNAL_URL);

  ws.addEventListener('open', () => {
    createPeerConnection();
    setStatus('시그널 연결됨');
    send('webrtc-join', { role: 'receiver' });
    send('webrtc-receiver-ready');
  });

  ws.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);

    if (message.event === 'webrtc-offer') {
      createPeerConnection();
      await pc.setRemoteDescription(message.data);
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send('webrtc-answer', pc.localDescription);
      setStatus('answer 전송');
    } else if (message.event === 'webrtc-ice' && pc) {
      await addIceCandidate(message.data);
    }
  });

  ws.addEventListener('close', () => {
    setStatus('시그널 연결 끊김');
  });

  ws.addEventListener('error', () => {
    setStatus('시그널 오류');
  });
}

connectSignal();
