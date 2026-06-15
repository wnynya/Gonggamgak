const shareButton = document.querySelector('#share-button');
const statusText = document.querySelector('#status');

const channel = getChannel('source');
const SIGNAL_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${getSignalHost()}/webrtc/tab${channel}`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let ws;
let localStream;
let localPeerId = '';
let started = false;
const peers = new Map();

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

function closePeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) {
    return;
  }

  peer.pc.close();
  peers.delete(peerId);
}

function createPeerConnection(peerId) {
  closePeer(peerId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = {
    pc,
    pendingCandidates: [],
  };

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      send('webrtc-ice', event.candidate, peerId);
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    setStatus(`tab${channel}: ${pc.connectionState}`);
    if (['closed', 'disconnected', 'failed'].includes(pc.connectionState)) {
      closePeer(peerId);
    }
  });

  peers.set(peerId, peer);
  return peer;
}

async function flushPendingCandidates(peer) {
  for (const candidate of peer.pendingCandidates) {
    await peer.pc.addIceCandidate(candidate);
  }

  peer.pendingCandidates = [];
}

async function makeOffer(peerId) {
  if (!localStream || !peerId || peerId === localPeerId) {
    return;
  }

  const peer = createPeerConnection(peerId);
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  send('webrtc-offer', peer.pc.localDescription, peerId);
  setStatus(`tab${channel}: offer 전송`);
}

async function addIceCandidate(peerId, candidate) {
  const peer = peers.get(peerId);
  if (!peer) {
    return;
  }

  if (!peer.pc.remoteDescription) {
    peer.pendingCandidates.push(candidate);
    return;
  }

  await peer.pc.addIceCandidate(candidate);
}

function connectSignal() {
  if (ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(ws.readyState)) {
    return;
  }

  ws = new WebSocket(SIGNAL_URL);

  ws.addEventListener('open', () => {
    setStatus(`tab${channel}: 시그널 연결됨`);
    send('webrtc-join', { role: `tab-source-${channel}` });
  });

  ws.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    const from = message.data?.from;

    if (message.event === 'webrtc-peer-id') {
      localPeerId = message.data?.id || '';
    } else if (message.event === 'webrtc-receiver-ready') {
      await makeOffer(from);
    } else if (message.event === 'webrtc-answer') {
      const peer = peers.get(from);
      if (!peer) {
        return;
      }

      await peer.pc.setRemoteDescription(message.data);
      await flushPendingCandidates(peer);
      setStatus(`tab${channel}: 공유 중`);
    } else if (message.event === 'webrtc-ice') {
      await addIceCandidate(from, message.data);
    } else if (message.event === 'webrtc-bye') {
      closePeer(from);
    }
  });

  ws.addEventListener('close', () => {
    setStatus(`tab${channel}: 시그널 끊김`);
  });

  ws.addEventListener('error', () => {
    setStatus(`tab${channel}: 시그널 오류`);
  });
}

async function start() {
  if (started) {
    return;
  }

  started = true;
  setStatus(`tab${channel}: 화면 선택 대기`);
  localStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 30, max: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  const [videoTrack] = localStream.getVideoTracks();
  videoTrack.addEventListener('ended', () => {
    for (const peerId of peers.keys()) {
      closePeer(peerId);
    }

    send('webrtc-bye', { id: localPeerId });
    started = false;
    shareButton.classList.remove('is-sharing');
    shareButton.textContent = '화면 공유 선택';
    setStatus(`tab${channel}: 공유 종료`);
  });

  shareButton.classList.add('is-sharing');
  shareButton.textContent = `tab${channel} 공유 중`;
  connectSignal();
}

if (!navigator.mediaDevices?.getDisplayMedia) {
  shareButton.disabled = true;
  shareButton.textContent = '화면 공유 미지원';
  setStatus('getDisplayMedia 미지원');
}

shareButton.addEventListener('click', () => {
  start().catch((error) => {
    console.error(error);
    started = false;
    shareButton.classList.remove('is-sharing');
    shareButton.textContent = '다시 선택';
    setStatus(`tab${channel}: 시작 실패`);
  });
});
