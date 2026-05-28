import WebsocketClient from '../../websocket-client.mjs';

const MIN_VALUE = 0;
const MAX_VALUE = 1000;

const valueElement = document.querySelector('#value');
const statusElement = document.querySelector('#status');
const barElement = document.querySelector('#bar');

const wsc = new WebsocketClient('/main');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(text, isOpen = false) {
  statusElement.textContent = text;
  statusElement.classList.toggle('is-open', isOpen);
}

function renderPress(data) {
  const value = Number(data);

  if (!Number.isFinite(value)) {
    return;
  }

  const percent = clamp(((value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE)) * 100, 0, 100);

  valueElement.textContent = String(value);
  barElement.style.width = `${percent}%`;
  barElement.classList.remove('is-hit');
  requestAnimationFrame(() => {
    barElement.classList.add('is-hit');
  });
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
    renderPress(data);
  }
});

wsc.open();
