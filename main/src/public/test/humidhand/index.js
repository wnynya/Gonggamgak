import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';
import WebsocketClient from '../../websocket-client.mjs';

const video = document.querySelector('#camera');
const canvas = document.querySelector('#output');
const ctx = canvas.getContext('2d');
const startOverlay = document.querySelector('#start');

const FINGER_TIPS = [8, 12, 16, 20];
const FINGER_PIPS = [6, 10, 14, 18];
const STABLE_FRAME_COUNT = 8;
const PRESS_DELAY = 180;

let handLandmarker;
let stream;
let lastVideoTime = -1;
let humidOn = false;
let currentGesture = 'none';
let pendingGesture = 'none';
let pendingFrames = 0;
let busy = false;
let starting = false;

const wsc = new WebsocketClient('/main');

wsc.on('open', () => {
  console.log('wsc open');
});
wsc.on('close', () => {
  console.log('wsc close');
});
wsc.on('error', (error) => {
  console.log('wsc error:', error);
});
wsc.open();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendPress(count = 1) {
  for (let i = 0; i < count; i++) {
    wsc.event('smell-press', 1);

    if (i < count - 1) {
      await sleep(PRESS_DELAY);
    }
  }
}

async function turnHumidOn() {
  if (humidOn || busy) {
    return;
  }

  busy = true;
  await sendPress();
  humidOn = true;
  busy = false;
}

async function turnHumidOff() {
  if (!humidOn || busy) {
    return;
  }

  busy = true;
  await sendPress(2);
  humidOn = false;
  busy = false;
}

function getDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function getGesture(landmarks) {
  const wrist = landmarks[0];
  let openFingerCount = 0;

  for (let i = 0; i < FINGER_TIPS.length; i++) {
    const tip = landmarks[FINGER_TIPS[i]];
    const pip = landmarks[FINGER_PIPS[i]];

    if (getDistance(tip, wrist) > getDistance(pip, wrist) * 1.08) {
      openFingerCount++;
    }
  }

  if (openFingerCount >= 3) {
    return 'open';
  }

  if (openFingerCount <= 1) {
    return 'closed';
  }

  return currentGesture;
}

function updateGesture(nextGesture) {
  if (nextGesture === pendingGesture) {
    pendingFrames++;
  } else {
    pendingGesture = nextGesture;
    pendingFrames = 1;
  }

  if (pendingFrames < STABLE_FRAME_COUNT || nextGesture === currentGesture) {
    return;
  }

  currentGesture = nextGesture;

  if (currentGesture === 'open') {
    turnHumidOn();
  } else if (currentGesture === 'closed') {
    turnHumidOff();
  }
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

function getLandmarkPoint(point) {
  const sourceWidth = video.videoWidth || canvas.width;
  const sourceHeight = video.videoHeight || canvas.height;
  const rect = getCoverRect(sourceWidth, sourceHeight, canvas.width, canvas.height);
  const sourceX = (1 - point.x) * sourceWidth;
  const sourceY = point.y * sourceHeight;

  return {
    x: ((sourceX - rect.sx) / rect.sw) * canvas.width,
    y: ((sourceY - rect.sy) / rect.sh) * canvas.height,
  };
}

function drawLandmarks(landmarks) {
  ctx.fillStyle = '#f9f3de';
  ctx.strokeStyle = '#15d1a6';
  ctx.lineWidth = 4;

  for (const point of landmarks) {
    const screenPoint = getLandmarkPoint(point);

    ctx.beginPath();
    ctx.arc(screenPoint.x, screenPoint.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function render(results) {
  resizeCanvas();
  const rect = getCoverRect(video.videoWidth, video.videoHeight, canvas.width, canvas.height);

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

  const landmarks = results.landmarks?.[0];

  if (!landmarks) {
    return;
  }

  drawLandmarks(landmarks);
  updateGesture(getGesture(landmarks));
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
  });
}

async function startCamera() {
  if (stream) {
    return;
  }

  startOverlay.textContent = '로딩';

  if (!handLandmarker) {
    await createHandLandmarker();
  }

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
  startOverlay.classList.add('is-hidden');
  requestAnimationFrame(loop);
}

function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const results = handLandmarker.detectForVideo(video, performance.now());
    render(results);
  }

  requestAnimationFrame(loop);
}

async function handleStart() {
  if (starting || stream) {
    return;
  }

  starting = true;
  startOverlay.classList.add('is-loading');

  try {
    await startCamera();
  } catch (error) {
    console.error(error);
    startOverlay.textContent = '카메라 시작 실패';
    startOverlay.classList.remove('is-loading');
    starting = false;
  }
}

startOverlay.addEventListener('click', handleStart);
startOverlay.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleStart();
  }
});
