import WebsocketClient from '../../websocket-client.js';

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
wsc.on('json', (con, event, data) => {});

wsc.open();
window.wsc = wsc;

const btn_m1h1on = document.querySelector('#button-m1-h1-on');
const btn_m1h1off = document.querySelector('#button-m1-h1-off');
const btn_m1h2on = document.querySelector('#button-m1-h2-on');
const btn_m1h2off = document.querySelector('#button-m1-h2-off');

function mhumid(to, index, on) {
  wsc.event('microwave-humid', { to, index, on });
}
function mtext(to, text) {
  wsc.event('microwave-text', { to, text });
}
function mlight(to, text) {
  wsc.event('microwave-light', { to, on });
}

btn_m1h1on.addEventListener('click', () => {
  wsc.event('microwave-humid', {
    to: 1,
    index: 1,
    on: true,
  });
});
btn_m1h1off.addEventListener('click', () => {
  wsc.event('microwave-humid', {
    to: 1,
    index: 1,
    on: false,
  });
});
btn_m1h2on.addEventListener('click', () => {
  wsc.event('microwave-humid', {
    to: 1,
    index: 2,
    on: true,
  });
});
btn_m1h2off.addEventListener('click', () => {
  wsc.event('microwave-humid', {
    to: 1,
    index: 2,
    on: false,
  });
});

function sendSerial(msg) {
  wsc.event('microwave', msg);
}
window.sendSerial = sendSerial;

const kn = {
  a: 'c3',
  w: 'cs3',
  s: 'd3',
  e: 'ds3',
  d: 'e3',
  f: 'f3',
  t: 'fs3',
  g: 'g3',
  y: 'gs3',
  h: 'a3',
  u: 'as3',
  j: 'b3',
  k: 'c4',
  o: 'cs4',
  l: 'd4',
  p: 'ds4',
  ';': 'e4',
};
window.addEventListener('keydown', (event) => {
  const note = kn[event.key];
  if (note) {
    sendSerial(`ps[${note}]`);
  }
});
window.addEventListener('keyup', (event) => {
  const note = kn[event.key];
  if (note) {
    sendSerial(`pe[${note}]`);
  }
});

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

function updateSseg() {
  let val = '';
  for (let i = 0; i < 7; i++) {
    const el = document.querySelector(`#sseg-${i}`);
    val += el.classList.contains('active') ? '1' : '0';
  }
  val += '0';
  val = val.split('').reverse().join('');
  document.querySelector('#sseg-value').innerHTML = val;
}

function initSseg() {
  for (let i = 0; i < 7; i++) {
    const el = document.querySelector(`#sseg-${i}`);
    el.addEventListener('click', (event) => {
      if (el.classList.contains('active')) {
        el.classList.remove('active');
      } else {
        el.classList.add('active');
      }
      updateSseg();
    });
  }
}

initSseg();

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

const Message = {
  GONGGAMGAK: [
    '00111101',
    '01011100',
    '01010100',
    '00111101',
    '00000000',
    '00111101',
    '01011111',
    '01010100',
    '01000100',
    '00000000',
    '00111101',
    '01011111',
    '00111101',
  ],
  LGBABO: [
    '00111000',
    '00111101',
    '00000000',
    '01111100',
    '01110111',
    '01111100',
    '01011100',
  ],
  YUNP: ['01101110', '00011100', '01010100', '00000000', '01110011'],
  HOME: [
    '00110000',
    '00000000',
    '00111100',
    '00011110',
    '01110111',
    '01010100',
    '01111000',
    '00000000',
    '01111000',
    '01011100',
    '00000000',
    '00111101',
    '01011100',
    '00000000',
    '01110110',
    '01011100',
    '00110011',
    '00100111',
    '01111001',
  ],
  WHY: [
    '00111100',
    '00011110',
    '01110110',
    '00011110',
    '01110111',
    '01010100',
    '01111000',
    '00000000',
    '01111000',
    '01011100',
    '00000000',
    '00111101',
    '01011100',
    '00000000',
    '01110110',
    '01011100',
    '00110011',
    '00100111',
    '01111001',
  ],
};

async function sendMsg(t = 1, msg) {
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
    await delay(500);
  }
}
window.sendMsg = sendMsg;
window.Message = Message;

const Screen = {
  FIREWORK: [
    ['00000000', '01000000', '01000000', '00000000'],
    ['00000000', '01000110', '01110000', '00000000'],
    ['00000000', '01000000', '01000000', '00000000'],
    ['01000000', '00000000', '00000000', '01000000'],
    ['00000000', '00000000', '00000000', '00000000'],
  ],
  ROTATE: [
    ['00000000', '00000000', '00000001', '00000001'],
    ['00000000', '00000001', '00000001', '00000000'],
    ['00000001', '00000001', '00000000', '00000000'],
    ['00100001', '00000000', '00000000', '00000000'],
    ['00110000', '00000000', '00000000', '00000000'],
    ['00011000', '00000000', '00000000', '00000000'],
    ['00001000', '00001000', '00000000', '00000000'],
    ['00000000', '00001000', '00001000', '00000000'],
    ['00000000', '00000000', '00001000', '00001000'],
    ['00000000', '00000000', '00000000', '00001100'],
    ['00000000', '00000000', '00000000', '00000110'],
    ['00000000', '00000000', '00000000', '00000011'],
  ],
};
async function sendSc(screen) {
  for (let i = 0; i < screen.length; i++) {
    send(1, screen[i]);
    send(2, screen[i]);
    await delay(50);
  }
  sendSc(Screen.ROTATE);
}

window.sendSc = sendSc;
window.Screen = Screen;
