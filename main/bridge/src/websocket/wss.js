import WebSocketServer from './websocket-server.js';

const hearing = new WebSocketServer();
const sight = new WebSocketServer();
const touch = new WebSocketServer();

const main = new WebSocketServer();
const smell = new WebSocketServer();

const out1 = new WebSocketServer();
const webrtc = new WebSocketServer();
const webrtcSight = new WebSocketServer();
const webrtcHearing = new WebSocketServer();
const press = new WebSocketServer();
const microwave = new WebSocketServer();

hearing.on('message', (con, read) => {
  main.broadcast(read.data);
  out1.broadcast(read.data);
});
sight.on('message', (con, read) => {
  main.broadcast(read.data);
  out1.broadcast(read.data);
});
touch.on('message', (con, read) => {
  main.broadcast(read.data);
  out1.broadcast(read.data);
});

press.on('message', (con, read) => {
  main.broadcast(read.data);
  out1.broadcast(read.data);
});
microwave.on('message', (con, read) => {
  main.broadcast(read.data);
});

main.on('connection', (con) => {
  console.log(`main: client connected`);
});
main.on('message', (con, read) => {});
main.on('json', (con, event, data, message) => {
  switch (event) {
    case 'smell-press': {
      smell.broadcast(JSON.stringify({ event, data, message }));
      break;
    }
    case 'microwave': {
      microwave.broadcast(JSON.stringify({ event, data, message }));
      break;
    }
  }
});
main.on('close', (con) => {
  console.log(`main: client disconnected`);
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

function relayWebrtc(server, label) {
  server.on('connection', (con) => {
    console.log(`${label}: client connected`);
    con.event('webrtc-peer-id', { id: con.id });
  });

  server.on('json', (con, event, data, message, object = {}) => {
    const payload = JSON.stringify({ event, data, message, from: con.id });
    const target = object.target || data?.target;

    for (const connection of server.connections) {
      if (connection === con) {
        continue;
      }

      if (!target || connection.id === target) {
        connection.send(payload);
      }
    }
  });

  server.on('close', () => {
    console.log(`${label}: client disconnected`);
  });
}

relayWebrtc(webrtc, 'webrtc');
relayWebrtc(webrtcSight, 'webrtc/sight');
relayWebrtc(webrtcHearing, 'webrtc/hearing');

export {
  hearing,
  sight,
  touch,
  main,
  smell,
  out1,
  webrtc,
  webrtcSight,
  webrtcHearing,
  press,
};
export { microwave };
