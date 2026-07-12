const { ipcMain, shell } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { DeviceStore } = require('../services/deviceStore');
const { TokenStore } = require('../services/tokenStore');
const { KioskApiClient } = require('../services/kioskApiClient');

const deviceStore = new DeviceStore();
const tokenStore = new TokenStore();

function failure(error) {
  return { ok: false, error: error.message || String(error) };
}

function registerEmbedHandlers() {
  ipcMain.handle(IPC_CHANNELS.EMBED_RECIPE_URL, async () => {
    try {
      const device = await deviceStore.getActiveDevice();
      if (!device) throw new Error('No active machine device is configured.');
      const token = await tokenStore.getToken(device.id);
      const client = new KioskApiClient({ baseUrl: device.baseUrl, token });
      const result = await client.request(DESKTOP_API.EMBED_ISSUE, { method: 'POST' });
      if (!result.ok && result.status === 401) {
        await tokenStore.clearToken(device.id);
      }
      if (!result.ok) return result;
      const url = result.data && (result.data.url || result.data.embedUrl);
      return { ok: true, data: { url, device } };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.EMBED_OPEN_EXTERNAL, async (_event, url) => {
    try {
      if (!url) throw new Error('URL is required.');
      await shell.openExternal(url);
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = { registerEmbedHandlers };
