import WebsocketClient from './websocket-client.js';

const LAT = 7;
const LON = 12;
const LONDIV = 2;
const LATDIV = 2;
const PMIN = 50;
const PMAX = 150;
const CALIBRATION_STABLE_DURATION = 300;
const CALIBRATION_STABLE_RANGE = 3;
const PRESSURE_DEADZONE = 2;
const PDEP = 0.5;
const DENSE_LON = LON * LONDIV;
const DENSE_LAT = (LAT + 1) * LATDIV - 1;
const MIN_DENSE_LON = 4;
const PARTICLE_COUNT = 3000;
const PARTICLE_SPEED_MIN = 0.001;
const PARTICLE_SPEED_MAX = 0.002;
const PARTICLE_TARGET_CHANCE_BASE = 0.006;
const PARTICLE_TARGET_CHANCE_PRESSURE = 0.018;
const PARTICLE_RESET_CHANCE = 0.0015;
const PARTICLE_ACCEL_BASE = 0.004;
const PARTICLE_ACCEL_PRESSURE = 0.007;
const PARTICLE_DRIFT_X = 0.1;
const PARTICLE_DRIFT_Y = 0.1;
const PARTICLE_DRIFT_Z = 0.1;
const PARTICLE_COLOR_SPEED_MAX = 0.03;
const PARTICLE_ALPHA_MIN = 1;
const PARTICLE_ALPHA_MAX = 1;
const PARTICLE_ALPHA_IDLE = 1;
const PARTICLE_ALPHA_PRESSURE = 1;
const PARTICLE_ALPHA_TARGET_BASE = 1;
const PARTICLE_ALPHA_TARGET_PRESSURE = 1;
const PARTICLE_HALO_ALPHA = 0;
/*
const PCOL = [
  { at: 0, color: [30, 0, 60] },
  { at: 0.5, color: [255, 0, 50] },
  { at: 0.8, color: [255, 150, 0] },
  { at: 1.0, color: [255, 255, 255] },
];
const PTCOL = [
  { at: 0, color: [30, 0, 60] },
  { at: 0.2, color: [255, 0, 50] },
  { at: 0.5, color: [255, 150, 0] },
  { at: 0.7, color: [255, 255, 255] },
];*/
const PCOL = [
  { at: 0, color: [90, 20, 50] },
  { at: 0.5, color: [190, 0, 255] },
  { at: 0.8, color: [0, 30, 255] },
  { at: 1.0, color: [0, 255, 255] },
];
const PTCOL = [
  { at: 0, color: [90, 20, 50] },
  { at: 0.2, color: [190, 0, 255] },
  { at: 0.5, color: [0, 30, 255] },
  { at: 0.7, color: [0, 255, 255] },
];

const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const wsc = new WebsocketClient('wss:g161.ccc.vg/main');

const targetValues = createValueGrid();
const displayValues = createValueGrid();
const baselineValues = createValueGrid();
const calibrationSums = createValueGrid();
const calibrationCounts = createValueGrid();
const calibrationMins = createValueGrid();
const calibrationMaxes = createValueGrid();
const rotation = { x: -0.22, y: 0 };
const drag = {
  active: false,
  pointerId: null,
  x: 0,
  y: 0,
};
const particles = createParticles();
let particlesReady = false;
let calibrationStableStartedAt = null;
let calibrated = false;

