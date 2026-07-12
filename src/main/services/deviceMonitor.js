const { EventEmitter } = require('node:events');
const { probeDeviceHealth } = require('./deviceHealth');

const DEFAULT_POLL_MS = 15000;
const FAST_POLL_MS = 5000;
const FAST_POLL_DURATION_MS = 120000;

class DeviceMonitor extends EventEmitter {
  constructor(deviceStore) {
    super();
    this.deviceStore = deviceStore;
    this.pollTimer = null;
    this.fastPollUntil = 0;
    this.snapshot = {};
    this.polling = false;
  }

  getSnapshot() {
    return { ...this.snapshot };
  }

  setDeviceStatus(deviceId, status) {
    this.snapshot[deviceId] = status;
    this.emit('update', this.getSnapshot());
  }

  async checkDevice(device, { persistBaseUrl = true } = {}) {
    const result = await probeDeviceHealth(device);
    const healthData = (result && result.data) || {};
    const entry = {
      deviceId: device.id,
      online: Boolean(result.ok),
      status: result.ok ? 'online' : 'offline',
      error: result.ok ? null : result.error,
      baseUrl: result.baseUrl || device.baseUrl,
      checkedAt: result.checkedAt || new Date().toISOString(),
      legacy: Boolean(healthData.legacy),
      app: healthData.app || null,
      model: healthData.model || null,
      serial: healthData.serial || null
    };

    if (result.ok && persistBaseUrl && result.baseUrl && result.baseUrl !== device.baseUrl) {
      try {
        await this.deviceStore.saveDevice({
          ...device,
          baseUrl: result.baseUrl
        });
        entry.baseUrl = result.baseUrl;
      } catch {
        // keep last good health even if persist fails
      }
    }

    this.setDeviceStatus(device.id, entry);
    return entry;
  }

  async pollAll({ persistBaseUrl = true } = {}) {
    const devices = await this.deviceStore.listDevices();

    if (!devices.length) {
      this.snapshot = {};
      this.emit('update', this.getSnapshot());
      return this.getSnapshot();
    }

    await Promise.all(devices.map((device) => this.checkDevice(device, { persistBaseUrl })));
    return this.getSnapshot();
  }

  schedulePoll(delayMs) {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      if (!this.polling) {
        return;
      }

      try {
        await this.pollAll();
      } catch (error) {
        this.emit('error', error);
      }

      const interval = Date.now() < this.fastPollUntil ? FAST_POLL_MS : DEFAULT_POLL_MS;
      this.schedulePoll(interval);
    }, delayMs);
  }

  start() {
    if (this.polling) {
      return this.getSnapshot();
    }

    this.polling = true;
    this.fastPollUntil = Date.now() + FAST_POLL_DURATION_MS;
    this.pollAll().catch((error) => this.emit('error', error));
    this.schedulePoll(FAST_POLL_MS);
    return this.getSnapshot();
  }

  stop() {
    this.polling = false;
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  bumpFastPoll() {
    this.fastPollUntil = Date.now() + FAST_POLL_DURATION_MS;
  }

  async handshakeDevice(deviceId) {
    const device = await this.deviceStore.getDevice(deviceId);
    if (!device) {
      throw new Error('Saved machine device was not found.');
    }

    this.bumpFastPoll();
    this.setDeviceStatus(device.id, {
      deviceId: device.id,
      online: false,
      status: 'checking',
      error: null,
      baseUrl: device.baseUrl,
      checkedAt: new Date().toISOString()
    });

    const entry = await this.checkDevice(device, { persistBaseUrl: true });
    return entry;
  }
}

module.exports = {
  DeviceMonitor
};
