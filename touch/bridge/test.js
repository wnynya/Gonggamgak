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

const ROW_COUNT = 12;
const COL_COUNT = 7;
const CELL_COUNT = ROW_COUNT * COL_COUNT;
const FRAME_HEADER = [0xaa, 0x55];
const FRAME_SIZE = FRAME_HEADER.length + CELL_COUNT;

function createMatrixFromPayload(payload) {
  const values = [];

  for (let r = 0; r < ROW_COUNT; r++) {
    const row = [];

    for (let c = 0; c < COL_COUNT; c++) {
      row.push(payload[r * COL_COUNT + c]);
    }

    values.push(row);
  }

  return values;
}

(async () => {
  if (args.l) {
    const serials = await Serial.list();
    console.log(`Serials (${serials.length}):`);
    serials.forEach((serial) => {
      console.log(
        `  ${serial.path} (${serial.vendorId || ''}:${serial.productId || ''})`,
      );
    });
    return;
  }

  let buffer = Buffer.alloc(0);

  const spath = args.s;
  const serial = new Serial(spath, { reconnectTime: 500 });
  serial.on('open', () => {
    console.log(`Serial opened: ${serial.path} (${serial.options.baudRate})`);
  });
  serial.on('data', (chunk) => {
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
      const data = createMatrixFromPayload(payload);
      wsc.event('touch', data);
    }
  });
  serial.on('close', () => {
    console.log(`Serial closed: ${serial.path}`);
  });
  serial.on('error', (error) => {
    //console.error(`Serial error: ${error.message}`);
  });

  const wsc = new WebSocketClient('wss:g161.ccc.vg/touch');
  wsc.on('open', () => {
    console.log(`Websocket opened: ${wsc.uri}`);
  });
  wsc.on('data', (data) => {
    console.log(data);
  });
  wsc.on('close', () => {
    console.log(`Websocket closed: ${wsc.uri}`);
  });
  wsc.on('error', (error) => {
    //console.error(`Websocket error: ${error.message}`);
  });

  serial.open();
  wsc.open();
})();
