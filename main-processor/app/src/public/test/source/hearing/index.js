import WebsocketClient from '../../../websocket-client.mjs';

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const speakButton = document.querySelector('#speak');
const statusElement = document.querySelector('#status');
const volumeValueElement = document.querySelector('#volumeValue');
const speedValueElement = document.querySelector('#speedValue');
const volumeBarElement = document.querySelector('#volumeBar');
const speedBarElement = document.querySelector('#speedBar');
const finalTextElement = document.querySelector('#finalText');
const interimTextElement = document.querySelector('#interimText');

let audioContext = null;
let analyser = null;
let mediaStream = null;
let recognition = null;
let animationFrame = null;
let isListening = false;
let finalText = '';
let currentText = '';
let currentTps = 0;
let currentGain = 0;
let lastSpeechTime = 0;
let lastSpeechText = '';

const hearingWsc = new WebsocketClient('/hearing');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(text, state = 'idle') {
  statusElement.textContent = text;
  statusElement.classList.toggle('is-open', state === 'open');
  statusElement.classList.toggle('is-error', state === 'error');
}

function countLetters(text) {
  return Array.from(text.replace(/\s/g, '')).length;
}

function setSpeed(speechText, now = performance.now(), updateBaseline = true) {
  const letterCount = countLetters(speechText);

  if (!lastSpeechTime || letterCount === 0) {
    currentTps = 0;
    speedValueElement.textContent = '0 tps';
    speedBarElement.style.width = '0%';

    if (updateBaseline && letterCount > 0) {
      lastSpeechTime = now;
      lastSpeechText = speechText;
    }

    return;
  }

  const previousLength = countLetters(lastSpeechText);
  const addedLetters = Math.max(letterCount - previousLength, letterCount);
  const seconds = Math.max((now - lastSpeechTime) / 1000, 0.08);
  currentTps = addedLetters / seconds;
  const percent = clamp((currentTps / 12) * 100, 0, 100);

  speedValueElement.textContent = `${currentTps.toFixed(1)} tps`;
  speedBarElement.style.width = `${percent}%`;
  lastSpeechTime = now;
  lastSpeechText = speechText;
}

function updateTranscript(
  interimText = '',
  speechText = interimText || finalText,
  now = performance.now(),
  updateBaseline = true,
) {
  finalTextElement.textContent = finalText;
  interimTextElement.textContent = interimText;
  speakButton.disabled = !finalText.trim();
  currentText = speechText.trim();
  setSpeed(currentText, now, updateBaseline);
}

function sendSpeechData() {
  if (!currentText) {
    return;
  }

  hearingWsc.send({
    event: 'speech',
    text: currentText,
    tps: Number(currentTps.toFixed(2)),
    gain: Number(currentGain.toFixed(2)),
  });
}

function updateVolume() {
  if (!analyser) {
    return;
  }

  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);

  let sum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  const rms = Math.sqrt(sum / samples.length);
  const volume = clamp(rms * 3.2, 0, 1);
  const percent = Math.round(volume * 100);

  currentGain = volume;
  volumeValueElement.textContent = `${percent}%`;
  volumeBarElement.style.width = `${percent}%`;
  animationFrame = requestAnimationFrame(updateVolume);
}

async function startAudio() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
  });

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  updateVolume();
}

function startRecognition() {
  if (!SpeechRecognition) {
    setStatus('no speech api', 'error');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'ko-KR';

  recognition.onstart = () => {
    isListening = true;
    lastSpeechTime = 0;
    lastSpeechText = '';
    setStatus('listening', 'open');
  };

  recognition.onresult = (event) => {
    let interimText = '';
    let latestText = '';
    let hasInterimResult = false;
    const now = performance.now();

    for (
      let index = event.resultIndex;
      index < event.results.length;
      index += 1
    ) {
      const result = event.results[index];
      const text = result[0].transcript;
      latestText = text;

      if (result.isFinal) {
        finalText = `${finalText} ${text}`.trim();
      } else {
        hasInterimResult = true;
        interimText += text;
      }
    }

    updateTranscript(interimText, interimText || latestText, now);

    if (hasInterimResult) {
      sendSpeechData();
    }
  };

  recognition.onerror = (event) => {
    setStatus(event.error || 'speech error', 'error');
  };

  recognition.onend = () => {
    if (isListening) {
      recognition.start();
      return;
    }

    setStatus('idle');
  };

  recognition.start();
}

async function start() {
  try {
    startButton.disabled = true;
    stopButton.disabled = false;
    finalText = '';
    currentText = '';
    currentTps = 0;
    currentGain = 0;
    lastSpeechTime = 0;
    lastSpeechText = '';
    updateTranscript('', '', performance.now(), false);
    await startAudio();
    startRecognition();
  } catch (error) {
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus(error.message || 'mic error', 'error');
  }
}

function stop() {
  isListening = false;
  startButton.disabled = false;
  stopButton.disabled = true;

  if (recognition) {
    recognition.stop();
  }

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
  currentGain = 0;
  volumeValueElement.textContent = '0%';
  volumeBarElement.style.width = '0%';
  setStatus('idle');
}

function speakText() {
  const text = finalText.trim();

  if (!text || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = recognition?.lang || navigator.language || 'ko-KR';
  utterance.rate = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

startButton.addEventListener('click', start);
stopButton.addEventListener('click', stop);
speakButton.addEventListener('click', speakText);

hearingWsc.open();

if (!navigator.mediaDevices?.getUserMedia) {
  startButton.disabled = true;
  setStatus('no mic api', 'error');
} else if (!SpeechRecognition) {
  startButton.disabled = true;
  setStatus('no speech api', 'error');
}
