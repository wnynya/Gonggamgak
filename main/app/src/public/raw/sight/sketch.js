let video;
let videoSource;
let faceMesh, hands;
let faceLandmarks = [];
let handLandmarks = [];
let w, h;
let videoStatus = 'WebRTC 연결 대기';
const DETECT_WIDTH = 240;
const DETECT_INTERVAL_MS = 1000 / 60;
let detectCanvas;
let detectContext;
let lastDetectTime = 0;
let detectBusy = false;

function setup() {
  createCanvas(1280, 800); // 16:10 비율

  // 이미지 부드럽게 보간(깨짐 방지)
  smooth();

  video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  detectCanvas = document.createElement('canvas');
  detectContext = detectCanvas.getContext('2d', { alpha: false });

  w = width / 2;
  h = height / 2;

  faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceMesh.onResults(onFaceResults);

  hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onHandResults);

  startWebRTCVideo();
}

async function startWebRTCVideo() {
  const { default: WebRTCReceiver } = await import('/webrtc-receiver.js');

  videoSource = new WebRTCReceiver('/webrtc/sight', {
    role: 'sight-raw-display',
    sourceRole: 'sight-input',
    autoConnect: false,
  });

  video.srcObject = videoSource.mediaStream;

  videoSource.on('status', (status) => {
    videoStatus = status;
  });

  videoSource.on('stream', () => {
    videoStatus = '스트림 수신 중';
    video.play().catch(() => {});
  });

  video.addEventListener('loadedmetadata', () => {
    syncVideoSize();
  });

  videoSource.connect();
  requestAnimationFrame(sendWebRTCFrame);
}

async function sendWebRTCFrame() {
  const now = performance.now();

  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    !detectBusy &&
    now - lastDetectTime >= DETECT_INTERVAL_MS
  ) {
    syncVideoSize();

    try {
      detectBusy = true;
      lastDetectTime = now;
      const image = getDetectionImage();

      await faceMesh.send({ image });
      await hands.send({ image });
    } catch (error) {
      videoStatus = error.message || 'MediaPipe 오류';
      console.error(error);
    } finally {
      detectBusy = false;
    }
  }

  requestAnimationFrame(sendWebRTCFrame);
}

function getDetectionImage() {
  const videoWidth = getVideoWidth();
  const videoHeight = getVideoHeight();

  if (!videoWidth || !videoHeight) {
    return video;
  }

  const detectWidth = Math.min(DETECT_WIDTH, videoWidth);
  const detectHeight = Math.max(
    1,
    Math.round(detectWidth * (videoHeight / videoWidth)),
  );

  if (
    detectCanvas.width !== detectWidth ||
    detectCanvas.height !== detectHeight
  ) {
    detectCanvas.width = detectWidth;
    detectCanvas.height = detectHeight;
  }

  detectContext.drawImage(video, 0, 0, detectWidth, detectHeight);
  return detectCanvas;
}

function syncVideoSize() {
  return Boolean(video.videoWidth && video.videoHeight);
}

function getVideoWidth() {
  return video.videoWidth || 0;
}

function getVideoHeight() {
  return video.videoHeight || 0;
}

function onFaceResults(results) {
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    faceLandmarks = results.multiFaceLandmarks;
  } else {
    faceLandmarks = [];
  }
}

function onHandResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    handLandmarks = results.multiHandLandmarks;
  } else {
    handLandmarks = [];
  }
}

