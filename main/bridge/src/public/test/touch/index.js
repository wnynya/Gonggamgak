import WebsocketClient from '../../websocket-client.mjs';

const MIN_VALUE = 0;
const MAX_VALUE = 1023;
const CELL_ORDER = [0, 2, 1, 3];

const statusElement = document.querySelector('#status');
const cellElements = [...document.querySelectorAll('.cell')];

const wsc = new WebsocketClient('/main');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mixColor(a, b, amount) {
  const ratio = clamp(amount, 0, 1);

  return a.map((channel, index) =>
    Math.round(channel + (b[index] - channel) * ratio),
  );
}

function getSpectrogramColor(strength) {
  const stops = [
    { at: 0, color: [33, 24, 47] },
    { at: 0.28, color: [82, 24, 116] },
    { at: 0.55, color: [205, 30, 74] },
    { at: 0.78, color: [255, 202, 48] },
    { at: 1, color: [255, 255, 246] },
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

function getMatrixValues(data) {
  if (
    data &&
    data.rows === 2 &&
    data.cols === 2 &&
    Array.isArray(data.values) &&
    data.values.length === 2
  ) {
    return data.values.flat();
  }

  if (Array.isArray(data) && data.length === 2) {
    return data.flat();
  }

  return null;
}

function renderTouch(data) {
  const values = getMatrixValues(data);

  if (!values || values.length !== 4) {
    return;
  }

  values.forEach((rawValue, index) => {
    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      return;
    }

    const strength = clamp((value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE), 0, 1);
    const cell = cellElements[CELL_ORDER[index]];
    const [red, green, blue] = getSpectrogramColor(strength);

    cell.style.setProperty('--strength', strength.toFixed(3));
    cell.style.setProperty('--cell-color', `rgb(${red} ${green} ${blue})`);
    cell.style.setProperty('--cell-glow', `rgba(${red}, ${green}, ${blue}, 0.34)`);
    cell.querySelector('strong').textContent = String(Math.round(value));
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
  if (event === 'touch' || event === 'press') {
    renderTouch(data);
  }
});

wsc.open();
