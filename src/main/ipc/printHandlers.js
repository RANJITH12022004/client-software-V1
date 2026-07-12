const { BrowserWindow, ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { getActiveClient } = require('./deviceHandlers');

function printCurrentWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window) {
    return Promise.reject(new Error('Unable to access the dashboard print surface.'));
  }

  return new Promise((resolve) => {
    window.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      if (!success) {
        resolve({
          ok: false,
          error: failureReason || 'Local printer did not accept the print job.'
        });
        return;
      }

      resolve({ ok: true, data: { printed: true } });
    });
  });
}

function registerPrintHandlers() {
  ipcMain.handle(IPC_CHANNELS.PRINT_AUDIT, async (event, payload) => {
    try {
      const printResult = await printCurrentWindow(event);

      if (!printResult.ok) {
        return printResult;
      }

      const { client } = await getActiveClient();
      const logResult = await client.request(DESKTOP_API.AUDIT_DESKTOP_PRINT, {
        method: 'POST',
        body: {
          ...(payload || {}),
          printedAt: new Date().toISOString(),
          source: 'rle-desktop-client'
        },
        timeoutMs: 120000
      });

      if (!logResult.ok) {
        return logResult;
      }

      return {
        ok: true,
        data: {
          printed: true,
          logged: true,
          machine: logResult.data
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message || String(error)
      };
    }
  });
}

module.exports = {
  registerPrintHandlers
};
