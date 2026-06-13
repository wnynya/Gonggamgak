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

wsc.on('json', (con, event, data) => {
  console.log(event, data);
});

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
