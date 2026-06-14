import { SerialPort } from 'serialport';
import WebSocket from 'ws';

const BAUD_RATE = 9600;
const ROW_COUNT = 12;
const COL_COUNT = 7;
const CELL_COUNT = ROW_COUNT * COL_COUNT;
const FRAME_HEADER = [0xaa, 0x55];
const FRAME_SIZE = FRAME_HEADER.length + CELL_COUNT;
const DEFAULT_WS_URL = 'wss://g161.ccc.vg/touch';
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
    warnedNotReady: false,
  };

  function connect() {
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.on('open', () => {
      state.warnedNotReady = false;
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
        if (!state.warnedNotReady) {
          console.warn('WebSocket not ready. Console output only for now.');
          state.warnedNotReady = true;
        }
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
    data.rows === ROW_COUNT &&
    data.cols === COL_COUNT &&
    Array.isArray(data.values) &&
    data.values.length === ROW_COUNT &&
    data.values.every(
      (row) =>
        Array.isArray(row) &&
        row.length === COL_COUNT &&
        row.every((value) => Number.isFinite(value)),
    )
  );
}

function createMatrixFromPayload(payload) {
  const values = [];

  for (let r = 0; r < ROW_COUNT; r++) {
    const row = [];

    for (let c = 0; c < COL_COUNT; c++) {
      row.push(payload[r * COL_COUNT + c]);
    }

    values.push(row);
  }

  return {
    rows: ROW_COUNT,
    cols: COL_COUNT,
    values,
  };
}

function formatMatrix(matrix, frameNumber) {
  const lines = [
    `Touch matrix ${ROW_COUNT}x${COL_COUNT} frame ${frameNumber} (${BAUD_RATE} baud, 8-bit)`,
    `      ${Array.from({ length: COL_COUNT }, (_, c) => `D${c + 2}`.padStart(4)).join('')}`,
  ];

  matrix.values.forEach((row, r) => {
    const label = `A${r}`.padStart(4);
    const cells = row.map((value) => String(value).padStart(4)).join('');
    lines.push(`${label}: ${cells}`);
  });

  return lines.join('\n');
}

function printMatrix(matrix, frameNumber) {
  //process.stdout.write('\x1Bc');
  //console.log(formatMatrix(matrix, frameNumber));
}

function readSerialTouchMatrix(serialPort, wsClient) {
  let buffer = Buffer.alloc(0);
  let frameNumber = 0;

  serialPort.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= FRAME_HEADER.length) {
      const headerIndex = buffer.indexOf(Buffer.from(FRAME_HEADER));

      if (headerIndex === -1) {
        buffer = buffer.subarray(buffer.length - 1);
        return;
      }

      if (headerIndex > 0) {
        buffer = buffer.subarray(headerIndex);
      }

      if (buffer.length < FRAME_SIZE) {
        return;
      }

      const payload = buffer.subarray(FRAME_HEADER.length, FRAME_SIZE);
      buffer = buffer.subarray(FRAME_SIZE);

      const matrix = createMatrixFromPayload(payload);

      if (!isMatrixPayload(matrix)) {
        console.warn('Invalid binary touch matrix skipped');
        continue;
      }

      frameNumber++;
      printMatrix(matrix, frameNumber);
      wsClient.sendTouchMatrix(matrix.values);
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
  const wsClient = createWebSocketClient(wsUrl);
  readSerialTouchMatrix(serialPort, wsClient);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
