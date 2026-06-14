import WebsocketClient from '../../websocket-client.mjs';

const MIN_VALUE = 0;
const MAX_VALUE = 1000;
const GROUND_HEIGHT = 76;

const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const valueElement = document.querySelector('#value');
const scoreElement = document.querySelector('#score');
const scorePanelElement = document.querySelector('.score');
const statusElement = document.querySelector('#status');

const wsc = new WebsocketClient('/main');

let width = 0;
let height = 0;
let pixelRatio = 1;
let targetValue = 0;
let birdY = 0;
let score = 0;
let previousTime = performance.now();

const bird = {
  x: 0,
  radius: 23,
  wingPhase: 0,
};

const pipes = [
  { x: 0, gapY: 0.35, gapSize: 0.28, scored: false },
  { x: 0, gapY: 0.62, gapSize: 0.3, scored: false },
  { x: 0, gapY: 0.45, gapSize: 0.26, scored: false },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(text, isOpen = false) {
  statusElement.textContent = text;
  statusElement.classList.toggle('is-open', isOpen);
}

function resize() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  bird.x = clamp(width * 0.28, 92, 220);
  birdY = getBirdY(targetValue);

  pipes.forEach((pipe, index) => {
    pipe.x = width + index * Math.max(width * 0.38, 260);
    pipe.scored = false;
  });
}

function getBirdY(value) {
  const playTop = 72;
  const playBottom = height - GROUND_HEIGHT - bird.radius - 14;
  const percent = clamp((value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE), 0, 1);

  return playBottom - (playBottom - playTop) * percent;
}

function setPress(data) {
  const value = Number(data);

  if (!Number.isFinite(value)) {
    return;
  }

  targetValue = clamp(value, MIN_VALUE, MAX_VALUE);
  valueElement.textContent = String(Math.round(targetValue));
}

function addScore() {
  score += 1;
  scoreElement.textContent = String(score);
  scorePanelElement.classList.remove('is-hit');
  requestAnimationFrame(() => {
    scorePanelElement.classList.add('is-hit');
  });
  setTimeout(() => {
    scorePanelElement.classList.remove('is-hit');
  }, 180);
}

function isBirdInsideGap(pipe, pipeWidth, playableHeight) {
  const gapCenter = playableHeight * pipe.gapY;
  const gapHeight = playableHeight * pipe.gapSize;
  const gapTop = gapCenter - gapHeight / 2;
  const gapBottom = gapCenter + gapHeight / 2;

  return (
    birdY - bird.radius >= gapTop &&
    birdY + bird.radius <= gapBottom
  );
}

function drawBackground(time) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#8ed6ff');
  sky.addColorStop(0.68, '#d9f0ff');
  sky.addColorStop(1, '#f8deb0');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgba(255, 255, 255, 0.78)';
  for (let index = 0; index < 5; index += 1) {
    const x = (width - ((time * 0.018 + index * 190) % (width + 180))) + 40;
    const y = 86 + index * 54;
    drawCloud(x, y, 0.75 + index * 0.08);
  }

  context.fillStyle = '#76b95b';
  context.fillRect(0, height - GROUND_HEIGHT, width, GROUND_HEIGHT);
  context.fillStyle = '#5f9e4c';
  context.fillRect(0, height - GROUND_HEIGHT, width, 12);
}

function drawCloud(x, y, scale) {
  context.beginPath();
  context.arc(x, y, 22 * scale, 0, Math.PI * 2);
  context.arc(x + 25 * scale, y - 10 * scale, 28 * scale, 0, Math.PI * 2);
  context.arc(x + 58 * scale, y, 24 * scale, 0, Math.PI * 2);
  context.arc(x + 28 * scale, y + 12 * scale, 26 * scale, 0, Math.PI * 2);
  context.fill();
}

function drawPipes(delta) {
  const pipeWidth = clamp(width * 0.08, 58, 88);
  const speed = clamp(width * 0.18, 130, 220);
  const playableHeight = height - GROUND_HEIGHT;

  pipes.forEach((pipe, index) => {
    pipe.x -= speed * delta;

    if (pipe.x + pipeWidth < 0) {
      pipe.x = Math.max(...pipes.map((item) => item.x)) + Math.max(width * 0.36, 250);
      pipe.gapY = 0.28 + ((index * 0.17 + performance.now() * 0.00008) % 0.46);
      pipe.gapSize = 0.25 + ((index * 0.05 + performance.now() * 0.00004) % 0.08);
      pipe.scored = false;
    }

    if (!pipe.scored && pipe.x + pipeWidth < bird.x - bird.radius) {
      pipe.scored = true;

      if (isBirdInsideGap(pipe, pipeWidth, playableHeight)) {
        addScore();
      }
    }

    const gapCenter = playableHeight * pipe.gapY;
    const gapHeight = playableHeight * pipe.gapSize;
    const topHeight = Math.max(0, gapCenter - gapHeight / 2);
    const bottomY = gapCenter + gapHeight / 2;

    context.fillStyle = '#2ea35f';
    context.fillRect(pipe.x, 0, pipeWidth, topHeight);
    context.fillRect(pipe.x, bottomY, pipeWidth, playableHeight - bottomY);

    context.fillStyle = '#217b49';
    context.fillRect(pipe.x - 7, topHeight - 16, pipeWidth + 14, 16);
    context.fillRect(pipe.x - 7, bottomY, pipeWidth + 14, 16);
  });
}

function drawBird(time) {
  const wing = Math.sin(time * 0.018) * 8;

  context.save();
  context.translate(bird.x, birdY);
  context.rotate((getBirdY(targetValue) - birdY) * -0.004);

  context.fillStyle = '#ffd45a';
  context.beginPath();
  context.arc(0, 0, bird.radius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#f3a93b';
  context.beginPath();
  context.ellipse(-8, 7 + wing * 0.25, 15, 9, -0.35, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#ff8f4a';
  context.beginPath();
  context.moveTo(19, -2);
  context.lineTo(42, 8);
  context.lineTo(18, 16);
  context.closePath();
  context.fill();

  context.fillStyle = '#20201f';
  context.beginPath();
  context.arc(9, -9, 4, 0, Math.PI * 2);
  context.fill();

  context.restore();
}

function drawGuide() {
  const y = getBirdY(targetValue);

  context.setLineDash([8, 10]);
  context.strokeStyle = 'rgba(27, 34, 41, 0.28)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(width, y);
  context.stroke();
  context.setLineDash([]);
}

function animate(time) {
  const delta = Math.min((time - previousTime) / 1000, 0.04);
  previousTime = time;
  birdY += (getBirdY(targetValue) - birdY) * Math.min(delta * 12, 1);

  drawBackground(time);
  drawGuide();
  drawPipes(delta);
  drawBird(time);

  requestAnimationFrame(animate);
}

wsc.on('open', () => {
  setStatus('connected', true);
});

wsc.on('close', () => {
  setStatus('closed');
});

wsc.on('error', () => {
  setStatus('error');
});

wsc.on('json', (con, event, data) => {
  if (event === 'press') {
    setPress(data);
  }
});

window.addEventListener('resize', resize);
resize();
wsc.open();
requestAnimationFrame(animate);
