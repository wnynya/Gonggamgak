const servers = {};
function websocket(req, socket, head) {
  const path = req.url.replace(/\?(.*)/, '').toLowerCase();
  const server = servers[path];
  if (!server) {
    socket.destroy();
    return;
  }
  server.handleUpgrade(req, socket, head);
}
function use(path, server) {
  servers[path] = server;
}

import { hearing, sight, touch, main, smell, out1, webrtc } from './wss.js';
use('/hearing', hearing);
use('/sight', sight);
use('/touch', touch);
use('/main', main);
use('/smell', smell);
use('/out1', out1);
use('/webrtc', webrtc);

import { press } from './wss.js';
use('/press', press);

export default websocket;
