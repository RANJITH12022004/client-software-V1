const { ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { getActiveClient } = require('./deviceHandlers');
const { defaultFileName, saveBufferWithDialog } = require('../services/fileSave');

function failure(error) {
  return {
    ok: false,
    status: error.status || 0,
    error: error.message || String(error)
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
        timeoutMs: 900000
      });
      if (!result.ok) {
        return result;
      }

      return saveBufferWithDialog(event, {
        buffer: result.data,
        defaultPath: defaultFileName('audit-download', 'pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = {
  registerAuditHandlers
};
