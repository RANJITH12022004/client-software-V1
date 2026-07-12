const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { BackupScheduler } = require('../services/backupScheduler');
const { getActiveClient } = require('./deviceHandlers');

const backupScheduler = new BackupScheduler();

function failure(error) {
  return {
    ok: false,
    error: error.message || String(error)
  };
}

function backupFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `machine-backup-${stamp}.zip`;
}

async function saveBackup(event, buffer, scheduled) {
  if (scheduled) {
    const filePath = path.join(app.getPath('downloads'), backupFileName());
    await fs.writeFile(filePath, buffer);
    return {
      ok: true,
      data: { filePath, scheduled: true }
    };
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    defaultPath: backupFileName(),
    filters: [{ name: 'Backup Archive', extensions: ['zip'] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, error: 'Save was cancelled.' };
  }

  await fs.writeFile(result.filePath, buffer);
  return {
    ok: true,
    data: { filePath: result.filePath }
  };
}

async function runBackup({ event, payload, scheduled } = {}) {
  const { client } = await getActiveClient();
  const result = await client.request(DESKTOP_API.BACKUP_DOWNLOAD, {
    method: 'POST',
    body: payload || {},
    responseType: 'arrayBuffer',
    timeoutMs: 180000
  });

  if (!result.ok) {
    return result;
  }

  return saveBackup(event, result.data, scheduled);
}

function sendToWindow(mainWindow, channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function registerBackupHandlers(mainWindow, setBackupInProgress) {
  backupScheduler.on('start', (payload) => {
    if (typeof setBackupInProgress === 'function') {
      setBackupInProgress(true);
    }
    sendToWindow(mainWindow, IPC_CHANNELS.BACKUP_SCHEDULE_STARTED, payload);
  });

  backupScheduler.on('finish', (payload) => {
    if (typeof setBackupInProgress === 'function') {
      setBackupInProgress(false);
    }
    sendToWindow(mainWindow, IPC_CHANNELS.BACKUP_SCHEDULE_FINISHED, payload);
  });

  backupScheduler.on('error', (error) => {
    console.error('Scheduled backup failed:', error);
  });

  backupScheduler.init((options) => runBackup(options)).catch((error) => {
    console.error('Backup scheduler failed to initialize:', error);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_DOWNLOAD, async (event, payload) => {
    try {
      return runBackup({ event, payload });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULE_GET, async () => {
    try {
      await backupScheduler.init((options) => runBackup(options));
      return { ok: true, data: backupScheduler.getSchedule() };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULE_SET, async (_event, schedule) => {
    try {
      return { ok: true, data: await backupScheduler.setSchedule(schedule || {}) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULE_CLEAR, async () => {
    try {
      return { ok: true, data: await backupScheduler.clearSchedule() };
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = {
  registerBackupHandlers
};
