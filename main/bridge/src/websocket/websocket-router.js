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

import {
  hearing,
  sight,
  touch,
  main,
  smell,
  out1,
  webrtc,
  webrtcSight,
  webrtcHearing,
  webrtcTab1,
  webrtcTab2,
} from './wss.js';
use('/hearing', hearing);
use('/sight', sight);
use('/touch', touch);
use('/main', main);
use('/smell', smell);
use('/out1', out1);
use('/webrtc', webrtc);
use('/webrtc/sight', webrtcSight);
use('/webrtc/hearing', webrtcHearing);
use('/webrtc/tab1', webrtcTab1);
use('/webrtc/tab2', webrtcTab2);

import { press } from './wss.js';
use('/press', press);

import { microwave } from './wss.js';
use('/microwave', microwave);

export default websocket;
