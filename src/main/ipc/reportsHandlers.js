const fs = require('node:fs/promises');
const path = require('node:path');
const { BrowserWindow, dialog, ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { getActiveClient } = require('./deviceHandlers');
const { deviceReportsDir, ensureDeviceSubdirs } = require('../services/savePaths');

function failure(error) {
  return {
    ok: false,
    error: error.message || String(error)
  };
}

function reportPdfEndpoint(reportId) {
  if (!reportId) {
    throw new Error('Report id is required.');
  }

  return DESKTOP_API.REPORT_PDF.replace('{reportId}', encodeURIComponent(reportId));
}

function defaultFileName(prefix, extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${extension}`;
}

async function saveBuffer({ event, buffer, defaultPath, filters }) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    defaultPath,
    filters
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

function success(data) {
  return { ok: true, data };
}

function registerReportsHandlers() {
  ipcMain.handle(IPC_CHANNELS.REPORTS_LIST, async (_event, filters) => {
    try {
      const { client } = await getActiveClient();
      return client.request(DESKTOP_API.REPORTS, { query: filters || {} });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_GET, async (_event, reportId) => {
    try {
      const { client } = await getActiveClient();
      const result = await client.request(reportPdfEndpoint(reportId), { responseType: 'arrayBuffer' });

      if (!result.ok) {
        return result;
      }

      return success({
        base64: Buffer.from(result.data).toString('base64'),
        mimeType: 'application/pdf'
      });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_SAVE, async (_event, payload) => {
    try {
      const reportId = payload && payload.reportId;
      const { device, client } = await getActiveClient();

      if (!device.savePath) {
        throw new Error('Choose a save folder before exporting reports.');
      }

      const result = await client.request(reportPdfEndpoint(reportId), { responseType: 'arrayBuffer' });
      if (!result.ok) {
        return result;
      }

      await ensureDeviceSubdirs(device);
      const reportsDir = deviceReportsDir(device);
      const filePath = path.join(reportsDir, `report-${reportId}.pdf`);
      await fs.writeFile(filePath, Buffer.from(result.data));
      return success({ filePath, reportsDir });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_DOWNLOAD, async (event, reportId) => {
    try {
      const { client } = await getActiveClient();
      const result = await client.request(reportPdfEndpoint(reportId), { responseType: 'arrayBuffer' });

      if (!result.ok) {
        return result;
      }

      return saveBuffer({
        event,
        buffer: result.data,
        defaultPath: defaultFileName(`report-${reportId}`, 'pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_DOWNLOAD, async (event, payload) => {
    try {
      const { client } = await getActiveClient();
      const result = await client.request(DESKTOP_API.REPORTS_DOWNLOAD, {
        method: 'POST',
        body: payload || {},
        responseType: 'arrayBuffer',
        timeoutMs: 120000
      });

      if (!result.ok) {
        return result;
      }

      return saveBuffer({
        event,
        buffer: result.data,
        defaultPath: defaultFileName('reports-download', 'zip'),
        filters: [{ name: 'Archive', extensions: ['zip'] }]
      });
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = {
  registerReportsHandlers
};
