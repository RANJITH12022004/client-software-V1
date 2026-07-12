const { ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { DeviceStore } = require('../services/deviceStore');
const { TokenStore } = require('../services/tokenStore');
const { KioskApiClient } = require('../services/kioskApiClient');

const deviceStore = new DeviceStore();
const tokenStore = new TokenStore();

function failure(error) {
  return {
    ok: false,
    error: error.message || String(error)
  };
}

function registerAuthHandlers() {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, credentials) => {
    try {
      const device = await deviceStore.getActiveDevice();

      if (!device) {
        throw new Error('Select a machine device before logging in.');
      }

      const client = new KioskApiClient({ baseUrl: device.baseUrl });
      const result = await client.request(DESKTOP_API.AUTH_LOGIN, {
        method: 'POST',
        body: {
          username: credentials && credentials.username,
          password: credentials && credentials.password
        }
      });

      if (!result.ok) {
        return result;
      }

      const payload = result.data || {};
      const token = payload.token || payload.accessToken || payload.access_token || payload.sessionToken;

      if (!token) {
        return {
          ok: false,
          status: result.status,
          error: 'Login could not be completed. Please try again or contact IT.'
        };
      }

      await tokenStore.setToken(device.id, token);
      const savedToken = await tokenStore.getToken(device.id);
      if (!savedToken) {
        return {
          ok: false,
          status: 500,
          error: 'Login could not be completed for the selected machine. Please try again.'
        };
      }

      const meResult = await new KioskApiClient({ baseUrl: device.baseUrl, token: savedToken }).request(DESKTOP_API.AUTH_ME);
      if (!meResult.ok || !meResult.data || !meResult.data.user) {
        await tokenStore.clearToken(device.id);
        return {
          ok: false,
          status: meResult.status || 500,
          error: meResult.error || 'Desktop session could not be established for the selected machine.'
        };
      }

      return {
        ...result,
        data: {
          user: meResult.data.user || payload.user || payload.me || payload.profile || null,
          device
        }
      };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_ME, async () => {
    try {
      const device = await deviceStore.getActiveDevice();

      if (!device) {
        throw new Error('No active machine device is configured.');
      }

      const token = await tokenStore.getToken(device.id);
      const client = new KioskApiClient({ baseUrl: device.baseUrl, token });
      const result = await client.request(DESKTOP_API.AUTH_ME);

      // Server-side desktop tokens are in-memory on the Pi, so a service restart
      // invalidates previously saved client tokens. Clear stale local tokens on 401
      // so the renderer can prompt for a fresh login instead of acting authenticated.
      if (!result.ok && result.status === 401) {
        await tokenStore.clearToken(device.id);
      }

      return result;
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    try {
      const device = await deviceStore.getActiveDevice();

      if (!device) {
        throw new Error('No active machine device is configured.');
      }

      const token = await tokenStore.getToken(device.id);
      const client = new KioskApiClient({ baseUrl: device.baseUrl, token });
      const result = await client.request(DESKTOP_API.AUTH_LOGOUT, { method: 'POST' });
      await tokenStore.clearToken(device.id);
      return result.ok ? result : { ...result, data: { localTokenCleared: true } };
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = {
  registerAuthHandlers
};
