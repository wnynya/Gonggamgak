import WebsocketClient from '../../websocket-client.mjs';

const LAT_COUNT = 7;
const LON_COUNT = 12;
const MIN_VALUE = 50;
const MAX_VALUE = 150;
const PRESS_DEPTH = 0.2;
const LON_DIVISIONS = 5;
const LAT_DIVISIONS = 5;
const DENSE_LON_COUNT = LON_COUNT * LON_DIVISIONS;
const DENSE_LAT_COUNT = (LAT_COUNT + 1) * LAT_DIVISIONS - 1;

const canvas = document.querySelector('#sphere');
const ctx = canvas.getContext('2d', { alpha: false });
const statusElement = document.querySelector('#status');
const wsc = new WebsocketClient('/main');

const targetValues = createValueGrid();
const displayValues = createValueGrid();
let frameCount = 0;
let lastTouchAt = 0;

function createValueGrid() {
  return Array.from({ length: LON_COUNT }, () =>
    Array.from({ length: LAT_COUNT }, () => 0),
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mixColor(a, b, amount) {
  const ratio = clamp(amount, 0, 1);

  return a.map((channel, index) =>
    Math.round(channel + (b[index] - channel) * ratio),
  );
}

function mixNumber(a, b, amount) {
  return a + (b - a) * clamp(amount, 0, 1);
}

function getPressureColor(strength) {
  const stops = [
    { at: 0, color: [128, 0, 255] },
    { at: 0.5, color: [0, 0, 255] },
    { at: 0.8, color: [0, 255, 255] },
  ];

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];

    if (strength <= next.at) {
      const localStrength = (strength - previous.at) / (next.at - previous.at);
      return mixColor(previous.color, next.color, localStrength);
    }
  }

  return stops[stops.length - 1].color;
}

function setStatus(text, isOpen = false) {
  statusElement.textContent = text;
  statusElement.classList.toggle('is-open', isOpen);
}

function resizeCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function normalizeTouchData(data) {
  if (
    Array.isArray(data) &&
    data.length === LON_COUNT &&
    data.every((row) => Array.isArray(row) && row.length === LAT_COUNT)
  ) {
    return data;
  }

  if (
    Array.isArray(data) &&
    data.length === LAT_COUNT &&
    data.every((row) => Array.isArray(row) && row.length === LON_COUNT)
  ) {
    return Array.from({ length: LON_COUNT }, (_, lon) =>
      Array.from({ length: LAT_COUNT }, (_, lat) => data[lat][lon]),
    );
  }

  if (
    data &&
    data.rows === LON_COUNT &&
    data.cols === LAT_COUNT &&
    Array.isArray(data.values)
  ) {
    return normalizeTouchData(data.values);
  }

  return null;
}

function updateTouch(data) {
  const values = normalizeTouchData(data);

  if (!values) {
    return;
  }

  for (let lon = 0; lon < LON_COUNT; lon += 1) {
    for (let lat = 0; lat < LAT_COUNT; lat += 1) {
      const value = Number(values[lon][lat]);
      targetValues[lon][lat] = Number.isFinite(value)
        ? clamp(value, MIN_VALUE, MAX_VALUE)
        : 0;
    }
  }

  lastTouchAt = performance.now();
}

function projectSpherePoint(theta, phi, strength, value, radius, rotation) {
  const localRadius = radius * (1 - strength * PRESS_DEPTH);
  const sinTheta = Math.sin(theta);

  let x = localRadius * sinTheta * Math.cos(phi);
  let y = localRadius * Math.cos(theta);
  let z = localRadius * sinTheta * Math.sin(phi);

  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const rotatedX = x * cosY - z * sinY;
  const rotatedZ = x * sinY + z * cosY;
  x = rotatedX;
  z = rotatedZ;

  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const rotatedY = y * cosX - z * sinX;
  const finalZ = y * sinX + z * cosX;
  y = rotatedY;
  z = finalZ;

  const perspective = radius * 3.4;
  const scale = perspective / (perspective + z);

  return {
    x: canvas.width / 2 + x * scale,
    y: canvas.height / 2 - y * scale,
    z,
    scale,
    strength,
    value,
  };
}

