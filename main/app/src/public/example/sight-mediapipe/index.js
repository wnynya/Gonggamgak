import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';

const video = document.querySelector('#remote-video');
const canvas = document.querySelector('#output');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const signalState = document.querySelector('#signal-state');
const mediaState = document.querySelector('#media-state');
const detectState = document.querySelector('#detect-state');

const SIGNAL_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/webrtc/sight`;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];
const FACE_KEYPOINTS = [1, 10, 13, 14, 17, 33, 61, 152, 168, 199, 263, 291];

let ws;
let pc;
let remoteStream;
let localPeerId = '';
let senderPeerId = '';
let handLandmarker;
let faceLandmarker;
let started = false;
let loopStarted = false;
let lastVideoTime = -1;
let pendingCandidates = [];

function setSignalState(text) {
  signalState.textContent = text;
}

function setMediaState(text) {
  mediaState.textContent = text;
}

function setDetectState(handCount, faceCount) {
  detectState.textContent = `손 ${handCount} / 얼굴 ${faceCount}`;
}

function send(event, data = {}, target = senderPeerId) {
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

function stripSignalData(data = {}) {
  const { from, target, role, sourceRole, id, ...payload } = data;
  return payload;
}

function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function getCoverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;

    return {
      sx: (sourceWidth - width) / 2,
      sy: 0,
      sw: width,
      sh: sourceHeight,
    };
  }

  const height = sourceWidth / targetRatio;

  return {
    sx: 0,
    sy: (sourceHeight - height) / 2,
    sw: sourceWidth,
    sh: height,
  };
}

function getScreenPoint(landmark) {
  const sourceWidth = video.videoWidth || canvas.width;
  const sourceHeight = video.videoHeight || canvas.height;
  const rect = getCoverRect(sourceWidth, sourceHeight, canvas.width, canvas.height);
  const sourceX = landmark.x * sourceWidth;
  const sourceY = landmark.y * sourceHeight;

  return {
    x: ((sourceX - rect.sx) / rect.sw) * canvas.width,
    y: ((sourceY - rect.sy) / rect.sh) * canvas.height,
  };
}

function drawVideo() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!video.videoWidth || !video.videoHeight) {
    return;
  }

  const rect = getCoverRect(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
  ctx.drawImage(
    video,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

function drawHandLandmarks(landmarks) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#12f28b';
  ctx.fillStyle = '#f8fff9';

  for (const [start, end] of HAND_CONNECTIONS) {
    const a = getScreenPoint(landmarks[start]);
    const b = getScreenPoint(landmarks[end]);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const landmark of landmarks) {
    const point = getScreenPoint(landmark);

    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFaceLandmarks(landmarks) {
  ctx.fillStyle = 'rgba(80, 190, 255, 0.52)';

  for (let i = 0; i < landmarks.length; i += 3) {
    const point = getScreenPoint(landmarks[i]);

    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#fff2a8';
  for (const index of FACE_KEYPOINTS) {
    const landmark = landmarks[index];
    if (!landmark) {
      continue;
    }

    const point = getScreenPoint(landmark);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function createLandmarkers() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 2,
    minFaceDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
}

function createPeerConnection() {
  pc?.close();
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pendingCandidates = [];
  remoteStream = new MediaStream();
  video.srcObject = remoteStream;

  pc.addEventListener('track', (event) => {
    for (const track of event.streams[0]?.getTracks() || [event.track]) {
      if (!remoteStream.getTracks().includes(track)) {
        remoteStream.addTrack(track);
      }
    }

    setMediaState('스트림 수신 중');
    video.play().catch(() => {});
    startLoop();
  });

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      send('webrtc-ice', event.candidate);
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    setSignalState(`WebRTC ${pc.connectionState}`);
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
    await pc.addIceCandidate(stripSignalData(candidate));
  }

  pendingCandidates = [];
}

function connectSignal() {
  ws = new WebSocket(SIGNAL_URL);

  ws.addEventListener('open', () => {
    setSignalState('시그널 연결됨');
    send('webrtc-join', { role: 'sight-raw-display' }, '');
    send('webrtc-receiver-ready', { id: localPeerId }, '');
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
      send('webrtc-receiver-ready', { id: localPeerId }, '');
      return;
    }

    if (message.event === 'webrtc-join' && message.data?.role === 'sight-input') {
      send('webrtc-receiver-ready', { id: localPeerId }, message.data?.from);
    } else if (message.event === 'webrtc-offer') {
      senderPeerId = message.data?.from || '';
      createPeerConnection();
      await pc.setRemoteDescription(stripSignalData(message.data));
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send('webrtc-answer', pc.localDescription);
      setSignalState('answer 전송');
    } else if (message.event === 'webrtc-ice') {
      if (!senderPeerId || message.data?.from === senderPeerId) {
        await addIceCandidate(message.data);
      }
    } else if (message.event === 'webrtc-bye' && message.data?.from === senderPeerId) {
      setMediaState('스트림 종료');
      pc?.close();
      pc = null;
      senderPeerId = '';
      remoteStream = null;
      video.srcObject = null;
    }
  });

  ws.addEventListener('close', () => {
    setSignalState('시그널 끊김');
  });

  ws.addEventListener('error', () => {
    setSignalState('시그널 오류');
  });
}

function startLoop() {
  if (loopStarted) {
    return;
  }

  loopStarted = true;
  requestAnimationFrame(loop);
}

function loop() {
  drawVideo();

  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.currentTime !== lastVideoTime
  ) {
    lastVideoTime = video.currentTime;
    const timestamp = performance.now();
    const handResults = handLandmarker.detectForVideo(video, timestamp);
    const faceResults = faceLandmarker.detectForVideo(video, timestamp);
    const hands = handResults.landmarks || [];
    const faces = faceResults.faceLandmarks || [];

    for (const landmarks of faces) {
      drawFaceLandmarks(landmarks);
    }

    for (const landmarks of hands) {
      drawHandLandmarks(landmarks);
    }

    setDetectState(hands.length, faces.length);
  }

  requestAnimationFrame(loop);
}

async function start() {
  if (started) {
    return;
  }

  started = true;
  overlay.textContent = '로딩';
  setSignalState('MediaPipe 초기화');

  if (!handLandmarker || !faceLandmarker) {
    await createLandmarkers();
  }

  overlay.classList.add('is-hidden');
  connectSignal();
  startLoop();
}

overlay.addEventListener('click', () => {
  start().catch((error) => {
    console.error(error);
    started = false;
    overlay.textContent = '다시 시작';
    setSignalState('시작 실패');
  });
});

window.addEventListener('pagehide', () => {
  send('webrtc-bye', { id: localPeerId });
  pc?.close();
  ws?.close();
});
