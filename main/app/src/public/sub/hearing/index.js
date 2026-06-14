import WebsocketClient from '../../websocket-client.mjs';

let wsc;

function init() {
  wsc = new WebsocketClient('/hearing');

  wsc.on('open', () => {
    console.log('wsc open');
  });

  wsc.on('json', (con, event, data) => {});

  wsc.on('close', () => {
    console.log('wsc close');
  });

  wsc.on('error', (error) => {
    console.log('wsc error:', error);
  });

  wsc.open();
}

init();
