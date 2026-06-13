import Serial from './serial.js';
import WebSocketClient from './websocket-client.js';

const BAUD_RATE = 9600;
const DEFAULT_WS_URL = 'wss://g161.ccc.vg/microwave';

const args = (() => {
  let res = {};
  let key = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('-')) {
      if (key) {
        res[key] = true;
      }
      key = arg.replace(/^-+/, '');
    } else if (key) {
      res[key] = arg;
      key = null;
    }
  }
  if (key) {
    res[key] = true;
  }
  return res;
})();

let wsc = null;
let id = null;

function getUsage() {
  return [
    '사용법:',
    '  node app.js -l',
    '  node app.js -s <시리얼_장치> [-w <웹소켓_URL>]',
    '',
    '예:',
    '  node app.js -l',
    '  node app.js -s /dev/cu.usbmodem101',
    '  node app.js -s /dev/cu.usbmodem101 -w ws://localhost:9990/microwave',
  ].join('\n');
}

function formatPort(port) {
  const details = [
    port.manufacturer,
    port.vendorId ? `VID ${port.vendorId}` : null,
    port.productId ? `PID ${port.productId}` : null,
  ].filter(Boolean);

  return details.length > 0
    ? `${port.path} (${details.join(', ')})`
    : port.path;
}

async function listSerialPorts() {
  const ports = await Serial.list();

  console.log(`serials(${ports.length}): `);
  ports.forEach((port) => {
    console.log(`  ${formatPort(port)}`);
  });
}

function messageToSerialText(message) {
  if (!message || message.event !== 'microwave') {
    return null;
  }

  if (typeof message.data === 'string') {
    return message.data;
  }

  if (message.data && typeof message.data.command === 'string') {
    return message.data.command;
  }

  if (message.data != null) {
    return JSON.stringify(message.data);
  }

  if (typeof message.message === 'string') {
    return message.message;
  }

  return null;
}

function createWebSocketClient(url, serial) {
  const state = {
    warnedNotReady: false,
  };
  const client = new WebSocketClient(url);
  wsc = client;

  client.on('open', () => {
    state.warnedNotReady = false;
    console.log(`WebSocket connected: ${url}`);
  });

  client.on('message', ({ data: text }) => {
    try {
      const message = JSON.parse(text);
      const serialText = messageToSerialText(message);

      if (serialText) {
        serial.send(serialText);
        console.log(`WS -> Serial: ${serialText}`);
      }
    } catch (error) {
      console.warn(`Invalid websocket JSON skipped: ${text}`);
    }
  });

  client.on('close', () => {
    console.log('WebSocket closed. Reconnecting...');
  });

  client.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });

  client.open();

  return {
    sendMicrowave(data) {
      if (!client.connected) {
        if (!state.warnedNotReady) {
          console.warn('WebSocket not ready. Console output only for now.');
          state.warnedNotReady = true;
        }
        return;
      }

      client.send({ event: 'microwave', data });
      console.log(`Serial -> WS: ${data}`);
    },
  };
}

async function main() {
  if (args.l) {
    await listSerialPorts();
    return;
  }

  id = args.i;
  if (!id) {
    throw new Error(getUsage());
  }

  const serialPath = args.s;
  const wsUrl = args.w || DEFAULT_WS_URL;

  if (!serialPath) {
    throw new Error(getUsage());
  }

  const serial = new Serial(serialPath, { baudRate: BAUD_RATE });
  const wsClient = createWebSocketClient(wsUrl, serial);

  serial.on('open', () => {
    console.log(`Serial connected: ${serialPath} (${BAUD_RATE})`);
  });

  serial.on('message', (data) => {
    wsClient.sendMicrowave(data);
  });

  serial.on('error', (error) => {
    console.error('Serial error:', error.message);
  });

  await serial.open();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
