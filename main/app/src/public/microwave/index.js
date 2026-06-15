import WebsocketClient from '../websocket-client.js';

const wsc = new WebsocketClient('wss://g161.ccc.vg/main');

wsc.on('open', () => {
  console.log('ws open');
});
wsc.on('close', () => {
  console.log('ws close');
});
wsc.on('error', (error) => {
  console.log('ws error', error);
});

wsc.open();

function send(i, d) {
  let val = '';
  for (let i = 0; i < d.length; i++) {
    val += parseInt(d[i], 2).toString(16).padStart(2, '0').toUpperCase();
  }
  wsc.event('microwave-serial', {
    to: i,
    text: `r[${val}]`,
  });
}

async function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

const Char = {
  0: ['00111111'],
  1: ['00000110'],
  2: ['01011011'],
  3: ['01001111'],
  4: ['01100110'],
  5: ['01101101'],
  6: ['01111101'],
  7: ['00100111'],
  8: ['01111111'],
  9: ['01101111'],
  a: ['01110111'],
  b: ['01111100'],
  c: ['01011000'],
  d: ['01011110'],
  e: ['01111001'],
  f: ['01110001'],
  g: ['00111101'],
  h: ['01110110'],
  i: ['00110000'],
  j: ['00001110'],
  k: ['01110000', '01011010'],
  l: ['00111000'],
  m: ['00110011', '00100111'],
  n: ['01010100'],
  o: ['01011100'],
  p: ['01110011'],
  q: ['01100111'],
  r: ['01010000'],
  s: ['01101101'],
  t: ['01111000'],
  u: ['00011100'],
  v: ['01100100', '01010010'],
  w: ['00111100', '00011110'],
  x: ['00001111', '00111001'],
  y: ['01101110'],
  z: ['01011011'],
  ' ': ['00000000'],
};
async function sendText(t = 1, text, d = 500) {
  const msg = [];
  text = text.toLowerCase();
  for (const c of text) {
    msg.push(...(Char[c] || []));
  }
  const frames = [];

  for (let i = -4; i < msg.length + 1; i++) {
    const frame = [];
    for (let j = 0; j < 4; j++) {
      frame.push(msg[j + i] || '00000000');
    }
    frames.push(frame);
  }

  for (let i = 0; i < frames.length; i++) {
    send(t, frames[i]);
    await delay(d);
  }
}
window.sendText = sendText;

document.querySelector('#send').addEventListener('click', () => {
  const input = document.querySelector('#text');
  let value = input.value || '';
  value = value.replace(/[^a-z0-9 ]/g, '');
  const delay = (document.querySelector('#delay').value || 200) * 1;
  if (document.querySelector('#m1').checked) {
    sendText(1, value, delay);
  }
  if (document.querySelector('#m2').checked) {
    sendText(2, value, delay);
  }
});
