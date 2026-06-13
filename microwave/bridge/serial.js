import EventEmitter from 'node:events';
import { SerialPort } from 'serialport';

const DEFAULT_BAUD_RATE = 9600;

class Serial extends EventEmitter {
  constructor(path, options = {}) {
    super();

    this.path = path;
    this.options = {
      baudRate: DEFAULT_BAUD_RATE,
      ...options,
    };
    this.connection = null;
    this.connected = false;
    this.buffer = '';
  }

  static list() {
    return SerialPort.list();
  }

  async open() {
    if (this.connection || this.connected) {
      return;
    }

    this.connection = new SerialPort({
      path: this.path,
      baudRate: this.options.baudRate,
      autoOpen: false,
    });
    this.#addEventListener();

    await new Promise((resolve, reject) => {
      this.connection.once('open', resolve);
      this.connection.once('error', reject);
      this.connection.open();
    });
  }

  close() {
    this.connection?.close();
  }

  send(data) {
    if (!this.connection || !this.connected) {
      return;
    }

    const text = String(data);
    const message = text.endsWith('\n') ? text : `${text}\n`;

    this.connection.write(message, (error) => {
      if (error) {
        this.emit('error', error);
      }
    });
  }

  #addEventListener() {
    this.connection.on('open', () => {
      this.connected = true;
      this.emit('open');
    });

    this.connection.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');

      while (true) {
        const newlineIndex = this.buffer.search(/\r?\n/);

        if (newlineIndex === -1) {
          return;
        }

        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(
          newlineIndex + (this.buffer[newlineIndex] === '\r' ? 2 : 1),
        );

        if (line) {
          this.emit('message', line);
        }
      }
    });

    this.connection.on('close', () => {
      this.connected = false;
      this.connection = null;
      this.emit('close');
    });

    this.connection.on('error', (error) => {
      this.emit('error', error);
    });
  }
}

export default Serial;
