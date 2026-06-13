'use strict';

import EventEmitter from 'node:events';
import WebSocket from 'ws';

class WebSocketClient extends EventEmitter {
  constructor(uri, options = {}) {
    super();

    this.uri = uri;

    options.autoReconnect = options.autoReconnect
      ? options.autoReconnect
      : true;
    this.options = options;

    this.connection = null;
    this.connected = false;
    this.closed = false;

    this.pingInterval = null;
    this.setPingInterval = () => {
      this.pingInterval = setInterval(() => {
        if (this.connection && this.connected) {
          this.connection.send('PING');
        }
      }, 1000 * 2);
    };
    this.clearPingInterval = () => {
      clearInterval(this.pingInterval);
    };

    this.reconnectInterval = null;
    this.setReconnectInterval = () => {
      this.reconnectInterval = setInterval(() => {
        if (this.options.autoReconnect && !this.connected && !this.closed) {
          this.open();
        }
      }, 1000 * 2);
    };
    this.clearReconnectInterval = () => {
      clearInterval(this.reconnectInterval);
    };
  }

  open() {
    if (this.connection || this.connected) {
      return;
    }
    this.closed = false;

    try {
      this.connection = new WebSocket(this.uri);
      this.#addEventListener();
    } catch (error) {
      throw error;
    }
  }

  #addEventListener() {
    this.connection.on('open', (event) => {
      this.connected = true;
      this.clearReconnectInterval();
      this.setPingInterval();
      this.emit('open', event);
    });

    this.connection.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      const event = { data: text };

      this.emit('message', event);
      try {
        const object = JSON.parse(text);
        this.emit('json', this, object.event, object.data, object.message);
        this.emit('text', this, text);
      } catch (error) {
        this.emit('text', this, text);
      }
    });

    this.connection.on('close', (code, reason) => {
      this.connected = false;
      this.clearPingInterval();
      this.setReconnectInterval();
      this.connection = null;
      this.emit('close', { code, reason });
    });

    this.connection.on('error', (event) => {
      this.emit('error', event);
    });
  }

  close() {
    this.closed = true;
    this.connection?.close();
  }

  send(message) {
    if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
      return;
    }
    if (typeof message == 'object') {
      message = JSON.stringify(message);
    }
    this.connection.send(message);
  }

  event(name, data, message = name) {
    this.send({
      event: name,
      message: message,
      data: data,
    });
  }
}

export default WebSocketClient;
