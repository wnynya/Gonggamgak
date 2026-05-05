const localVideo = document.querySelector('#local-video');
const overlay = document.querySelector('#overlay');
const statusText = document.querySelector('#status');

const SIGNAL_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/webrtc`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let ws;
let pc;
let localStream;
let started = false;
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

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      send('webrtc-ice', event.candidate);
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    setStatus(`WebRTC ${pc.connectionState}`);
  });
}

async function makeOffer() {
  if (!localStream) {
    return;
  }

  createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send('webrtc-offer', pc.localDescription);
  setStatus('offer 전송');
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
    setStatus('시그널 연결됨');
    send('webrtc-join', { role: 'sender' });
  });

  ws.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);

    if (message.event === 'webrtc-receiver-ready') {
      await makeOffer();
    } else if (message.event === 'webrtc-answer' && pc) {
      await pc.setRemoteDescription(message.data);
      await flushPendingCandidates();
      setStatus('answer 수신');
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

async function start() {
  if (started) {
    return;
  }

  started = true;
  overlay.textContent = '로딩';
  setStatus('카메라 시작');

  localStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user',
    },
    audio: false,
  });

  localVideo.srcObject = localStream;
  overlay.classList.add('is-hidden');
  connectSignal();
}

overlay.addEventListener('click', () => {
  start().catch((error) => {
    console.error(error);
    started = false;
    overlay.textContent = '다시 시작하기';
    setStatus('시작 실패');
  });
});
