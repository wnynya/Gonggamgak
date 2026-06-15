'use strict';

import EventEmitter from 'node:events';
import { SerialPort } from 'serialport';

class Serial extends EventEmitter {
  constructor(path, options = {}) {
    super();

    this.path = path;
    this.options = {
      baudRate: 9600,
      reconnect: true,
      reconnectTime: 1000 * 2,
      ...options,
    };

    this.connection = null;
    this.connected = false;

    this.buffer = '';

    this.reconnectInterval = null;
    this.setReconnectInterval = () => {
      this.clearReconnectInterval();
      this.reconnectInterval = setInterval(() => {
        if (this.options.reconnect && !this.connected) {
          this.open();
        }
      }, this.options.reconnectTime);
    };
    this.clearReconnectInterval = () => {
      clearInterval(this.reconnectInterval);
    };
  }

  #addEventListener() {
    this.connection.on('open', () => {
      this.connected = true;
      this.clearReconnectInterval();
      this.emit('open');
    });

    this.connection.on('data', (chunk) => {
      this.emit('data', chunk);
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
      this.setReconnectInterval();
      this.emit('close');
    });

    this.connection.on('error', (error) => {
      this.connected = false;
      this.connection = null;
      this.setReconnectInterval();
      this.emit('error', error);
    });
  }

  open() {
    if (this.connection || this.connected) {
      return;
    }

    this.connection = new SerialPort({
      path: this.path,
      baudRate: this.options.baudRate,
      autoOpen: false,
    });
    this.#addEventListener();

    this.connection.open();
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

  static list() {
    return SerialPort.list();
  }
}

export default Serial;
