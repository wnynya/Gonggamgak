const audioSelect = document.querySelector('#audio-select');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const signalState = document.querySelector('#signal-state');
const streamState = document.querySelector('#stream-state');
const peerCount = document.querySelector('#peer-count');
const meter = document.querySelector('#meter');
const meterCtx = meter.getContext('2d');

const SIGNAL_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/webrtc/hearing`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

let ws;
let localStream;
let localPeerId = '';
let selectedDeviceId = '';
let signalReconnectTimer = 0;
let audioContext;
let analyser;
let meterFrame = 0;
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

  ws.send(JSON.stringify({ event, data, message: event, target }));
}

function receiverIdFrom(message) {
  return message.from || message.data?.id || message.data?.from || '';
}

async function listAudioInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    audioSelect.innerHTML = '<option>마이크 목록 없음</option>';
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  audioSelect.innerHTML = '';

  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index];
    const option = document.createElement('option');
    option.value = input.deviceId;
    option.textContent = input.label || `Microphone ${index + 1}`;
    audioSelect.append(option);
  }

  if (!inputs.length) {
    const option = document.createElement('option');
    option.textContent = '마이크 없음';
    audioSelect.append(option);
  }

  if (selectedDeviceId) {
    audioSelect.value = selectedDeviceId;
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

  await peer.pc.addIceCandidate(candidate);
}

async function flushPendingCandidates(peer) {
  for (const candidate of peer.pendingCandidates) {
    await peer.pc.addIceCandidate(candidate);
  }

  peer.pendingCandidates = [];
}

function createPeer(peerId) {
  closePeer(peerId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = { pc, pendingCandidates: [] };

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
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
    send('webrtc-join', { role: 'hearing-input' });
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
      await peer.pc.setRemoteDescription(message.data);
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

function resizeMeter() {
  const rect = meter.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * devicePixelRatio));

  if (meter.width !== width || meter.height !== height) {
    meter.width = width;
    meter.height = height;
  }
}

function drawMeter() {
  resizeMeter();
  meterCtx.clearRect(0, 0, meter.width, meter.height);
  meterCtx.fillStyle = '#101010';
  meterCtx.fillRect(0, 0, meter.width, meter.height);

  if (!analyser) {
    return;
  }

  const values = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(values);

  meterCtx.strokeStyle = '#36e6a4';
  meterCtx.lineWidth = 2 * devicePixelRatio;
  meterCtx.beginPath();

  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * meter.width;
    const y = (values[i] / 255) * meter.height;

    if (i === 0) {
      meterCtx.moveTo(x, y);
    } else {
      meterCtx.lineTo(x, y);
    }
  }

  meterCtx.stroke();
  meterFrame = requestAnimationFrame(drawMeter);
}

async function startMeter() {
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(localStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  drawMeter();
}

async function startAudio() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStreamState('getUserMedia 미지원');
    return;
  }

  stopAudio();
  selectedDeviceId = audioSelect.value;
  setStreamState('마이크 시작 중');

  const audio = selectedDeviceId
    ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: selectedDeviceId } }
    : AUDIO_CONSTRAINTS;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio,
  });

  await listAudioInputs();
  await startMeter();
  startButton.disabled = true;
  stopButton.disabled = false;
  setStreamState('마이크 송출 중');

  if (!ws || ws.readyState === WebSocket.CLOSED) {
    connectSignal();
  } else {
    send('webrtc-join', { role: 'hearing-input' });
  }
}

function stopAudio() {
  closePeers();
  cancelAnimationFrame(meterFrame);
  meterFrame = 0;
  analyser = null;
  audioContext?.close();
  audioContext = null;

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
  }

  localStream = null;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStreamState('마이크 대기');
  drawMeter();
}

audioSelect.addEventListener('change', () => {
  selectedDeviceId = audioSelect.value;
  if (localStream) {
    startAudio().catch((error) => {
      console.error(error);
      setStreamState('마이크 전환 실패');
    });
  }
});

startButton.addEventListener('click', () => {
  startAudio().catch((error) => {
    console.error(error);
    stopAudio();
    setStreamState('마이크 시작 실패');
  });
});

stopButton.addEventListener('click', () => {
  stopAudio();
});

window.addEventListener('pagehide', () => {
  send('webrtc-bye', { id: localPeerId });
  stopAudio();
  ws?.close();
});

listAudioInputs().catch(() => {
  audioSelect.innerHTML = '<option>마이크 권한 필요</option>';
});
drawMeter();
