const startButton = document.querySelector('#start');
const deviceSelect = document.querySelector('#audioInput');
const inputGain = document.querySelector('#inputGain');
const inputGainValue = document.querySelector('#inputGainValue');
const statusElement = document.querySelector('#status');
const textBackground = document.querySelector('#text .background');
const textForeground = document.querySelector('#text .foreground');
const cover = document.querySelector('.cover');
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const screens = {
  wav: document.querySelector('#wav canvas'),
  fft: document.querySelector('#fft canvas'),
  spct: document.querySelector('#spct canvas'),
  xy: document.querySelector('#xy canvas'),
  cfft: document.querySelector('#cfft canvas'),
};

const fftSize = 2048;
const timeViewSampleCount = 512;
const maxFrequency = 3000;
const frequencyBinCount = fftSize / 2;
const colorStops = [
  [0, 0, 0],
  [42, 0, 72],
  [210, 24, 56],
  [255, 122, 20],
  [255, 226, 58],
  [255, 255, 255],
];

let audioContext = null;
let analyser = null;
let gainNode = null;
let mediaStream = null;
let animationFrame = null;
let timeData = new Uint8Array(fftSize);
let frequencyData = new Uint8Array(frequencyBinCount);
let delayedData = new Float32Array(fftSize);
let delayBuffer = new Float32Array(24000);
let delayIndex = 0;
let spectrogramImage = null;
let recognition = null;
let transcriptText = '';

function setStatus(text, state = 'idle') {
  statusElement.textContent = text;
  statusElement.dataset.state = state;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCanvasContext(canvas) {
  return canvas.getContext('2d', { alpha: false });
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }

  return false;
}

function resizeCanvases() {
  for (const canvas of Object.values(screens)) {
    const didResize = resizeCanvas(canvas);

    if (canvas === screens.spct && didResize) {
      spectrogramImage = null;
    }
  }
}

function colorForValue(value) {
  const scaled = clamp(value, 0, 1) * (colorStops.length - 1);
  const index = Math.min(Math.floor(scaled), colorStops.length - 2);
  const local = scaled - index;
  const from = colorStops[index];
  const to = colorStops[index + 1];
  const r = Math.round(from[0] + (to[0] - from[0]) * local);
  const g = Math.round(from[1] + (to[1] - from[1]) * local);
  const b = Math.round(from[2] + (to[2] - from[2]) * local);

  return `rgb(${r}, ${g}, ${b})`;
}

function byteToSignal(value) {
  return (value - 128) / 128;
}

function clear(ctx, width, height) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
}

function getFrequencyLimit() {
  if (!audioContext) {
    return frequencyData.length;
  }

  const nyquist = audioContext.sampleRate / 2;
  return clamp(
    Math.ceil((maxFrequency / nyquist) * frequencyData.length),
    1,
    frequencyData.length,
  );
}

function setInputGain(value = inputGain.value) {
  const gain = clamp(
    Number(value) || 0,
    Number(inputGain.min),
    Number(inputGain.max),
  );

  inputGain.value = String(gain);
  inputGainValue.textContent = gain.toFixed(2);

  if (gainNode && audioContext) {
    gainNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);
  }
}

function trimTranscript(text) {
  return Array.from(text).slice(-1000).join('');
}

function showLatestSpeechChar(text) {
  const chars = Array.from(text.trim());
  textForeground.textContent = chars.at(-1) || '';
}

function appendSpeechText(text) {
  if (!text) {
    return;
  }

  transcriptText = trimTranscript(`${transcriptText}${text}`);
  textBackground.textContent = transcriptText;
  textBackground.scrollTop = textBackground.scrollHeight;
}

function stopRecognition() {
  if (!recognition) {
    return;
  }

  recognition.onend = null;
  recognition.stop();
  recognition = null;
}

