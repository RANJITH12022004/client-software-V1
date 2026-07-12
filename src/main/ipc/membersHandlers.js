const { ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { DeviceStore } = require('../services/deviceStore');
const { TokenStore } = require('../services/tokenStore');
const { KioskApiClient } = require('../services/kioskApiClient');

const deviceStore = new DeviceStore();
const tokenStore = new TokenStore();

function failure(error) {
  return { ok: false, error: error.message || String(error) };
}

async function clientForActiveDevice() {
  const device = await deviceStore.getActiveDevice();
  if (!device) throw new Error('No active machine device is configured.');
  const token = await tokenStore.getToken(device.id);
  return { device, client: new KioskApiClient({ baseUrl: device.baseUrl, token }) };
}

function registerMembersHandlers() {
  ipcMain.handle(IPC_CHANNELS.MEMBERS_LIST, async () => {
    try {
      const { client } = await clientForActiveDevice();
      return client.request(DESKTOP_API.MEMBERS);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMBERS_GET, async (_event, memberId) => {
    try {
      const { client } = await clientForActiveDevice();
      return client.request(DESKTOP_API.MEMBER.replace('{memberId}', String(memberId)));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMBERS_SAVE, async (_event, payload) => {
    try {
      const { client } = await clientForActiveDevice();
      const body = payload || {};
      const id = body.id || body.memberId;
      if (id) {
        return client.request(DESKTOP_API.MEMBER.replace('{memberId}', String(id)), {
          method: 'PUT',
          body
        });
      }
      return client.request(DESKTOP_API.MEMBERS, { method: 'POST', body });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMBERS_REMOVE, async (_event, payload) => {
    try {
      const { client } = await clientForActiveDevice();
      const memberId = typeof payload === 'object' ? payload.memberId : payload;
      const verifyToken = payload && payload.verifyToken;
      return client.request(DESKTOP_API.MEMBER.replace('{memberId}', String(memberId)), {
        method: 'DELETE',
        headers: verifyToken ? { 'X-Approval-Verify-Token': verifyToken } : {}
      });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMBERS_UNLOCK, async (_event, memberId) => {
    try {
      const { client } = await clientForActiveDevice();
      return client.request(DESKTOP_API.MEMBER_UNLOCK.replace('{memberId}', String(memberId)), {
        method: 'POST'
      });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMBERS_ENABLE, async (_event, memberId) => {
    try {
      const { client } = await clientForActiveDevice();
      return client.request(DESKTOP_API.MEMBER_ENABLE.replace('{memberId}', String(memberId)), {
        method: 'POST'
      });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMBERS_PERMISSION_CARDS, async () => {
    try {
      const { client } = await clientForActiveDevice();
      return client.request(DESKTOP_API.PERMISSION_CARDS);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.APPROVAL_VERIFY, async (_event, payload) => {
    try {
      const { client } = await clientForActiveDevice();
      return client.request(DESKTOP_API.APPROVAL_VERIFY, {
        method: 'POST',
        body: payload || {}
      });
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = { registerMembersHandlers };
