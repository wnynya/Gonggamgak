import http from 'node:http';
import WebSocketServer from './websocket-server.js';

const bridge = new WebSocketServer();
bridge.on('message', (con, read) => {
  bridge.broadcast(read.data);
});

http.createServer().listen(5959).on('upgrade', bridge.handleUpgrade);
