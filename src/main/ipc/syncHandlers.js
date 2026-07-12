const { ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../../shared/constants');
const { SyncScheduler } = require('../services/syncScheduler');
const { SyncStore } = require('../services/syncStore');
const { runDeviceSync } = require('../services/syncService');
const { getActiveClient } = require('./deviceHandlers');

const syncScheduler = new SyncScheduler();
const syncStore = new SyncStore();

function failure(error) {
  return {
    ok: false,
    error: error.message || String(error)
  };
}

function sendToWindow(mainWindow, channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function executeSync({ mode = 'all' } = {}) {
  const { device, client } = await getActiveClient();
  const result = await runDeviceSync({
    client,
    device,
    syncStore,
    mode
  });

  return {
    ok: true,
    data: result
  };
}

function registerSyncHandlers(mainWindow, setSyncInProgress) {
  syncScheduler.on('start', (payload) => {
    if (typeof setSyncInProgress === 'function') {
      setSyncInProgress(true);
    }
    sendToWindow(mainWindow, IPC_CHANNELS.SYNC_SCHEDULE_STARTED, payload);
  });

  syncScheduler.on('finish', (payload) => {
    if (typeof setSyncInProgress === 'function') {
      setSyncInProgress(false);
    }
    sendToWindow(mainWindow, IPC_CHANNELS.SYNC_SCHEDULE_FINISHED, payload);
  });

  syncScheduler.init(() => executeSync({ mode: 'all' })).catch((error) => {
    console.error('Sync scheduler failed to initialize:', error);
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_RUN, async (_event, options = {}) => {
    try {
      const mode = options.mode || 'all';
      return await executeSync({ mode });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_STATE_GET, async () => {
    try {
      const { device } = await getActiveClient();
      const state = await syncStore.getDeviceState(device.id);
      return {
        ok: true,
        data: {
          deviceId: device.id,
          savePath: device.savePath,
          ...state
        }
      };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_SCHEDULE_GET, async () => {
    try {
      await syncScheduler.init(() => executeSync({ mode: 'all' }));
      return { ok: true, data: syncScheduler.getSchedule() };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_SCHEDULE_SET, async (_event, schedule) => {
    try {
      const { device } = await getActiveClient();
      const payload = {
        ...schedule,
        deviceId: device.id,
        enabled: schedule.enabled === true
      };
      return { ok: true, data: await syncScheduler.setSchedule(payload) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_BUSY_SET, async (_event, busy) => {
    if (typeof setSyncInProgress === 'function') {
      setSyncInProgress(Boolean(busy));
    }
    return { ok: true, data: { syncInProgress: Boolean(busy) } };
  });
}

module.exports = {
  registerSyncHandlers
};