function createValueGrid() {
  return Array.from({ length: LON }, () =>
    Array.from({ length: LAT }, () => 0),
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mixNumber(a, b, amount) {
  return a + (b - a) * clamp(amount, 0, 1);
}

function mixColor(a, b, amount) {
  const ratio = clamp(amount, 0, 1);

  return a.map((channel, index) =>
    Math.round(channel + (b[index] - channel) * ratio),
  );
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function getPressureColor(strength) {
  for (let index = 1; index < PCOL.length; index += 1) {
    const previous = PCOL[index - 1];
    const next = PCOL[index];

    if (strength <= next.at) {
      return mixColor(
        previous.color,
        next.color,
        (strength - previous.at) / (next.at - previous.at),
      );
    }
  }

  return PCOL[PCOL.length - 1].color;
}

function getParticleColor(speedAmount) {
  for (let index = 1; index < PTCOL.length; index += 1) {
    const previous = PTCOL[index - 1];
    const next = PTCOL[index];

    if (speedAmount <= next.at) {
      return mixColor(
        previous.color,
        next.color,
        (speedAmount - previous.at) / (next.at - previous.at),
      );
    }
  }

  return PTCOL[PTCOL.length - 1].color;
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
    data.length === LON &&
    data.every((row) => Array.isArray(row) && row.length === LAT)
  ) {
    return data;
  }

  if (
    Array.isArray(data) &&
    data.length === LAT &&
    data.every((row) => Array.isArray(row) && row.length === LON)
  ) {
    return Array.from({ length: LON }, (_, lon) =>
      Array.from({ length: LAT }, (_, lat) => data[lat][lon]),
    );
  }

  if (
    data &&
    data.rows === LON &&
    data.cols === LAT &&
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

  const now = performance.now();
  const baselineUpdated = updateCalibration(values, now);

  if (!calibrated) {
    clearTargetValues();
    return;
  }

  if (baselineUpdated) {
    clearTargetValues();
    return;
  }

  updatePressureValues(values);
}

function clearTargetValues() {
  for (let lon = 0; lon < LON; lon += 1) {
    for (let lat = 0; lat < LAT; lat += 1) {
      targetValues[lon][lat] = 0;
    }
  }
}

function updatePressureValues(values) {
  for (let lon = 0; lon < LON; lon += 1) {
    for (let lat = 0; lat < LAT; lat += 1) {
      const value = Number(values[lon][lat]);

      if (!Number.isFinite(value)) {
        targetValues[lon][lat] = 0;
        continue;
      }

      const pressure = Math.max(
        0,
        value - baselineValues[lon][lat] - PRESSURE_DEADZONE,
      );
      targetValues[lon][lat] = clamp(pressure / (PMAX - PMIN), 0, 1);
    }
  }
}

function updateCalibration(values, now) {
  if (calibrationStableStartedAt === null) {
    resetCalibrationWindow(values, now);
    return false;
  }

  if (!isStableCalibrationSample(values)) {
    resetCalibrationWindow(values, now);
    return false;
  }

  recordCalibrationSample(values);

  if (now - calibrationStableStartedAt >= CALIBRATION_STABLE_DURATION) {
    finishCalibration();
    resetCalibrationWindow(values, now);
    return true;
  }

  return false;
}

function resetCalibrationWindow(values, now) {
  calibrationStableStartedAt = now;

  for (let lon = 0; lon < LON; lon += 1) {
    for (let lat = 0; lat < LAT; lat += 1) {
      calibrationSums[lon][lat] = 0;
      calibrationCounts[lon][lat] = 0;
      calibrationMins[lon][lat] = Infinity;
      calibrationMaxes[lon][lat] = -Infinity;
    }
  }

  recordCalibrationSample(values);
}

function isStableCalibrationSample(values) {
  for (let lon = 0; lon < LON; lon += 1) {
    for (let lat = 0; lat < LAT; lat += 1) {
      const value = Number(values[lon][lat]);

      if (!Number.isFinite(value)) {
        return false;
      }

      const nextMin = Math.min(calibrationMins[lon][lat], value);
      const nextMax = Math.max(calibrationMaxes[lon][lat], value);

      if (nextMax - nextMin > CALIBRATION_STABLE_RANGE) {
        return false;
      }
    }
  }

  return true;
}

function recordCalibrationSample(values) {
  for (let lon = 0; lon < LON; lon += 1) {
    for (let lat = 0; lat < LAT; lat += 1) {
      const value = Number(values[lon][lat]);

      if (!Number.isFinite(value)) {
        continue;
      }

      calibrationSums[lon][lat] += value;
      calibrationCounts[lon][lat] += 1;
      calibrationMins[lon][lat] = Math.min(calibrationMins[lon][lat], value);
      calibrationMaxes[lon][lat] = Math.max(calibrationMaxes[lon][lat], value);
    }
  }
}

function finishCalibration() {
  for (let lon = 0; lon < LON; lon += 1) {
    for (let lat = 0; lat < LAT; lat += 1) {
      const count = calibrationCounts[lon][lat];
      baselineValues[lon][lat] =
        count > 0 ? calibrationSums[lon][lat] / count : PMIN;
    }
  }

  calibrated = true;
}

function getInterpolatedValue(lonPosition, latPosition) {
  const wrappedLon = ((lonPosition % LON) + LON) % LON;
  const lon0 = Math.floor(wrappedLon);
  const lon1 = (lon0 + 1) % LON;
  const lonAmount = wrappedLon - lon0;

  if (latPosition < 0) {
    const poleAmount = clamp(-latPosition, 0, 1);
    const ringValue = mixNumber(
      displayValues[lon0][0],
      displayValues[lon1][0],
      lonAmount,
    );
    const poleValue = displayValues.reduce((sum, row) => sum + row[0], 0) / LON;

    return mixNumber(ringValue, poleValue, poleAmount);
  }

  if (latPosition > LAT - 1) {
    const poleAmount = clamp(latPosition - (LAT - 1), 0, 1);
    const ringValue = mixNumber(
      displayValues[lon0][LAT - 1],
      displayValues[lon1][LAT - 1],
      lonAmount,
    );
    const poleValue =
      displayValues.reduce((sum, row) => sum + row[LAT - 1], 0) / LON;

    return mixNumber(ringValue, poleValue, poleAmount);
  }

  const lat0 = Math.floor(latPosition);
  const lat1 = Math.min(lat0 + 1, LAT - 1);
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

function projectSpherePoint(theta, phi, strength, value, radius) {
  const localRadius = radius * (1 - strength * PDEP);
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
    theta,
    phi,
  };
}

function projectWorldPoint(x, y, z, radius) {
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const rotatedX = x * cosY - z * sinY;
  const rotatedZ = x * sinY + z * cosY;

  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const rotatedY = y * cosX - rotatedZ * sinX;
  const finalZ = y * sinX + rotatedZ * cosX;
  const perspective = radius * 3.4;
  const scale = perspective / (perspective + finalZ);

  return {
    x: canvas.width / 2 + rotatedX * scale,
    y: canvas.height / 2 - rotatedY * scale,
    z: finalZ,
    scale,
  };
}

function getDenseLonCount(latRatio) {
  return Math.max(
    MIN_DENSE_LON,
    Math.round(DENSE_LON * Math.sin(Math.PI * latRatio)),
  );
}

function getDensePoint(lonIndex, lonCount, latIndex, radius) {
  const lonRatio = lonIndex / lonCount;
  const latRatio = (latIndex + 1) / (DENSE_LAT + 1);
  const lonPosition = lonRatio * LON;
  const latPosition = latRatio * (LAT + 1) - 1;
  const value = getInterpolatedValue(lonPosition, latPosition);
  const strength = clamp(value, 0, 1);
  const theta = Math.PI * latRatio;
  const phi = Math.PI * 2 * lonRatio;

  return projectSpherePoint(theta, phi, strength, value, radius);
}

function createParticle() {
  const theta = Math.acos(randomRange(-1, 1));
  const phi = randomRange(0, Math.PI * 2);
  const distance = randomRange(0.82, 1.34);
  const sinTheta = Math.sin(theta);

  return {
    x: sinTheta * Math.cos(phi) * distance,
    y: Math.cos(theta) * distance,
    z: sinTheta * Math.sin(phi) * distance,
    tx: sinTheta * Math.cos(phi) * distance,
    ty: Math.cos(theta) * distance,
    tz: sinTheta * Math.sin(phi) * distance,
    phase: randomRange(0, Math.PI * 2),
    speed: randomRange(PARTICLE_SPEED_MIN, PARTICLE_SPEED_MAX),
    size: randomRange(0.75, 1.9),
    alpha: randomRange(PARTICLE_ALPHA_MIN, PARTICLE_ALPHA_MAX),
    colorSpeed: 0,
  };
}

function createParticles() {
  return Array.from({ length: PARTICLE_COUNT }, createParticle);
}

function choosePressureTarget(points, radius) {
  let total = 0;

  for (const point of points) {
    total += point.strength ** 2.15;
  }

  if (total < 0.01) {
    return null;
  }

  let cursor = Math.random() * total;

  for (const point of points) {
    cursor -= point.strength ** 2.15;

    if (cursor <= 0) {
      const theta = point.theta + randomRange(-0.1, 0.1);
      const phi = point.phi + randomRange(-0.18, 0.18);
      const distance = randomRange(1.02, 1.42) - point.strength * 0.16;
      const sinTheta = Math.sin(theta);

      return {
        x: sinTheta * Math.cos(phi) * radius * distance,
        y: Math.cos(theta) * radius * distance,
        z: sinTheta * Math.sin(phi) * radius * distance,
        strength: point.strength,
      };
    }
  }

  return null;
}

function updateParticles(points, radius, time) {
  const pressureTotal = points.reduce(
    (sum, point) => sum + point.strength ** 2.15,
    0,
  );
  const pressureAmount = clamp(pressureTotal / 18, 0, 1);

  for (const particle of particles) {
    if (
      Math.random() <
      PARTICLE_TARGET_CHANCE_BASE +
        pressureAmount * PARTICLE_TARGET_CHANCE_PRESSURE
    ) {
      const target = choosePressureTarget(points, radius);

      if (target) {
        particle.tx = target.x;
        particle.ty = target.y;
        particle.tz = target.z;
        particle.alpha = mixNumber(
          particle.alpha,
          PARTICLE_ALPHA_TARGET_BASE +
            target.strength * PARTICLE_ALPHA_TARGET_PRESSURE,
          0.5,
        );
      }
    }

    if (Math.random() < PARTICLE_RESET_CHANCE) {
      const reset = createParticle();
      particle.tx = reset.tx * radius;
      particle.ty = reset.ty * radius;
      particle.tz = reset.tz * radius;
    }

    const previousX = particle.x;
    const previousY = particle.y;
    const previousZ = particle.z;
    const drift = Math.sin(time * particle.speed + particle.phase);
    const acceleration =
      PARTICLE_ACCEL_BASE + pressureAmount * PARTICLE_ACCEL_PRESSURE;
    particle.x += (particle.tx - particle.x) * acceleration;
    particle.y += (particle.ty - particle.y) * acceleration;
    particle.z += (particle.tz - particle.z) * acceleration;
    particle.x +=
      Math.cos(time * particle.speed * 0.7 + particle.phase) * PARTICLE_DRIFT_X;
    particle.y += drift * PARTICLE_DRIFT_Y;
    particle.z +=
      Math.sin(time * particle.speed * 0.9 + particle.phase) * PARTICLE_DRIFT_Z;
    const velocity =
      Math.hypot(
        particle.x - previousX,
        particle.y - previousY,
        particle.z - previousZ,
      ) / radius;
    particle.colorSpeed = mixNumber(
      particle.colorSpeed,
      clamp(velocity / PARTICLE_COLOR_SPEED_MAX, 0, 1),
      0.2,
    );
    particle.alpha = mixNumber(
      particle.alpha,
      PARTICLE_ALPHA_IDLE + pressureAmount * PARTICLE_ALPHA_PRESSURE,
      0.012,
    );
  }
}

function drawParticle(particle, radius) {
  const point = projectWorldPoint(particle.x, particle.y, particle.z, radius);
  const [red, green, blue] = getParticleColor(particle.colorSpeed);
  const depth = clamp(0.28 + (radius - point.z) / (radius * 2.6), 0.16, 0.9);
  const size = Math.max(
    0.8,
    particle.size * point.scale * (canvas.width / 960),
  );
  const halo = size * 4.2;

  const gradient = ctx.createRadialGradient(
    point.x,
    point.y,
    0,
    point.x,
    point.y,
    halo,
  );
  gradient.addColorStop(
    0,
    `rgba(${red}, ${green}, ${blue}, ${particle.alpha * depth})`,
  );
  gradient.addColorStop(
    0.34,
    `rgba(${red}, ${green}, ${blue}, ${
      particle.alpha * depth * PARTICLE_HALO_ALPHA
    })`,
  );
  gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, halo, 0, Math.PI * 2);
  ctx.fill();

  return point.z;
}

function drawBackground() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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

function drawSphere() {
  resizeCanvas();

  for (let lon = 0; lon < LON; lon += 1) {
    for (let lat = 0; lat < LAT; lat += 1) {
      displayValues[lon][lat] +=
        (targetValues[lon][lat] - displayValues[lon][lat]) * 0.22;
    }
  }

  const radius = Math.min(canvas.width, canvas.height) * 0.34;
  const points = Array.from({ length: DENSE_LAT }, (_, lat) => {
    const latRatio = (lat + 1) / (DENSE_LAT + 1);
    const lonCount = getDenseLonCount(latRatio);

    return Array.from({ length: lonCount }, (_, lon) =>
      getDensePoint(lon, lonCount, lat, radius),
    );
  });
  const flatPoints = points.flat();

  if (!particlesReady) {
    for (const particle of particles) {
      particle.x *= radius;
      particle.y *= radius;
      particle.z *= radius;
      particle.tx *= radius;
      particle.ty *= radius;
      particle.tz *= radius;
    }

    particlesReady = true;
  }

  updateParticles(flatPoints, radius, performance.now());

  drawBackground();

  flatPoints
    .sort((a, b) => b.z - a.z)
    .forEach((point) => drawPoint(point, radius));

  particles.forEach((particle) => drawParticle(particle, radius));

  requestAnimationFrame(drawSphere);
}

function startDrag(event) {
  drag.active = true;
  drag.pointerId = event.pointerId;
  drag.x = event.clientX;
  drag.y = event.clientY;
  canvas.setPointerCapture(event.pointerId);
}

function updateDrag(event) {
  if (!drag.active || event.pointerId !== drag.pointerId) {
    return;
  }

  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;

  rotation.y += dx * 0.008;
  rotation.x = clamp(rotation.x - dy * 0.008, -Math.PI * 0.48, Math.PI * 0.48);
}

function endDrag(event) {
  if (!drag.active || event.pointerId !== drag.pointerId) {
    return;
  }

  drag.active = false;
  drag.pointerId = null;
  canvas.releasePointerCapture(event.pointerId);
}

wsc.on('json', (con, event, data) => {
  if (event === 'touch') {
    updateTouch(data);
  }
});

window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('pointerdown', startDrag);
canvas.addEventListener('pointermove', updateDrag);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

resizeCanvas();
drawSphere();
wsc.open();
