const preview = document.querySelector('#preview');
const cameraSelect = document.querySelector('#camera-select');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const signalState = document.querySelector('#signal-state');
const streamState = document.querySelector('#stream-state');
const peerCount = document.querySelector('#peer-count');

const SIGNAL_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/webrtc/sight`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const VIDEO_CONSTRAINTS = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'environment',
};
const VIDEO_MAX_BITRATE = 6_000_000;

let ws;
let localStream;
let localPeerId = '';
let selectedDeviceId = '';
let signalReconnectTimer = 0;
const peers = new Map();

function setSignalState(text) {
  signalState.textContent = text;
}

function setStreamState(text) {
  streamState.textContent = text;
}

function updatePeerCount() {
  peerCount.textContent = `수신 ${peers.size}`;
}

function send(event, data = {}, target = '') {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(
    JSON.stringify({
      event,
      data: { ...toSignalData(data), target },
      message: event,
    }),
  );
}

function toSignalData(data = {}) {
  if (data && typeof data.toJSON === 'function') {
    return data.toJSON();
  }

  if (data && typeof data === 'object') {
    return data;
  }

  return {};
}

function receiverIdFrom(message) {
  return message.data?.from || message.data?.id || '';
}

function stripSignalData(data = {}) {
  const { from, target, role, sourceRole, id, ...payload } = data;
  return payload;
}

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    cameraSelect.innerHTML = '<option>카메라 목록 없음</option>';
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  cameraSelect.innerHTML = '';

  for (let index = 0; index < cameras.length; index++) {
    const camera = cameras[index];
    const option = document.createElement('option');
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${index + 1}`;
    cameraSelect.append(option);
  }

  if (!cameras.length) {
    const option = document.createElement('option');
    option.textContent = '카메라 없음';
    cameraSelect.append(option);
  }

  if (selectedDeviceId) {
    cameraSelect.value = selectedDeviceId;
  }
}

function closePeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) {
    return;
  }

  peer.pc.close();
  peers.delete(peerId);
  updatePeerCount();
}

function closePeers() {
  for (const peerId of peers.keys()) {
    closePeer(peerId);
  }
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

  await peer.pc.addIceCandidate(stripSignalData(candidate));
}

async function flushPendingCandidates(peer) {
  for (const candidate of peer.pendingCandidates) {
    await peer.pc.addIceCandidate(stripSignalData(candidate));
  }

  peer.pendingCandidates = [];
}

function createPeer(peerId) {
  closePeer(peerId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = { pc, pendingCandidates: [] };

  for (const track of localStream.getTracks()) {
    const sender = pc.addTrack(track, localStream);
    tuneSender(sender, track);
  }

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      send('webrtc-ice', event.candidate, peerId);
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    if (['closed', 'disconnected', 'failed'].includes(pc.connectionState)) {
      closePeer(peerId);
    }
  });

  peers.set(peerId, peer);
  updatePeerCount();
  return peer;
}

function tuneSender(sender, track) {
  if (track.kind !== 'video' || !sender.getParameters) {
    return;
  }

  track.contentHint = 'detail';

  const parameters = sender.getParameters();
  parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
  parameters.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
  parameters.encodings[0].maxFramerate = 30;
  parameters.encodings[0].scaleResolutionDownBy = 1;

  sender.setParameters(parameters).catch(() => {});
}

async function makeOffer(peerId) {
  if (!localStream || !peerId || peerId === localPeerId) {
    return;
  }

  const peer = createPeer(peerId);
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  send('webrtc-offer', peer.pc.localDescription, peerId);
  setSignalState('offer 전송');
}

function connectSignal() {
  clearTimeout(signalReconnectTimer);
  ws?.close();
  ws = new WebSocket(SIGNAL_URL);

  ws.addEventListener('open', () => {
    setSignalState('시그널 연결됨');
    send('webrtc-join', { role: 'sight-input' });
  });

  ws.addEventListener('message', async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (message.event === 'webrtc-peer-id') {
      localPeerId = message.data.id;
      return;
    }

    if (message.event === 'webrtc-receiver-ready') {
      await makeOffer(receiverIdFrom(message));
    } else if (message.event === 'webrtc-answer') {
      const peerId = receiverIdFrom(message);
      const peer = peers.get(peerId);
      if (!peer) {
        return;
      }
      await peer.pc.setRemoteDescription(stripSignalData(message.data));
      await flushPendingCandidates(peer);
      setSignalState('answer 수신');
    } else if (message.event === 'webrtc-ice') {
      await addIceCandidate(receiverIdFrom(message), message.data);
    } else if (message.event === 'webrtc-bye') {
      closePeer(receiverIdFrom(message));
    }
  });

  ws.addEventListener('close', () => {
    setSignalState('시그널 끊김');
    closePeers();
    signalReconnectTimer = setTimeout(connectSignal, 1200);
  });

  ws.addEventListener('error', () => {
    setSignalState('시그널 오류');
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStreamState('getUserMedia 미지원');
    return;
  }

  stopCamera();
  selectedDeviceId = cameraSelect.value;
  setStreamState('카메라 시작 중');

  const video = selectedDeviceId
    ? { ...VIDEO_CONSTRAINTS, deviceId: { exact: selectedDeviceId } }
    : VIDEO_CONSTRAINTS;

  localStream = await navigator.mediaDevices.getUserMedia({
    video,
    audio: false,
  });

  for (const track of localStream.getVideoTracks()) {
    track.contentHint = 'detail';
  }
  preview.srcObject = localStream;

  await listCameras();
  startButton.disabled = true;
  stopButton.disabled = false;
  setStreamState('카메라 송출 중');

  if (!ws || ws.readyState === WebSocket.CLOSED) {
    connectSignal();
  } else {
    send('webrtc-join', { role: 'sight-input' });
  }
}

function stopCamera() {
  closePeers();

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
  }

  localStream = null;
  preview.srcObject = null;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStreamState('카메라 대기');
}

cameraSelect.addEventListener('change', () => {
  selectedDeviceId = cameraSelect.value;
  if (localStream) {
    startCamera().catch((error) => {
      console.error(error);
      setStreamState('카메라 전환 실패');
    });
  }
});

startButton.addEventListener('click', () => {
  startCamera().catch((error) => {
    console.error(error);
    stopCamera();
    setStreamState('카메라 시작 실패');
  });
});

stopButton.addEventListener('click', () => {
  stopCamera();
});

window.addEventListener('pagehide', () => {
  send('webrtc-bye', { id: localPeerId });
  stopCamera();
  ws?.close();
});

listCameras().catch(() => {
  cameraSelect.innerHTML = '<option>카메라 권한 필요</option>';
});
