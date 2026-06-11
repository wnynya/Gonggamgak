import { SerialPort } from 'serialport';
import WebSocket from 'ws';

const BAUD_RATE = 9600;
const DEFAULT_WS_URL = 'ws://localhost:9990/microwave';
const RECONNECT_DELAY_MS = 1000;

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);

  if (index === -1 || !process.argv[index + 1]) {
    return fallback;
  }

  return process.argv[index + 1];
}

function hasArg(name) {
  return process.argv.includes(name);
}

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
  const ports = await SerialPort.list();

  if (ports.length === 0) {
    console.log('시리얼 장치를 찾지 못했습니다.');
    return;
  }

  console.log('시리얼 장치 목록:');
  ports.forEach((port) => {
    console.log(`- ${formatPort(port)}`);
  });
}

async function openSerial(path) {
  const port = new SerialPort({ path, baudRate: BAUD_RATE });

  await new Promise((resolve, reject) => {
    port.once('open', resolve);
    port.once('error', reject);
  });

  console.log(`Serial connected: ${path} (${BAUD_RATE})`);
  return port;
}

function serialWrite(serialPort, text) {
  const command = text.endsWith('\n') ? text : `${text}\n`;
  serialPort.write(command, (error) => {
    if (error) {
      console.error('Serial write error:', error.message);
      return;
    }

    console.log(`WS -> Serial: ${text}`);
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

function createWebSocketClient(url, serialPort) {
  const state = {
    ws: null,
    warnedNotReady: false,
  };

  function connect() {
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.on('open', () => {
      state.warnedNotReady = false;
      console.log(`WebSocket connected: ${url}`);
    });

    ws.on('message', (raw) => {
      const text = raw.toString();

      try {
        const message = JSON.parse(text);
        const serialText = messageToSerialText(message);

        if (serialText) {
          serialWrite(serialPort, serialText);
        }
      } catch (error) {
        console.warn(`Invalid websocket JSON skipped: ${text}`);
      }
    });

    ws.on('close', () => {
      if (state.ws === ws) {
        state.ws = null;
      }

      console.log(
        `WebSocket closed. Reconnecting in ${RECONNECT_DELAY_MS}ms...`,
      );
      setTimeout(connect, RECONNECT_DELAY_MS);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
  }

  connect();

  return {
    sendMicrowave(data) {
      const ws = state.ws;

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (!state.warnedNotReady) {
          console.warn('WebSocket not ready. Console output only for now.');
          state.warnedNotReady = true;
        }
        return;
      }

      const message = JSON.stringify({ event: 'microwave', data });
      ws.send(message);
      console.log(`Serial -> WS: ${data}`);
    },
  };
}

function readSerialLines(serialPort, wsClient) {
  let buffer = '';

  serialPort.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    while (true) {
      const newlineIndex = buffer.search(/\r?\n/);

      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + (buffer[newlineIndex] === '\r' ? 2 : 1));

      if (line) {
        wsClient.sendMicrowave(line);
      }
    }
  });
}

async function main() {
  if (hasArg('-l')) {
    await listSerialPorts();
    return;
  }

  const serialPath = getArg('-s');
  const wsUrl = getArg('-w', DEFAULT_WS_URL);

  if (!serialPath) {
    throw new Error(getUsage());
  }

  const serialPort = await openSerial(serialPath);
  const wsClient = createWebSocketClient(wsUrl, serialPort);
  readSerialLines(serialPort, wsClient);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