function startRecognition() {
  if (!SpeechRecognition) {
    return;
  }

  stopRecognition();
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'ko-KR';

  recognition.onresult = (event) => {
    for (
      let index = event.resultIndex;
      index < event.results.length;
      index += 1
    ) {
      const result = event.results[index];
      const text = result[0].transcript;

      showLatestSpeechChar(text);

      if (result.isFinal) {
        appendSpeechText(text);
      }
    }
  };

  recognition.onerror = (event) => {
    setStatus(event.error || 'speech error', 'error');
  };

  recognition.onend = () => {
    if (mediaStream) {
      recognition.start();
    }
  };

  recognition.start();
}

function drawWaveform() {
  const canvas = screens.wav;
  const ctx = getCanvasContext(canvas);
  const { width, height } = canvas;
  const mid = height / 2;
  const sampleCount = Math.min(timeViewSampleCount, timeData.length);
  const startIndex = timeData.length - sampleCount;

  clear(ctx, width, height);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, width / 360);
  ctx.beginPath();

  for (let i = 0; i < sampleCount; i += 1) {
    const sourceIndex = startIndex + i;
    const x = (i / Math.max(1, sampleCount - 1)) * width;
    const y = mid + byteToSignal(timeData[sourceIndex]) * mid * 0.86;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function drawFft() {
  const canvas = screens.fft;
  const ctx = getCanvasContext(canvas);
  const { width, height } = canvas;
  const limit = getFrequencyLimit();
  const step = width / limit;

  clear(ctx, width, height);

  for (let i = 0; i < limit; i += 1) {
    const value = frequencyData[i] / 255;
    const barHeight = Math.max(1, value * height);

    ctx.fillStyle = colorForValue(value);
    ctx.fillRect(i * step, height - barHeight, Math.ceil(step) + 1, barHeight);
  }
}

function drawSpectrogram() {
  const canvas = screens.spct;
  const ctx = getCanvasContext(canvas);
  const { width, height } = canvas;

  if (!spectrogramImage) {
    clear(ctx, width, height);
    spectrogramImage = ctx.createImageData(1, height);
  } else {
    ctx.drawImage(canvas, -1, 0);
  }

  const pixels = spectrogramImage.data;
  const limit = getFrequencyLimit();
  for (let y = 0; y < height; y += 1) {
    const bin = Math.floor((1 - y / Math.max(1, height - 1)) * (limit - 1));
    const value = frequencyData[bin] / 255;
    const scaled = clamp(value * 1.25, 0, 1) * (colorStops.length - 1);
    const index = Math.min(Math.floor(scaled), colorStops.length - 2);
    const local = scaled - index;
    const from = colorStops[index];
    const to = colorStops[index + 1];
    const offset = y * 4;

    pixels[offset] = Math.round(from[0] + (to[0] - from[0]) * local);
    pixels[offset + 1] = Math.round(from[1] + (to[1] - from[1]) * local);
    pixels[offset + 2] = Math.round(from[2] + (to[2] - from[2]) * local);
    pixels[offset + 3] = 255;
  }

  ctx.putImageData(spectrogramImage, width - 1, 0);
}

function updateDelayBuffer() {
  for (let i = 0; i < timeData.length; i += 1) {
    delayedData[i] = delayBuffer[delayIndex];
    delayBuffer[delayIndex] = byteToSignal(timeData[i]);
    delayIndex = (delayIndex + 1) % delayBuffer.length;
  }
}

function drawXy() {
  const canvas = screens.xy;
  const ctx = getCanvasContext(canvas);
  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.43;
  const sampleCount = Math.min(timeViewSampleCount, timeData.length);
  const startIndex = timeData.length - sampleCount;

  clear(ctx, width, height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, width / 430);
  ctx.beginPath();

  for (let i = 0; i < sampleCount; i += 1) {
    const sourceIndex = startIndex + i;
    const x = centerX + byteToSignal(timeData[sourceIndex]) * radius;
    const y = centerY + delayedData[sourceIndex] * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function drawCircularFft() {
  const canvas = screens.cfft;
  const ctx = getCanvasContext(canvas);
  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) * 0.48;
  const rings = 80;
  const limit = getFrequencyLimit();
  const binsPerRing = Math.max(1, Math.floor(limit / rings));

  clear(ctx, width, height);

  for (let ring = rings - 1; ring >= 0; ring -= 1) {
    const start = ring * binsPerRing;
    const end = Math.min(limit, start + binsPerRing);
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      peak = Math.max(peak, frequencyData[i]);
    }

    const value = peak / 255;
    const radius = ((ring + 1) / rings) * maxRadius;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = colorForValue(clamp(value * 1.18, 0, 1));
    ctx.lineWidth = Math.max(1, maxRadius / rings);
    ctx.globalAlpha = clamp(0.18 + value * 0.82, 0.18, 1);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function render() {
  resizeCanvases();

  if (analyser) {
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(frequencyData);
    updateDelayBuffer();
  }

  drawWaveform();
  drawFft();
  drawSpectrogram();
  drawXy();
  drawCircularFft();

  animationFrame = requestAnimationFrame(render);
}

function stopStream() {
  stopRecognition();

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyser = null;
  gainNode = null;
}

async function listAudioInputs(selectedDeviceId = deviceSelect.value) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement('option');

  defaultOption.value = '';
  defaultOption.textContent = 'default';
  fragment.append(defaultOption);

  for (const device of inputs) {
    if (device.deviceId === 'default') {
      continue;
    }

    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent =
      device.label || `microphone ${fragment.childElementCount}`;
    fragment.append(option);
  }

  deviceSelect.replaceChildren(fragment);
  deviceSelect.value = [...deviceSelect.options].some(
    (option) => option.value === selectedDeviceId,
  )
    ? selectedDeviceId
    : '';
}

async function startAudio(deviceId = '') {
  stopStream();
  setStatus('requesting mic...', 'pending');

  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  if (deviceId) {
    audio.deviceId = { exact: deviceId };
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio });
  audioContext = new AudioContext();

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const source = audioContext.createMediaStreamSource(mediaStream);
  gainNode = audioContext.createGain();
  setInputGain();

  analyser = audioContext.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.72;
  analyser.minDecibels = -95;
  analyser.maxDecibels = -15;
  source.connect(gainNode);
  gainNode.connect(analyser);

  const delaySamples = Math.max(1, Math.round(audioContext.sampleRate * 0.5));
  delayBuffer = new Float32Array(delaySamples);
  delayIndex = 0;
  delayedData = new Float32Array(fftSize);

  await listAudioInputs(deviceId);
  startRecognition();
  setStatus('running', 'open');
  render();
}

async function restartAudio() {
  if (!audioContext && !mediaStream) {
    return;
  }

  try {
    await startAudio(deviceSelect.value);
  } catch (error) {
    setStatus(error.message || 'mic error', 'error');
  }
}

async function start() {
  try {
    startButton.disabled = true;
    await startAudio(deviceSelect.value);
    cover.hidden = true;
  } catch (error) {
    startButton.disabled = false;
    cover.hidden = false;
    setStatus(error.message || 'mic error', 'error');
  }
}

startButton.addEventListener('click', start);
cover.addEventListener('click', start);
deviceSelect.addEventListener('change', restartAudio);
inputGain.addEventListener('input', () => setInputGain());
window.addEventListener('resize', resizeCanvases);

for (const canvas of Object.values(screens)) {
  resizeCanvas(canvas);
}

setInputGain();

if (!navigator.mediaDevices?.getUserMedia) {
  startButton.disabled = true;
  deviceSelect.disabled = true;
  setStatus('no mic api', 'error');
} else {
  listAudioInputs().catch(() => {
    setStatus('press start to allow mic', 'pending');
  });
  render();
}
