const fs = require('node:fs/promises');
const path = require('node:path');
const { ipcMain } = require('electron');
const { DESKTOP_API, IPC_CHANNELS } = require('../../shared/constants');
const { getActiveClient } = require('./deviceHandlers');
const { deviceReportsDir, ensureDeviceSubdirs } = require('../services/savePaths');
const { defaultFileName, saveBufferWithDialog, toBuffer } = require('../services/fileSave');
const { buildZipBuffer } = require('../services/zipStore');

function failure(error) {
  return {
    ok: false,
    status: error.status || 0,
    error: error.message || String(error)
  };
}

function reportPdfEndpoint(reportId) {
  if (!reportId && reportId !== 0) {
    throw new Error('Report id is required.');
  }

  return DESKTOP_API.REPORT_PDF.replace('{reportId}', encodeURIComponent(String(reportId)));
}

function success(data) {
  return { ok: true, data };
}

function emitZipProgress(event, payload) {
  try {
    if (event && event.sender && !event.sender.isDestroyed()) {
      event.sender.send(IPC_CHANNELS.REPORTS_ZIP_PROGRESS, payload);
    }
  } catch (_error) {
    // ignore closed windows
  }
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
      const result = await client.request(reportPdfEndpoint(reportId), {
        responseType: 'arrayBuffer',
        timeoutMs: 180000
      });

      if (!result.ok) {
        return result;
      }

      return success({
        base64: toBuffer(result.data).toString('base64'),
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

      const result = await client.request(reportPdfEndpoint(reportId), {
        responseType: 'arrayBuffer',
        timeoutMs: 180000
      });
      if (!result.ok) {
        return result;
      }

      await ensureDeviceSubdirs(device);
      const reportsDir = deviceReportsDir(device);
      const filePath = path.join(reportsDir, `report-${reportId}.pdf`);
      await fs.writeFile(filePath, toBuffer(result.data));
      return success({ filePath, reportsDir });
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_PDF_DOWNLOAD, async (event, reportId) => {
    try {
      const { client } = await getActiveClient();
      const result = await client.request(reportPdfEndpoint(reportId), {
        responseType: 'arrayBuffer',
        timeoutMs: 180000
      });

      if (!result.ok) {
        return result;
      }

      return saveBufferWithDialog(event, {
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
      const rawIds = (payload && (payload.report_ids || payload.reportIds)) || [];
      const reportIds = [...new Set(
        rawIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )];

      // Large selections: one server ZIP (reuses cached PDFs on the Pi).
      // Small selections: download + zip locally so the UI can show per-file progress.
      const useServerZip = !reportIds.length || reportIds.length >= 15;

      if (useServerZip) {
        emitZipProgress(event, {
          current: 0,
          total: reportIds.length || 1,
          phase: 'server'
        });
        const result = await client.request(DESKTOP_API.REPORTS_DOWNLOAD, {
          method: 'POST',
          body: reportIds.length ? { report_ids: reportIds } : (payload || {}),
          responseType: 'arrayBuffer',
          timeoutMs: 1800000
        });

        if (!result.ok) {
          return result;
        }

        emitZipProgress(event, {
          current: reportIds.length || 1,
          total: reportIds.length || 1,
          phase: 'zip'
        });

        return saveBufferWithDialog(event, {
          buffer: result.data,
          defaultPath: defaultFileName('reports-download', 'zip'),
          filters: [{ name: 'Archive', extensions: ['zip'] }]
        });
      }

      const entries = [];
      const errors = [];
      const total = reportIds.length;

      for (let index = 0; index < reportIds.length; index += 1) {
        const reportId = reportIds[index];
        emitZipProgress(event, {
          current: index + 1,
          total,
          reportId,
          phase: 'download'
        });

        const result = await client.request(reportPdfEndpoint(reportId), {
          responseType: 'arrayBuffer',
          timeoutMs: 180000
        });

        if (!result.ok) {
          errors.push(`Report ${reportId}: ${result.error || 'download failed'}`);
          continue;
        }

        const buffer = toBuffer(result.data);
        if (!buffer.length) {
          errors.push(`Report ${reportId}: empty PDF`);
          continue;
        }

        entries.push({
          name: `reports/report-${reportId}.pdf`,
          data: buffer
        });
      }

      if (!entries.length) {
        return {
          ok: false,
          error: errors.length
            ? (errors.length > 3
              ? `${errors.length} reports failed (e.g. ${errors[0]}).`
              : errors.join(' '))
            : 'No PDF files could be added to the ZIP.'
        };
      }

      emitZipProgress(event, {
        current: total,
        total,
        phase: 'zip'
      });

      const zipBuffer = buildZipBuffer(entries);
      const saved = await saveBufferWithDialog(event, {
        buffer: zipBuffer,
        defaultPath: defaultFileName('reports-download', 'zip'),
        filters: [{ name: 'Archive', extensions: ['zip'] }]
      });

      if (!saved.ok) {
        return saved;
      }

      return {
        ok: true,
        data: {
          ...saved.data,
          added: entries.length,
          skipped: errors.length,
          errors: errors.slice(0, 5)
        }
      };
    } catch (error) {
      return failure(error);
    }
  });
}

module.exports = {
  registerReportsHandlers
};
