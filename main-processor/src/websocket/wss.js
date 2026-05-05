import WebSocketServer from './websocket-server.js';

const hearing = new WebSocketServer();
const sight = new WebSocketServer();
const touch = new WebSocketServer();
const main = new WebSocketServer();
const smell = new WebSocketServer();
const out1 = new WebSocketServer();
const webrtc = new WebSocketServer();

hearing.on('message', (con, read) => {
  main.broadcast(read.data);
});
sight.on('message', (con, read) => {
  console.log(read.data);
  main.broadcast(read.data);
  out1.broadcast(read.data);
});
touch.on('message', (con, read) => {
  main.broadcast(read.data);
});
main.on('message', (con, read) => {
  console.log(read.data);
});
main.on('json', (con, event, data, message) => {
  switch (event) {
    case 'smell-press': {
      smell.broadcast(JSON.stringify({ event, data, message }));
      break;
    }
  }
});

out1.on('connection', (con) => {
  console.log(`out1: client connected`);
});
out1.on('message', (con, read) => {
  console.log(`out1: ${read.data}`);
});
out1.on('close', (con) => {
  console.log(`out1: client disconnected`);
});

webrtc.on('connection', (con) => {
  console.log(`webrtc: client connected`);
});
webrtc.on('json', (con, event, data, message) => {
  for (const connection of webrtc.connections) {
    if (connection !== con) {
      connection.send(JSON.stringify({ event, data, message }));
    }
  }
});
webrtc.on('close', () => {
  console.log(`webrtc: client disconnected`);
});

export { hearing, sight, touch, main, smell, out1, webrtc };
