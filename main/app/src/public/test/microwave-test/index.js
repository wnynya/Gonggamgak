import WebsocketClient from '../../websocket-client.mjs';

const wsc = new WebsocketClient('/main');

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
