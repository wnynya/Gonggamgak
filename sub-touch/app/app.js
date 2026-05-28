import { ReadlineParser, SerialPort } from 'serialport';
import WebSocket from 'ws';

const BAUD_RATE = 115200;
const DEFAULT_WS_URL = 'ws://localhost:9990/touch';
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
    '  node app.js -s /dev/cu.usbmodem101 -w ws://localhost:9990/touch',
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

function createWebSocketClient(url) {
  const state = {
    ws: null,
  };

  function connect() {
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.on('open', () => {
      console.log(`WebSocket connected: ${url}`);
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
    sendTouchMatrix(data) {
      const ws = state.ws;

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn(
          `WebSocket not ready. Skipped touch matrix: ${JSON.stringify(data)}`,
        );
        return;
      }

      const message = JSON.stringify({ event: 'touch', data });
      ws.send(message);
    },
  };
}

function isMatrixPayload(data) {
  return (
    data &&
    data.rows === 2 &&
    data.cols === 2 &&
    Array.isArray(data.values) &&
    data.values.length === 2 &&
    data.values.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        row.every((value) => Number.isFinite(value)),
    )
  );
}

function parseSerialMatrix(line) {
  const text = line.trim();

  if (!text) {
    return null;
  }

  try {
    const data = JSON.parse(text);

    if (!isMatrixPayload(data)) {
      console.warn(`Invalid touch matrix skipped: ${text}`);
      return null;
    }

    return data;
  } catch (error) {
    console.warn(`Invalid serial JSON skipped: ${text}`);
    return null;
  }
}

function readSerialTouchMatrix(serialPort, wsClient) {
  const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

  parser.on('data', (line) => {
    const matrix = parseSerialMatrix(line);

    if (matrix === null) {
      return;
    }

    wsClient.sendTouchMatrix(matrix);
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
  const wsClient = createWebSocketClient(wsUrl);
  readSerialTouchMatrix(serialPort, wsClient);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
