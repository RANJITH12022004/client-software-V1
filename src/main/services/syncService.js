const fs = require('node:fs/promises');
const path = require('node:path');
const { DESKTOP_API, MACHINE_API } = require('../../shared/constants');
const { KioskApiClient } = require('./kioskApiClient');
const { SyncStore } = require('./syncStore');
const {
  deviceSaveRoot,
  deviceReportsDir,
  deviceAuditDir,
  ensureDeviceSubdirs
} = require('./savePaths');

function reportPdfEndpoint(reportId) {
  return DESKTOP_API.REPORT_PDF.replace('{reportId}', encodeURIComponent(reportId));
}

function asReports(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.reports)) return payload.reports;
  return [];
}

function asAuditEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.entries)) return payload.entries;
  if (Array.isArray(payload.audit)) return payload.audit;
  return [];
}

function entryTimestampMs(entry) {
  const raw = entry.timestamp_ms ?? entry.timestampMs ?? entry.timestamp ?? entry.createdAt ?? 0;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requestWithFallback(client, desktopPath, machinePath, options = {}) {
  const desktop = await client.request(desktopPath, options);
  if (desktop.ok || desktop.status !== 404) {
    return { ...desktop, api: 'desktop' };
  }

  if (!machinePath) {
    return desktop;
  }

  const machine = await client.request(machinePath, options);
  return { ...machine, api: 'machine' };
}

async function reportPdfExists(reportsDir, reportId) {
  try {
    const filePath = path.join(reportsDir, `report-${reportId}.pdf`);
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch (_error) {
    return false;
  }
}

async function syncReports(client, device, syncStore, { manual = false } = {}) {
  const deviceId = device.id;
  const state = await syncStore.getDeviceState(deviceId);
  const downloaded = new Set(state.downloadedReportIds.map(String));

  const listResult = await requestWithFallback(
    client,
    DESKTOP_API.REPORTS,
    MACHINE_API.REPORTS,
    { query: {} }
  );

  if (!listResult.ok) {
    throw new Error(listResult.error || 'Unable to load reports from the machine.');
  }

  const reports = asReports(listResult.data);
  await ensureDeviceSubdirs(device);
  const reportsDir = deviceReportsDir(device);

  // Re-download when the PDF is missing on disk even if the sync store
  // already marked the report id (common after save-folder / nickname changes).
  const pending = [];
  const skippedExisting = [];
  for (const report of reports) {
    const id = String(report.id ?? report.report_id ?? '');
    if (!id) continue;
    if (downloaded.has(id) && await reportPdfExists(reportsDir, id)) {
      skippedExisting.push(id);
      continue;
    }
    pending.push(report);
  }

  if (!pending.length) {
    return {
      downloaded: 0,
      skipped: skippedExisting.length,
      message: manual ? 'All reports are already saved on this computer.' : 'No new reports.'
    };
  }

  if (listResult.api === 'machine') {
    throw new Error(
      'The machine does not yet support downloading report PDFs over the network. '
      + 'Add GET /api/desktop/v1/reports/<id>/pdf on the Pi server.'
    );
  }

  let saved = 0;
  const errors = [];

  for (const report of pending) {
    const id = String(report.id ?? report.report_id);
    const pdfResult = await client.request(reportPdfEndpoint(id), {
      query: { purpose: 'sync' },
      responseType: 'arrayBuffer',
      timeoutMs: 120000
    });

    if (!pdfResult.ok) {
      errors.push(`Report ${id}: ${pdfResult.error || 'download failed'}`);
      continue;
    }

    if (!Buffer.isBuffer(pdfResult.data) || pdfResult.data.length < 5 || pdfResult.data.subarray(0, 4).toString('utf8') !== '%PDF') {
      errors.push(`Report ${id}: machine did not return a PDF file`);
      continue;
    }

    const filePath = path.join(reportsDir, `report-${id}.pdf`);
    await fs.writeFile(filePath, pdfResult.data);
    await syncStore.markReportDownloaded(deviceId, id);
    saved += 1;
  }

  if (!saved && errors.length) {
    throw new Error(
      errors.length > 3
        ? `${errors.length} reports failed PDF download (e.g. ${errors[0]}). Check the machine logs.`
        : errors.join(' ')
    );
  }

  return {
    downloaded: saved,
    skipped: skippedExisting.length,
    errors,
    message: saved
      ? `Saved ${saved} new report${saved === 1 ? '' : 's'} to ${reportsDir}.`
      : (errors.length
        ? errors.join(' ')
        : (manual ? 'All reports are already saved on this computer.' : 'No new reports.'))
  };
}

async function syncAudit(client, device, syncStore, { manual = false } = {}) {
  const deviceId = device.id;
  const state = await syncStore.getDeviceState(deviceId);
  const query = {};

  if (state.lastAuditTimestampMs) {
    query.from = String(state.lastAuditTimestampMs);
  }

  const listResult = await requestWithFallback(
    client,
    DESKTOP_API.AUDIT,
    MACHINE_API.AUDIT_LOG,
    { query }
  );

  if (!listResult.ok) {
    throw new Error(listResult.error || 'Unable to load audit trails from the machine.');
  }

  const entries = asAuditEntries(listResult.data);
  const newEntries = entries.filter((entry) => entryTimestampMs(entry) > (state.lastAuditTimestampMs || 0));

  if (!newEntries.length) {
    return {
      downloaded: 0,
      message: manual ? 'No new audit entries since the last save.' : 'No new audit trails.'
    };
  }

  if (listResult.api === 'machine') {
    throw new Error(
      'The machine does not yet support downloading audit PDFs over the network. '
      + 'Add POST /api/desktop/v1/audit/download on the Pi server (render from DB).'
    );
  }

  const downloadResult = await client.request(DESKTOP_API.AUDIT_DOWNLOAD, {
    method: 'POST',
    body: { filters: query },
    responseType: 'arrayBuffer',
    timeoutMs: 180000
  });

  if (!downloadResult.ok) {
    throw new Error(downloadResult.error || 'Audit PDF download failed.');
  }

  await ensureDeviceSubdirs(device);
  const auditDir = deviceAuditDir(device);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(auditDir, `audit-${stamp}.pdf`);
  await fs.writeFile(filePath, downloadResult.data);

  const maxTs = Math.max(...newEntries.map(entryTimestampMs), state.lastAuditTimestampMs || 0);
  await syncStore.setLastAuditTimestamp(deviceId, maxTs);

  return {
    downloaded: 1,
    entries: newEntries.length,
    filePath,
    message: `Saved audit PDF (${newEntries.length} new entries) to ${filePath}.`
  };
}

async function runDeviceSync({ client, device, syncStore, mode = 'all' }) {
  if (!device || !device.savePath) {
    throw new Error('Choose a save folder for this machine before downloading files.');
  }

  await fs.mkdir(device.savePath, { recursive: true });
  await ensureDeviceSubdirs(device);
  const result = {
    ok: true,
    reports: null,
    audit: null,
    saveRoot: deviceSaveRoot(device)
  };

  if (mode === 'all' || mode === 'reports') {
    try {
      result.reports = await syncReports(client, device, syncStore, {
        manual: mode === 'reports'
      });
    } catch (error) {
      result.ok = false;
      result.reports = {
        downloaded: 0,
        skipped: 0,
        errors: [error.message || String(error)],
        message: error.message || String(error)
      };
      if (mode === 'reports') {
        throw error;
      }
    }
  }

  if (mode === 'all' || mode === 'audit') {
    result.audit = await syncAudit(client, device, syncStore, {
      manual: mode === 'audit'
    });
  }

  await syncStore.touchSync(device.id);
  return result;
}

module.exports = {
  runDeviceSync,
  syncReports,
  syncAudit,
  requestWithFallback,
  asReports,
  asAuditEntries
};
