const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
const { DESKTOP_API } = require('../../shared/constants');
const { normalizeBaseUrl } = require('./deviceStore');

const MAX_RECONNECT_MS = 30000;

function toWebSocketUrl(baseUrl) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = DESKTOP_API.WS;
  url.search = '';
  url.hash = '';
  return url.toString();
}

class KioskWsClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.config = null;
    this.status = 'disconnected';
    this.shouldReconnect = false;
    this.reconnectDelayMs = 1000;
    this.reconnectTimer = null;
  }

  getStatus() {
    return {
      status: this.status,
      url: this.config ? toWebSocketUrl(this.config.baseUrl) : null
    };
  }

  connect({ baseUrl, token }) {
    this.close();
    this.config = { baseUrl: normalizeBaseUrl(baseUrl), token };
    this.shouldReconnect = true;
    this.openSocket();
    return this.getStatus();
  }

  openSocket() {
    if (!this.config) {
      return;
    }

    this.setStatus('connecting');
    const headers = this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {};
    this.socket = new WebSocket(toWebSocketUrl(this.config.baseUrl), { headers });

    this.socket.on('open', () => {
      this.reconnectDelayMs = 1000;
      this.setStatus('connected');
    });

    this.socket.on('message', (message) => {
      const text = message.toString();
      try {
        this.emit('message', JSON.parse(text));
      } catch {
        this.emit('message', { type: 'message', payload: text });
      }
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
    });

    this.socket.on('close', () => {
      this.socket = null;

      if (this.shouldReconnect) {
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_MS);
  }

  setStatus(status) {
    this.status = status;
    this.emit('status', this.getStatus());
  }

  close() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }

    this.setStatus('disconnected');
    return this.getStatus();
  }
}

module.exports = {
  KioskWsClient,
  toWebSocketUrl
};
