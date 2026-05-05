import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';

const video = document.querySelector('#camera');
const canvas = document.querySelector('#output');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const startButton = document.querySelector('#start');
const wsUrlInput = document.querySelector('#ws-url');
const statusText = document.querySelector('#status');
const metricsText = document.querySelector('#metrics');

const DEFAULT_WS_URL = '/sight';
const FRAME_INTERVAL = 33;
const FINGER_TIPS = [8, 12, 16, 20];
const FINGER_MIDS = [6, 10, 14, 18];
const CONNECTIONS = [
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

let handLandmarker;
let stream;
let ws;
let prevLandmarks = null;
let lastVideoTime = -1;
let lastSendTime = 0;
let started = false;

const wsParam = new URLSearchParams(window.location.search).get('ws');
if (wsParam) {
  wsUrlInput.value = wsParam;
} else {
  wsUrlInput.value = DEFAULT_WS_URL;
}

function setStatus(text) {
  statusText.textContent = text;
}

function getAveragePoint(landmarks) {
  const sum = landmarks.reduce(
    (point, landmark) => ({
      x: point.x + landmark.x,
      y: point.y + landmark.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / landmarks.length,
    y: sum.y / landmarks.length,
  };
}

function calculateHandData(landmarks, previousLandmarks) {
  const center = getAveragePoint(landmarks);
  const previousCenter = previousLandmarks
    ? getAveragePoint(previousLandmarks)
    : center;
  const moveX = center.x - previousCenter.x;
  const moveY = center.y - previousCenter.y;
  const rawSpeed = Math.sqrt(moveX ** 2 + moveY ** 2) * 100;

  let extendedCount = 0;

  for (let i = 0; i < FINGER_TIPS.length; i++) {
    if (landmarks[FINGER_TIPS[i]].y < landmarks[FINGER_MIDS[i]].y) {
      extendedCount++;
    }
  }

  if (landmarks[4].x > landmarks[3].x) {
    extendedCount++;
  }

  return {
    speed: Number(Math.min(rawSpeed, 5.0).toFixed(4)),
    openness: Number((extendedCount / 5.0).toFixed(4)),
    direction: Number(Math.atan2(moveY, moveX).toFixed(4)),
    position_x: Number(center.x.toFixed(4)),
    position_y: Number(center.y.toFixed(4)),
  };
}

function mirrorLandmarks(landmarks) {
  return landmarks.map((landmark) => ({
    x: 1 - landmark.x,
    y: landmark.y,
    z: landmark.z,
  }));
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
  const rect = getCoverRect(
    sourceWidth,
    sourceHeight,
    canvas.width,
    canvas.height,
  );
  const sourceX = landmark.x * sourceWidth;
  const sourceY = landmark.y * sourceHeight;

  return {
    x: ((sourceX - rect.sx) / rect.sw) * canvas.width,
    y: ((sourceY - rect.sy) / rect.sh) * canvas.height,
  };
}

function drawCamera() {
  resizeCanvas();

  const rect = getCoverRect(
    video.videoWidth,
    video.videoHeight,
    canvas.width,
    canvas.height,
  );

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(-1, 1);
  ctx.drawImage(
    video,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    -canvas.width,
    0,
    canvas.width,
    canvas.height,
  );
  ctx.restore();
}

function drawLandmarks(landmarks) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#00ff73';
  ctx.fillStyle = '#ffffff';

  for (const [start, end] of CONNECTIONS) {
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

function sendHandData(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(data));
}

async function createHandLandmarker() {
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
    numHands: 1,
    minHandDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });
}

function connectWebSocket(url) {
  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    setStatus(`연결됨: ${url}`);
  });

  ws.addEventListener('close', () => {
    setStatus('WebSocket 닫힘');
  });

  ws.addEventListener('error', () => {
    setStatus('WebSocket 오류');
  });
}

async function start() {
  if (started) {
    return;
  }

  started = true;
  startButton.textContent = '로딩';
  setStatus('초기화 중');

  if (!handLandmarker) {
    await createHandLandmarker();
  }

  connectWebSocket(wsUrlInput.value.trim() || DEFAULT_WS_URL);

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user',
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
  overlay.classList.add('is-hidden');
  requestAnimationFrame(loop);
}

function loop(time) {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    drawCamera();

    const results = handLandmarker.detectForVideo(video, performance.now());
    const rawLandmarks = results.landmarks?.[0];

    if (rawLandmarks) {
      const landmarks = mirrorLandmarks(rawLandmarks);
      const data = calculateHandData(landmarks, prevLandmarks);

      drawLandmarks(landmarks);
      metricsText.textContent = `speed ${data.speed.toFixed(2)} / openness ${data.openness.toFixed(2)}`;

      if (time - lastSendTime >= FRAME_INTERVAL) {
        sendHandData(data);
        lastSendTime = time;
      }

      prevLandmarks = landmarks;
    } else {
      prevLandmarks = null;
      metricsText.textContent = '손 인식 대기';
    }
  }

  requestAnimationFrame(loop);
}

startButton.addEventListener('click', () => {
  start().catch((error) => {
    console.error(error);
    started = false;
    startButton.textContent = '다시 시작하기';
    setStatus('시작 실패');
  });
});
