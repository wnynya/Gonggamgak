import WebRTCReceiver from '../../webrtc-receiver.js';

const video = document.querySelector('#sight-stream');
const startButton = document.querySelector('#start');
const statusText = document.querySelector('#status');

function setStatus(text) {
  statusText.textContent = text;
}
let source;

startButton.addEventListener('click', () => {
  startButton.classList.add('is-hidden');

  source = new WebRTCReceiver('/webrtc/sight', {
    role: 'sight-raw-display',
    sourceRole: 'sight-input',
  });
  source.on('status', (status) => {
    setStatus(status);
  });
  source.on('stream', () => {
    video.muted = false;
    video.volume = 1;
    video.play().catch(() => {});
  });

  video.srcObject = source.mediaStream;
});

window.addEventListener('pagehide', () => {
  source?.stop();
});