function getInterpolatedValue(lonPosition, latPosition) {
  const wrappedLon = ((lonPosition % LON_COUNT) + LON_COUNT) % LON_COUNT;
  const lon0 = Math.floor(wrappedLon);
  const lon1 = (lon0 + 1) % LON_COUNT;
  const lonAmount = wrappedLon - lon0;

  if (latPosition < 0) {
    const fade = latPosition + 1;
    const topValue = mixNumber(
      displayValues[lon0][0],
      displayValues[lon1][0],
      lonAmount,
    );
    return topValue * fade;
  }

  if (latPosition > LAT_COUNT - 1) {
    const fade = LAT_COUNT - latPosition;
    const bottomValue = mixNumber(
      displayValues[lon0][LAT_COUNT - 1],
      displayValues[lon1][LAT_COUNT - 1],
      lonAmount,
    );
    return bottomValue * fade;
  }

  const lat0 = Math.floor(latPosition);
  const lat1 = Math.min(lat0 + 1, LAT_COUNT - 1);
  const latAmount = latPosition - lat0;
  const top = mixNumber(
    displayValues[lon0][lat0],
    displayValues[lon1][lat0],
    lonAmount,
  );
  const bottom = mixNumber(
    displayValues[lon0][lat1],
    displayValues[lon1][lat1],
    lonAmount,
  );

  return mixNumber(top, bottom, latAmount);
}

function getDensePoint(lonIndex, latIndex, radius, rotation) {
  const lonRatio = lonIndex / DENSE_LON_COUNT;
  const latRatio = (latIndex + 1) / (DENSE_LAT_COUNT + 1);
  const lonPosition = lonRatio * LON_COUNT;
  const latPosition = latRatio * (LAT_COUNT + 1) - 1;
  const value = getInterpolatedValue(lonPosition, latPosition);
  const strength = clamp((value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE), 0, 1);
  const theta = Math.PI * latRatio;
  const phi = Math.PI * 2 * lonRatio;

  return projectSpherePoint(theta, phi, strength, value, radius, rotation);
}

function drawPoint(point, radius) {
  const [red, green, blue] = getPressureColor(point.strength);
  const depth = clamp(0.36 + (radius - point.z) / (radius * 2.5), 0.22, 1);
  const size =
    (2.8 + point.strength * 10.5) * point.scale * (canvas.width / 1200);
  const dotRadius = Math.max(1.4, size);
  const haloRadius = dotRadius * (2.6 + point.strength * 1.8);

  const gradient = ctx.createRadialGradient(
    point.x,
    point.y,
    0,
    point.x,
    point.y,
    haloRadius,
  );
  gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${0.92 * depth})`);
  gradient.addColorStop(
    0.36,
    `rgba(${red}, ${green}, ${blue}, ${0.42 * depth})`,
  );
  gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(248, 255, 253, ${0.2 + point.strength * 0.64})`;
  ctx.beginPath();
  ctx.arc(point.x, point.y, dotRadius * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackground() {
  const gradient = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.45,
    0,
    canvas.width * 0.5,
    canvas.height * 0.5,
    Math.max(canvas.width, canvas.height) * 0.72,
  );

  gradient.addColorStop(0, '#17101d');
  gradient.addColorStop(0.52, '#0b0910');
  gradient.addColorStop(1, '#050507');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSphere() {
  resizeCanvas();

  for (let lon = 0; lon < LON_COUNT; lon += 1) {
    for (let lat = 0; lat < LAT_COUNT; lat += 1) {
      displayValues[lon][lat] +=
        (targetValues[lon][lat] - displayValues[lon][lat]) * 0.22;
    }
  }

  const age = performance.now() - lastTouchAt;
  const radius = Math.min(canvas.width, canvas.height) * 0.34;
  const rotation = {
    x: -0.22,
    y: frameCount * 0.004,
  };
  const points = Array.from({ length: DENSE_LON_COUNT }, (_, lon) =>
    Array.from({ length: DENSE_LAT_COUNT }, (_, lat) =>
      getDensePoint(lon, lat, radius, rotation),
    ),
  );

  drawBackground();

  points
    .flat()
    .sort((a, b) => b.z - a.z)
    .forEach((point) => drawPoint(point, radius));

  if (age > 2500) {
    ctx.fillStyle = 'rgba(248, 242, 255, 0.34)';
    ctx.font = `${Math.max(12, canvas.width * 0.012)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(
      'waiting for touch data',
      canvas.width / 2,
      canvas.height - 30,
    );
  }

  frameCount += 1;
  requestAnimationFrame(drawSphere);
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
  if (event === 'touch') {
    updateTouch(data);
  }
});

window.addEventListener('resize', resizeCanvas);

resizeCanvas();
drawSphere();
wsc.open();
