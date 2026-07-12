const crypto = require('node:crypto');

const STORE_NAME = 'devices';
const DEFAULT_MACHINE_PORT = Number(process.env.RLE_MACHINE_PORT || 5000);

let StoreConstructor;

async function getStoreConstructor() {
  if (!StoreConstructor) {
    const module = await import('electron-store');
    StoreConstructor = module.default || module;
  }

  return StoreConstructor;
}

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim();

  if (!value) {
    throw new Error('Machine URL is required.');
  }

  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Machine URL must start with http:// or https://.');
  }

  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeIp(input) {
  const value = String(input || '').trim();

  if (!value) {
    throw new Error('Machine IP is required.');
  }

  if (/^https?:\/\//i.test(value)) {
    return new URL(normalizeBaseUrl(value)).host;
  }

  return value.replace(/\/$/, '');
}

function withMachinePort(value, port = DEFAULT_MACHINE_PORT) {
  const raw = String(value || '').trim();
  if (!raw) {
    return raw;
  }

  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`http://${raw}`);
    if (!url.port && port) {
      url.port = String(port);
    }
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

function baseUrlFromIp(ip) {
  const value = String(ip || '').trim();

  if (/^https?:\/\//i.test(value)) {
    return withMachinePort(normalizeBaseUrl(value));
  }

  return withMachinePort(`http://${value}`);
}

function sanitizeDevice(device) {
  const baseUrl = withMachinePort(device.baseUrl ? normalizeBaseUrl(device.baseUrl) : baseUrlFromIp(device.ip));
  const ip = normalizeIp(device.ip || baseUrl);
  const nickname = String(device.nickname || device.name || '').trim() || new URL(baseUrl).host;
  const clientId = String(device.clientId || device.id || crypto.randomUUID()).trim();

  return {
    id: device.id || clientId,
    clientId,
    ip,
    nickname,
    name: nickname,
    baseUrl,
    savePath: String(device.savePath || '').trim() || null,
    createdAt: device.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

class DeviceStore {
  constructor() {
    this.store = null;
  }

  async init() {
    if (!this.store) {
      const Store = await getStoreConstructor();
      this.store = new Store({
        name: STORE_NAME,
        defaults: {
          devices: [],
          activeDeviceId: null,
          selectedDeviceId: null
        }
      });
    }

    return this;
  }

  async listDevices() {
    await this.init();
    return this.store.get('devices', []);
  }

  async getDevice(deviceId) {
    const devices = await this.listDevices();
    return devices.find((device) => device.id === deviceId) || null;
  }

  async getActiveDevice() {
    await this.init();
    const activeDeviceId = this.store.get('selectedDeviceId') || this.store.get('activeDeviceId');
    const devices = await this.listDevices();
    return devices.find((device) => device.id === activeDeviceId) || devices[0] || null;
  }

  async setActiveDevice(deviceId) {
    await this.init();
    const device = await this.getDevice(deviceId);

    if (!device) {
      throw new Error('Saved machine device was not found.');
    }

    this.store.set('activeDeviceId', device.id);
    this.store.set('selectedDeviceId', device.id);
    return device;
  }

  async getSelectedDevice() {
    return this.getActiveDevice();
  }

  async setSelectedDevice(deviceId) {
    return this.setActiveDevice(deviceId);
  }

  async saveDevice(input) {
    await this.init();
    const devices = await this.listDevices();
    const device = sanitizeDevice(input || {});
    const index = devices.findIndex((item) => item.id === device.id);

    if (index >= 0) {
      devices[index] = { ...devices[index], ...device, createdAt: devices[index].createdAt };
    } else {
      devices.push(device);
    }

    this.store.set('devices', devices);

    if (!this.store.get('activeDeviceId')) {
      this.store.set('activeDeviceId', device.id);
    }

    return device;
  }

  async removeDevice(deviceId) {
    await this.init();
    const devices = await this.listDevices();
    const nextDevices = devices.filter((device) => device.id !== deviceId);

    if (nextDevices.length === devices.length) {
      throw new Error('Saved machine device was not found.');
    }

    this.store.set('devices', nextDevices);

    if (this.store.get('activeDeviceId') === deviceId) {
      this.store.set('activeDeviceId', nextDevices[0] ? nextDevices[0].id : null);
    }

    return { removed: true };
  }

  async migrateStoredUrls() {
    await this.init();
    const devices = this.store.get('devices', []);
    let changed = false;

    const migrated = devices.map((device) => {
      try {
        const fixed = sanitizeDevice(device);
        if (fixed.baseUrl !== device.baseUrl || fixed.ip !== device.ip) {
          changed = true;
          return { ...device, baseUrl: fixed.baseUrl, ip: fixed.ip };
        }
        return device;
      } catch {
        return device;
      }
    });

    if (changed) {
      this.store.set('devices', migrated);
    }

    return migrated;
  }
}

module.exports = {
  DeviceStore,
  normalizeBaseUrl,
  withMachinePort,
  DEFAULT_MACHINE_PORT
};
