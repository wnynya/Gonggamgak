import WebRTCReceiver from '../../webrtc-receiver.js';

const audio = document.querySelector('#hearing-stream');
const startButton = document.querySelector('#start');
const statusText = document.querySelector('#status');

let source;

function setStatus(text) {
  statusText.textContent = text;
}

startButton.addEventListener('click', () => {
  startButton.classList.add('is-hidden');

  source = new WebRTCReceiver('/webrtc/hearing', {
    role: 'hearing-raw-display',
    sourceRole: 'hearing-input',
  });
  source.on('status', (status) => {
    setStatus(status);
  });
  source.on('stream', () => {
    audio.play().catch(() => {});
  });

  audio.srcObject = source.mediaStream;
});

window.addEventListener('pagehide', () => {
  source?.stop();
});
