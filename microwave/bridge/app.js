import Serial from './serial.js';
import WebSocketClient from './websocket-client.js';

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

async function main() {
  if (args.l) {
    await listSerialPorts();
    return;
  }

  id = args.i;
  const wsc = new WebSocketClient('wss://g161.ccc.vg/microwave');

  const serial = new Serial(args.s, { baudRate: 9600 });

  wsc.on('open', () => {
    console.log(`ws open`);
  });
  wsc.on('json', (event, data) => {
    console.log(event, data);
  });
  wsc.on('close', () => {
    console.log('ws close');
  });
  wsc.on('error', (error) => {
    console.error('wsc error:', error.message);
  });

  serial.on('open', () => {
    console.log(`serial open: ${serial.path}`);
  });
  serial.on('message', (data) => {
    console.log(data);
  });
  serial.on('error', (error) => {
    console.error('serial error:', error.message);
  });

  await serial.open();
  wsc.open();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
