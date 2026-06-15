const remoteVideo = document.querySelector('#stream-video');
const fullscreenButton = document.querySelector('#fullscreen-button');
const statusText = document.querySelector('#status');

const channel = getChannel('stream');
const SIGNAL_URL = `wss://g161.ccc.vg/webrtc/tab${channel}`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const SIGNAL_RECONNECT_DELAY = 1500;

let ws;
let pc;
let remoteStream;
let localPeerId = '';
let senderPeerId = '';
let pendingCandidates = [];
let reconnectTimer = null;

function getChannel(kind) {
  const match = location.pathname.match(
    new RegExp(`/tab/${kind}(\\d+)(?:/|$)`),
  );
  return match?.[1] || '1';
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

  ws.send(
    JSON.stringify({
      event,
      data: target ? { ...payloadData, target } : payloadData,
      message: event,
    }),
  );
}

function createPeerConnection() {
  pc?.close();
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const currentPc = pc;
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
    if (currentPc !== pc) {
      return;
    }

    if (currentPc.connectionState === 'connected') {
      setStatus('');
      return;
    }

    if (
      ['closed', 'disconnected', 'failed'].includes(currentPc.connectionState)
    ) {
      setStatus(`stream${channel} 대기`);
      requestFreshOffer();
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
  if (ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(ws.readyState)) {
    return;
  }

  clearReconnectTimer();
  ws = new WebSocket(SIGNAL_URL);

  ws.addEventListener('open', () => {
    createPeerConnection();
    setStatus(`stream${channel} 대기`);
    send('webrtc-join', { role: `tab-stream-${channel}` });
    send('webrtc-receiver-ready', { id: localPeerId });
  });

  ws.addEventListener('message', async (event) => {
    try {
      const message = JSON.parse(event.data);
      const from = message.data?.from;

      if (message.event === 'webrtc-peer-id') {
        localPeerId = message.data?.id || '';
        send('webrtc-receiver-ready', { id: localPeerId });
      } else if (
        message.event === 'webrtc-join' &&
        message.data?.role === `tab-source-${channel}`
      ) {
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
    } catch (error) {
      console.error(error);
      setStatus(`stream${channel} 시그널 처리 오류`);
    }
  });

  ws.addEventListener('close', () => {
    localPeerId = '';
    senderPeerId = '';
    createPeerConnection();
    setStatus(`stream${channel} 재연결 대기`);
    scheduleSignalReconnect();
  });

  ws.addEventListener('error', () => {
    setStatus(`stream${channel} 연결 오류`);
    ws.close();
  });
}

function requestFreshOffer() {
  if (!senderPeerId || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  createPeerConnection();
  send('webrtc-receiver-ready', { id: localPeerId }, senderPeerId);
}

function scheduleSignalReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectSignal();
  }, SIGNAL_RECONNECT_DELAY);
}

function clearReconnectTimer() {
  if (!reconnectTimer) {
    return;
  }

  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
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
