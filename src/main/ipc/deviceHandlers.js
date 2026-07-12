const { ipcMain, BrowserWindow } = require('electron');
const { IPC_CHANNELS } = require('../../shared/constants');
const { DeviceStore } = require('../services/deviceStore');
const { TokenStore } = require('../services/tokenStore');
const { KioskApiClient } = require('../services/kioskApiClient');
const { DeviceMonitor } = require('../services/deviceMonitor');
const { probeDeviceHealth } = require('../services/deviceHealth');
const { DESKTOP_API } = require('../../shared/constants');

const deviceStore = new DeviceStore();
const tokenStore = new TokenStore();
const deviceMonitor = new DeviceMonitor(deviceStore);

function success(data) {
  return { ok: true, data };
}

function failure(error) {
  return {
    ok: false,
    status: error.status || 0,
    error: error.message || String(error)
  };
}

function broadcastHealthUpdate() {
  const payload = deviceMonitor.getSnapshot();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.DEVICE_HEALTH_UPDATE, payload);
    }
  });
}

async function getActiveClient({ includeToken = true } = {}) {
  const device = await deviceStore.getActiveDevice();

  if (!device) {
    throw new Error('No active machine device is configured.');
  }

  const token = includeToken ? await tokenStore.getToken(device.id) : null;
  return {
    device,
    client: new KioskApiClient({ baseUrl: device.baseUrl, token })
  };
}

function registerDeviceHandlers(mainWindow) {
  deviceMonitor.on('update', broadcastHealthUpdate);

  ipcMain.handle(IPC_CHANNELS.DEVICE_LIST, async () => {
    try {
      return success(await deviceStore.listDevices());
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_ACTIVE_GET, async () => {
    try {
      return success(await deviceStore.getActiveDevice());
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_ACTIVE_SET, async (_event, deviceId) => {
    try {
      return success(await deviceStore.setActiveDevice(deviceId));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_SELECTED_GET, async () => {
    try {
      return success(await deviceStore.getSelectedDevice());
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_SELECTED_SET, async (_event, deviceId) => {
    try {
      return success(await deviceStore.setSelectedDevice(deviceId));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_SAVE, async (_event, device) => {
    try {
      const existing = device && device.id ? await deviceStore.getDevice(device.id) : null;
      const saved = await deviceStore.saveDevice(device);

      // IP / baseUrl change invalidates the previous machine session token.
      if (existing) {
        const oldIp = String(existing.ip || '').trim();
        const newIp = String(saved.ip || '').trim();
        const oldBase = String(existing.baseUrl || '').trim().replace(/\/$/, '');
        const newBase = String(saved.baseUrl || '').trim().replace(/\/$/, '');
        if (oldIp !== newIp || oldBase !== newBase) {
          await tokenStore.clearToken(saved.id);
        }
      }

      deviceMonitor.bumpFastPoll();
      const handshake = await deviceMonitor.handshakeDevice(saved.id);
      return success({
        ...saved,
        baseUrl: handshake.baseUrl || saved.baseUrl,
        handshake
      });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_REMOVE, async (_event, deviceId) => {
    try {
      await tokenStore.clearToken(deviceId);
      const result = await deviceStore.removeDevice(deviceId);
      await deviceMonitor.pollAll();
      return success(result);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_HEALTH, async (_event, deviceId) => {
    try {
      const device = deviceId ? await deviceStore.getDevice(deviceId) : await deviceStore.getActiveDevice();

      if (!device) {
        throw new Error('No machine device is configured.');
      }

      const entry = await deviceMonitor.handshakeDevice(device.id);
      return entry.online
        ? success(entry)
        : { ok: false, status: 0, error: entry.error || 'Unable to reach the machine.', data: entry };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_HEALTH_ALL, async () => {
    try {
      deviceMonitor.bumpFastPoll();
      const snapshot = await deviceMonitor.pollAll();
      return success(snapshot);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_HEALTH_SNAPSHOT, async () => {
    try {
      return success(deviceMonitor.getSnapshot());
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_PROBE_URL, async (_event, payload) => {
    try {
      const baseUrl = payload && (payload.baseUrl || payload.url);
      const ip = payload && payload.ip;
      const result = await probeDeviceHealth({ baseUrl, ip, id: 'probe' });
      return result.ok
        ? success(result)
        : { ok: false, status: result.status || 0, error: result.error, data: result };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_NETWORK_IPS, async () => {
    try {
      const { client } = await getActiveClient();
      return client.request(DESKTOP_API.NETWORK_IPS, { timeoutMs: 15000 });
    } catch (error) {
      return failure(error);
    }
  });

  deviceStore.migrateStoredUrls()
    .then(() => deviceMonitor.start())
    .catch((error) => {
      console.error('Device monitor failed to start:', error);
      deviceMonitor.start();
    });
}

module.exports = {
  registerDeviceHandlers,
  getActiveClient,
  deviceMonitor
};
