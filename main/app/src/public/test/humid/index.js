import WebsocketClient from '../../websocket-client.mjs';

const wsc = new WebsocketClient('/main');

wsc.on('open', () => {
  console.log('wsc open');
});
wsc.on('close', () => {
  console.log('wsc close');
});
wsc.on('error', (error) => {
  console.log('wsc error:', error);
});
wsc.open();

function press() {
  wsc.event('smell-press', 1);
}
let on = false;
function toggle() {
  if (!on) {
    press();
    on = true;
  } else {
    press();
    press();
    on = false;
  }
}
const pressButton = document.querySelector('#press');
pressButton.addEventListener('click', () => {
  toggle();
});
