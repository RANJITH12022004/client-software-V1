const fs = require('node:fs/promises');
const { BrowserWindow, dialog, ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { getActiveClient } = require('./deviceHandlers');

function failure(error) {
  return {
    ok: false,
    error: error.message || String(error)
  };
}

function defaultFileName(prefix, extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${extension}`;
}

async function saveBuffer(event, buffer) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    defaultPath: defaultFileName('audit-download', 'pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, error: 'Save was cancelled.' };
  }

  await fs.writeFile(result.filePath, buffer);
  return {
    ok: true,
    data: {
      filePath: result.filePath
    }
  };
}

function registerAuditHandlers() {
  ipcMain.handle(IPC_CHANNELS.AUDIT_LIST, async (_event, filters) => {
    try {
      const { client } = await getActiveClient();
      return client.request(DESKTOP_API.AUDIT, { query: filters || {} });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_DOWNLOAD, async (event, payload) => {
    try {
      const { client } = await getActiveClient();
      const result = await client.request(DESKTOP_API.AUDIT_DOWNLOAD, {
        method: 'POST',
        body: payload || {},
        responseType: 'arrayBuffer',
        timeoutMs: 120000
      });

      if (!result.ok) {
        return result;
      }

      return saveBuffer(event, result.data);
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = {
  registerAuditHandlers
};