function draw() {
  background(0);

  const videoWidth = getVideoWidth();
  const videoHeight = getVideoHeight();

  if (!videoWidth || !videoHeight) {
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(24);
    text(videoStatus, width / 2, height / 2);
    return;
  }

  push();
  translate(width, 0);
  scale(-1, 1);

  // 웹캠 이미지 Center Crop 영역 계산
  let baseCropW, baseCropH, baseCropX, baseCropY;
  if (videoWidth / videoHeight < w / h) {
    baseCropW = videoWidth;
    baseCropH = videoWidth * (h / w);
    baseCropX = 0;
    baseCropY = (videoHeight - baseCropH) / 2;
  } else {
    baseCropH = videoHeight;
    baseCropW = videoHeight * (w / h);
    baseCropY = 0;
    baseCropX = (videoWidth - baseCropW) / 2;
  }

  let useFace = false;
  let useHand = false;
  let sx2, sy2, cw2, ch2;
  let sx3, sy3, cw3, ch3;
  let sx4, sy4, cw4, ch4;

  // 얼굴 트래킹
  if (faceLandmarks && faceLandmarks.length > 0) {
    let landmarks = faceLandmarks[0];
    if (landmarks && landmarks[468]) {
      useFace = true;
      let rightEye = landmarks[468];

      // 오른쪽 눈
      cw2 = 60;
      ch2 = cw2 * (h / w);
      sx2 = rightEye.x * videoWidth - cw2 / 2;
      sy2 = rightEye.y * videoHeight - ch2 / 2;

      const facialFeaturesIndices = [
        33, 133, 362, 263, 1, 2, 94, 61, 291, 0, 17,
      ];
      let minX = videoWidth,
        maxX = 0,
        minY = videoHeight,
        maxY = 0;
      for (let index of facialFeaturesIndices) {
        let lm = landmarks[index];
        if (lm) {
          let srcX = lm.x * videoWidth;
          let srcY = lm.y * videoHeight;
          if (srcX < minX) minX = srcX;
          if (srcX > maxX) maxX = srcX;
          if (srcY < minY) minY = srcY;
          if (srcY > maxY) maxY = srcY;
        }
      }
      let faceCenterX = (minX + maxX) / 2;
      let faceCenterY = (minY + maxY) / 2;
      let faceW = maxX - minX;
      let faceH = maxY - minY;
      if (faceW / faceH > w / h) {
        cw3 = faceW + 5;
        ch3 = cw3 * (h / w);
      } else {
        ch3 = faceH + 5;
        cw3 = ch3 * (w / h);
      }
      sx3 = faceCenterX - cw3 / 2;
      sy3 = faceCenterY - ch3 / 2;
    }
  }

  // 손 트래킹
  if (handLandmarks && handLandmarks.length > 0) {
    let firstHand = handLandmarks[0];
    if (firstHand) {
      useHand = true;
      let minXh = videoWidth,
        maxXh = 0,
        minYh = videoHeight,
        maxYh = 0;
      for (let lm of firstHand) {
        let srcX = lm.x * videoWidth;
        let srcY = lm.y * videoHeight;
        if (srcX < minXh) minXh = srcX;
        if (srcX > maxXh) maxXh = srcX;
        if (srcY < minYh) minYh = srcY;
        if (srcY > maxYh) maxYh = srcY;
      }
      let handCenterX = (minXh + maxXh) / 2;
      let handCenterY = (minYh + maxYh) / 2;
      let handW = maxXh - minXh;
      let handH = maxYh - minYh;
      if (handW / handH > w / h) {
        cw4 = handW + 50;
        ch4 = cw4 * (h / w);
      } else {
        ch4 = handH + 50;
        cw4 = ch4 * (w / h);
      }
      sx4 = handCenterX - cw4 / 2;
      sy4 = handCenterY - ch4 / 2;
    }
  }

  // 여백 제어 분할 화면 함수
  function drawQuadrant(posX, posY, useCrop, sx, sy, cw, ch) {
    const sourceX = useCrop ? max(0, min(sx, videoWidth - cw)) : baseCropX;
    const sourceY = useCrop ? max(0, min(sy, videoHeight - ch)) : baseCropY;
    const sourceW = useCrop ? cw : baseCropW;
    const sourceH = useCrop ? ch : baseCropH;

    drawingContext.drawImage(
      video,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      posX,
      posY,
      w,
      h,
    );
  }

  // 1. 베이스 원본 카메라 (실사 색감)
  blendMode(BLEND);
  noTint();
  drawQuadrant(w, 0, false, 0, 0, 0, 0);
  drawQuadrant(0, 0, useFace, sx2, sy2, cw2, ch2);
  drawQuadrant(w, h, useFace, sx3, sy3, cw3, ch3);
  drawQuadrant(0, h, useHand, sx4, sy4, cw4, ch4);

  // 2. 하이라이트(180 투명도)
  blendMode(DODGE);
  tint(255, 255, 255, 160);
  drawQuadrant(w, 0, false, 0, 0, 0, 0);
  drawQuadrant(0, 0, useFace, sx2, sy2, cw2, ch2);
  drawQuadrant(w, h, useFace, sx3, sy3, cw3, ch3);
  drawQuadrant(0, h, useHand, sx4, sy4, cw4, ch4);

  // 3. #06DCC7 컬러 스크린 오버레이
  blendMode(SCREEN);
  tint(6, 220, 199, 160);
  drawQuadrant(w, 0, false, 0, 0, 0, 0);
  drawQuadrant(0, 0, useFace, sx2, sy2, cw2, ch2);
  drawQuadrant(w, h, useFace, sx3, sy3, cw3, ch3);
  drawQuadrant(0, h, useHand, sx4, sy4, cw4, ch4);

  pop();

  blendMode(BLEND);
  noTint();

  // 4. CRT 스캔라인(은은한 청록색)
  stroke(6, 220, 199, 35);
  strokeWeight(1.5);
  for (let y = 0; y < height; y += 4) {
    line(0, y, width, y);
  }

  // 5. 4분할 레이아웃 가이드 선(흰색 십자선)
  stroke(255, 255, 255, 180);
  strokeWeight(3);
  line(w, 0, w, height);
  line(0, h, width, h);
}
