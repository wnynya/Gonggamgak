const remoteVideo = document.querySelector('#stream-video');
const fullscreenButton = document.querySelector('#fullscreen-button');
const statusText = document.querySelector('#status');

const channel = getChannel('stream');
const SIGNAL_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${getSignalHost()}/webrtc/tab${channel}`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let ws;
let pc;
let remoteStream;
let localPeerId = '';
let senderPeerId = '';
let pendingCandidates = [];

function getChannel(kind) {
  const match = location.pathname.match(new RegExp(`/tab/${kind}(\\d+)(?:/|$)`));
  return match?.[1] || '1';
}

function getSignalHost() {
  if (location.port && location.port !== '9501') {
    return `${location.hostname}:9501`;
  }

  return location.host;
}

function setStatus(text) {
  statusText.textContent = text;
  statusText.classList.toggle('is-hidden', text === '');
}

function send(event, data = {}, target = '') {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const payloadData = typeof data?.toJSON === 'function' ? data.toJSON() : data;

  ws.send(JSON.stringify({
    event,
    data: target ? { ...payloadData, target } : payloadData,
    message: event,
  }));
}

function createPeerConnection() {
  pc?.close();
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pendingCandidates = [];
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc.addEventListener('track', (event) => {
    remoteStream.addTrack(event.track);
    remoteVideo.play().catch(() => {});
    setStatus('');
  });

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      send('webrtc-ice', event.candidate, senderPeerId);
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'connected') {
      setStatus('');
      return;
    }

    if (['closed', 'disconnected', 'failed'].includes(pc.connectionState)) {
      setStatus(`stream${channel} 대기`);
    }
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
    setStatus(`stream${channel} 대기`);
    send('webrtc-join', { role: `tab-stream-${channel}` });
    send('webrtc-receiver-ready', { id: localPeerId });
  });

  ws.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    const from = message.data?.from;

    if (message.event === 'webrtc-peer-id') {
      localPeerId = message.data?.id || '';
      send('webrtc-receiver-ready', { id: localPeerId });
    } else if (message.event === 'webrtc-join' && message.data?.role === `tab-source-${channel}`) {
      send('webrtc-receiver-ready', { id: localPeerId }, from);
    } else if (message.event === 'webrtc-offer') {
      senderPeerId = from;
      createPeerConnection();
      await pc.setRemoteDescription(message.data);
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send('webrtc-answer', pc.localDescription, senderPeerId);
    } else if (message.event === 'webrtc-ice') {
      await addIceCandidate(message.data);
    } else if (message.event === 'webrtc-bye' && from === senderPeerId) {
      createPeerConnection();
      senderPeerId = '';
      setStatus(`stream${channel} 대기`);
    }
  });

  ws.addEventListener('close', () => {
    setStatus(`stream${channel} 연결 끊김`);
  });

  ws.addEventListener('error', () => {
    setStatus(`stream${channel} 연결 오류`);
  });
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  if (document.documentElement.requestFullscreen) {
    await document.documentElement.requestFullscreen();
    return;
  }

  if (remoteVideo.webkitEnterFullscreen) {
    remoteVideo.webkitEnterFullscreen();
  }
}

fullscreenButton.addEventListener('click', () => {
  toggleFullscreen().catch((error) => {
    console.error(error);
    setStatus(`stream${channel} 전체화면 실패`);
  });
});

connectSignal();
