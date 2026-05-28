import { SerialPort } from 'serialport';
import WebSocket from 'ws';

const BAUD_RATE = 9600;
const WS_URL = 'ws://localhost:9990/smell';

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
    '  node app.js -s <시리얼_장치> -n <숫자>',
    '',
    '예:',
    '  node app.js -l',
    '  node app.js -s /dev/cu.usbmodem101 -n 1',
  ].join('\n');
}

function isTargetData(data, targetNumber) {
  if (data && typeof data === 'object' && 'n' in data) {
    return String(data.n) === targetNumber;
  }

  return String(data) === targetNumber;
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

function sendPress(port) {
  port.write('press\n', (error) => {
    if (error) {
      console.error('Serial write failed:', error.message);
      return;
    }

    console.log('Serial sent: press');
  });
}

function connectWebSocket(serialPort, targetNumber) {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log(`WebSocket connected: ${WS_URL}`);
    console.log(`Waiting for smell-press data: ${targetNumber}`);
  });

  ws.on('message', (buffer) => {
    const text = buffer.toString();

    try {
      const { event, data } = JSON.parse(text);
      if (event === 'smell-press' && isTargetData(data, targetNumber)) {
        console.log('press');
        sendPress(serialPort);
      }
    } catch (error) {
      console.error('Invalid websocket message:', text);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket closed. Reconnecting in 1000ms...');
    setTimeout(() => connectWebSocket(serialPort, targetNumber), 1000);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
}

async function main() {
  if (hasArg('-l')) {
    await listSerialPorts();
    return;
  }

  const serialPath = getArg('-s');
  const targetNumber = getArg('-n');

  if (!serialPath || !targetNumber) {
    throw new Error(getUsage());
  }

  const serialPort = await openSerial(serialPath);
  connectWebSocket(serialPort, targetNumber);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
