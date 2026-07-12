(function initDashboard() {
  const statusEl = document.querySelector('#dashboard-status');
  const titleEl = document.querySelector('#dashboard-title');
  const activeDeviceBadge = document.querySelector('#active-device-badge');
  const savePathDisplay = document.querySelector('#save-path-display');
  const syncStateSummary = document.querySelector('#sync-state-summary');
  const autoBackupStatus = document.querySelector('#auto-backup-status');
  const syncOverlay = document.querySelector('#sync-progress-overlay');
  const syncProgressBar = document.querySelector('#sync-progress-bar');
  const syncProgressPercent = document.querySelector('#sync-progress-percent');
  const syncProgressDetail = document.querySelector('#sync-progress-detail');
  const weeklyDayWrap = document.querySelector('#weekly-day-wrap');
  const monthlyDayWrap = document.querySelector('#monthly-day-wrap');

  const reportsTableBody = document.querySelector('#reports-table-body');
  const reportsSelectAll = document.querySelector('#reports-select-all');
  const reportsExportSelectedBtn = document.querySelector('#reports-export-selected-btn');
  const reportsExportZipBtn = document.querySelector('#reports-export-zip-btn');
  const auditTableBody = document.querySelector('#audit-table-body');

  const reportPreviewModal = document.querySelector('#report-preview-modal');
  const reportPreviewFrame = document.querySelector('#report-preview-frame');
  const reportPreviewTitle = document.querySelector('#report-preview-title');
  const reportPreviewSubtitle = document.querySelector('#report-preview-subtitle');

  const auditPreviewModal = document.querySelector('#audit-preview-modal');
  const auditPreviewBody = document.querySelector('#audit-preview-body');
  const auditPreviewTitle = document.querySelector('#audit-preview-title');
  const auditPreviewSubtitle = document.querySelector('#audit-preview-subtitle');

  let syncProgressTimer = null;
  let selectedDevice = null;
  let reportsCache = [];
  let selectedReportIds = new Set();
  let previewReportId = null;
  let previewBlobUrl = null;
  let auditCache = [];
  let currentUser = null;
  let recipeEmbedUrl = null;

  window.DashboardNotify = setStatus;

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = `toast${type ? ` ${type}` : ''}`;
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function readCachedUser(device) {
    if (!device || !device.id) return null;
    try {
      const raw = sessionStorage.getItem(`rle-user-${device.id}`);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function storeUser(device, user) {
    if (!device || !device.id || !user) return;
    try {
      sessionStorage.setItem(`rle-user-${device.id}`, JSON.stringify(user));
    } catch (_e) { /* ignore */ }
  }

  function clearStoredUser(device) {
    if (!device || !device.id) return;
    try {
      sessionStorage.removeItem(`rle-user-${device.id}`);
    } catch (_e) { /* ignore */ }
  }

  function redirectToLogin(message) {
    if (selectedDevice) clearStoredUser(selectedDevice);
    currentUser = null;
    recipeEmbedUrl = null;
    if (message) {
      try {
        sessionStorage.setItem('rle-login-status', message);
      } catch (_e) { /* ignore */ }
    }
    window.location.href = './login.html';
  }

  async function refreshCurrentUser() {
    const me = await window.apiBridge.auth.me();
    if (me.ok && me.data && me.data.user) {
      currentUser = me.data.user;
      if (selectedDevice) storeUser(selectedDevice, currentUser);
      return currentUser;
    }
    if (me && me.status === 401) {
      redirectToLogin('Session expired after the machine restart. Please sign in again.');
      return null;
    }
    if (selectedDevice) {
      currentUser = readCachedUser(selectedDevice);
    }
    return currentUser;
  }

  function applyPermissionUi() {
    const perms = window.RLEPermissions;
    if (!perms) return;

    const navReports = document.querySelector('#nav-reports');
    const navAudit = document.querySelector('#nav-audit');
    const navProfiles = document.querySelector('#nav-profiles');
    const navRecipes = document.querySelector('#nav-recipes');
    const reportsDenied = document.querySelector('#reports-denied');
    const reportsContent = document.querySelector('#reports-content');
    const auditDenied = document.querySelector('#audit-denied');
    const auditContent = document.querySelector('#audit-content');
    const syncBtn = document.querySelector('#sync-all-btn');

    const canReports = perms.canViewReports(currentUser);
    const canAudit = perms.canViewAudit(currentUser);
    const canProfiles = perms.canManageProfiles(currentUser) || perms.canAddUsers(currentUser);
    const canRecipes = perms.canManageRecipes(currentUser);

    if (navReports) navReports.classList.toggle('hidden', !canReports);
    if (navAudit) navAudit.classList.toggle('hidden', !canAudit);
    if (navProfiles) navProfiles.classList.toggle('hidden', !canProfiles);
    if (navRecipes) navRecipes.classList.toggle('hidden', !canRecipes);

    if (reportsDenied) reportsDenied.classList.toggle('hidden', canReports);
    if (reportsContent) reportsContent.classList.toggle('hidden', !canReports);
    if (auditDenied) auditDenied.classList.toggle('hidden', canAudit);
    if (auditContent) auditContent.classList.toggle('hidden', !canAudit);

    if (syncBtn) {
      syncBtn.disabled = !perms.canSyncData(currentUser);
      syncBtn.title = perms.canSyncData(currentUser)
        ? ''
        : 'You need report or audit view permission to sync.';
    }

    if (document.querySelector('#profiles-add-btn')) {
      document.querySelector('#profiles-add-btn').hidden = !perms.canAddUsers(currentUser);
    }
  }

  async function loadRecipeEmbed({ force = false } = {}) {
    const webview = document.querySelector('#recipes-webview');
    const statusEl = document.querySelector('#recipes-embed-status');
    if (!webview || !window.RLEPermissions.canManageRecipes(currentUser)) return;

    if (!force && recipeEmbedUrl && webview.getAttribute('src')) return;

    if (statusEl) statusEl.textContent = 'Requesting secure embed session…';
    const result = await window.apiBridge.embed.getRecipeUrl();
    if (!result.ok || !result.data || !result.data.url) {
      const isExpired = result && result.status === 401;
      if (statusEl) {
        statusEl.textContent = isExpired
          ? 'Session expired. Please sign out and sign in again.'
          : (result.error || 'Could not load recipe UI.');
      }
      if (isExpired) {
        redirectToLogin('Session expired after the machine restart. Please sign in again.');
      }
      return;
    }

    recipeEmbedUrl = result.data.url;
    if (statusEl) statusEl.textContent = 'Connected to machine recipe editor.';
    webview.setAttribute('src', recipeEmbedUrl);
  }

  async function selectTab(tabName) {
    await refreshCurrentUser();
    if (!currentUser) {
      return;
    }
    applyPermissionUi();
    if (tabName === 'reports' && !window.RLEPermissions.canViewReports(currentUser)) {
      setStatus('You do not have permission to view reports.', 'error');
      return;
    }
    if (tabName === 'audit' && !window.RLEPermissions.canViewAudit(currentUser)) {
      setStatus('You do not have permission to view audit trails.', 'error');
      return;
    }
    if (tabName === 'profiles' && !window.RLEPermissions.canManageProfiles(currentUser)
      && !window.RLEPermissions.canAddUsers(currentUser)) {
      setStatus('You do not have permission to manage profiles.', 'error');
      return;
    }
    if (tabName === 'recipes' && !window.RLEPermissions.canManageRecipes(currentUser)) {
      setStatus('You do not have permission to manage recipes.', 'error');
      return;
    }

    document.querySelectorAll('[data-tab]').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
    const labels = {
      home: 'Overview',
      reports: 'Reports',
      audit: 'Audit Trails',
      profiles: 'Profiles',
      recipes: 'Recipes',
      settings: 'Settings'
    };
    if (titleEl) titleEl.textContent = labels[tabName] || tabName;

    if (tabName === 'reports') loadReports();
    if (tabName === 'audit') loadAuditEntries();
    if (tabName === 'profiles' && window.ProfilesModule) window.ProfilesModule.refresh();
    if (tabName === 'recipes') loadRecipeEmbed();
  }

  function updateFrequencyFields() {
    const frequency = document.querySelector('#auto-backup-frequency')?.value || 'daily';
    const showWeekly = frequency === 'weekly';
    const showMonthly = frequency === 'monthly';
    if (weeklyDayWrap) {
      weeklyDayWrap.hidden = !showWeekly;
      weeklyDayWrap.style.display = showWeekly ? '' : 'none';
    }
    if (monthlyDayWrap) {
      monthlyDayWrap.hidden = !showMonthly;
      monthlyDayWrap.style.display = showMonthly ? '' : 'none';
    }
  }

  function reportDisplayName(report, index) {
    let name = report.name;
    if (!name && report.type === 'validation') {
      name = `Validation - ${report.validationSubtype === 'load' ? 'USP 2' : 'USP 1'}`;
    }
    if (!name) {
      name = (report.recipe && report.recipe.productName) || `Report ${report.id || index + 1}`;
    }
    return name;
  }

  function formatDateTime(value) {
    if (!value) return '--';
    const text = String(value);
    if (text.length > 10 && text.includes('T')) {
      return `${text.slice(0, 10)} ${text.slice(11, 19)}`;
    }
    return text;
  }

  function formatAuditTimestamp(entry) {
    if (entry.dateTime) return entry.dateTime;
    const ts = Number(entry.timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return '--';
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms).toLocaleString();
  }

  function dateToTimestampMs(dateValue, endOfDay) {
    if (!dateValue) return undefined;
    const parts = dateValue.split('-').map((part) => Number(part));
    if (parts.length !== 3) return undefined;
    const date = endOfDay
      ? new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999)
      : new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    return date.getTime();
  }

  function getAuditFilters() {
    const filters = {};
    const user = document.querySelector('#audit-filter-user').value.trim();
    const role = document.querySelector('#audit-filter-role').value.trim();
    const action = document.querySelector('#audit-filter-action').value.trim();
    const from = dateToTimestampMs(document.querySelector('#audit-filter-from').value, false);
    const to = dateToTimestampMs(document.querySelector('#audit-filter-to').value, true);

    if (user) filters.user = user;
    if (role) filters.role = role;
    if (action) filters.action = action;
    if (from) filters.from = from;
    if (to) filters.to = to;
    return filters;
  }

  function updateReportSelectionUi() {
    const count = selectedReportIds.size;
    reportsExportSelectedBtn.disabled = count === 0;
    reportsExportZipBtn.disabled = count === 0;
    if (reportsSelectAll) {
      reportsSelectAll.checked = reportsCache.length > 0 && count === reportsCache.length;
      reportsSelectAll.indeterminate = count > 0 && count < reportsCache.length;
    }
  }

  function revokePreviewBlob() {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }
    if (reportPreviewFrame) {
      reportPreviewFrame.removeAttribute('src');
    }
  }

  function deviceFolderLabel(device) {
    if (!device || !device.savePath) return 'Not set';
    const name = (device.nickname || device.name || 'machine').trim();
    return `${device.savePath}\\${name}`;
  }

  function updateSavePathUi(device) {
    const pathEl = savePathDisplay;
    const hintEl = document.querySelector('#save-path-hint');
    const nickname = (device && (device.nickname || device.name)) || 'machine';

    if (pathEl) {
      if (device && device.savePath) {
        pathEl.textContent = deviceFolderLabel(device);
        pathEl.className = 'folder-chip selected';
      } else {
        pathEl.textContent = 'Not set — click Change to choose a folder';
        pathEl.className = 'folder-chip empty';
      }
    }

    if (hintEl) {
      hintEl.innerHTML = device && device.savePath
        ? `Reports → <strong>${escapeHtml(nickname)}/reports</strong> · Audit → <strong>${escapeHtml(nickname)}/audit</strong>`
        : 'Choose a folder first. Each machine saves into its own subfolder.';
    }
  }

  async function loadSelectedDevice() {
    const result = await window.apiBridge.devices.getSelected();

    if (!activeDeviceBadge) return null;

    if (!result.ok || !result.data) {
      activeDeviceBadge.textContent = 'No machine selected';
      activeDeviceBadge.className = 'badge warning';
      selectedDevice = null;
      return null;
    }

    selectedDevice = result.data;
    activeDeviceBadge.textContent = selectedDevice.nickname || selectedDevice.name;
    activeDeviceBadge.className = 'badge success';
    updateSavePathUi(selectedDevice);
    const statMachine = document.querySelector('#stat-machine');
    if (statMachine) statMachine.textContent = selectedDevice.nickname || selectedDevice.name;
    currentUser = readCachedUser(selectedDevice);
    return selectedDevice;
  }

  async function loadSyncState() {
    const result = await window.apiBridge.sync.getState();

    if (!syncStateSummary) return;

    if (!result.ok) {
      syncStateSummary.textContent = result.error || 'Unable to load sync state.';
      syncStateSummary.className = 'status error';
      return;
    }

    const data = result.data || {};
    const reportCount = Array.isArray(data.downloadedReportIds) ? data.downloadedReportIds.length : 0;
    const auditTs = data.lastAuditTimestampMs
      ? new Date(Number(data.lastAuditTimestampMs)).toLocaleString()
      : 'never';
    const lastSync = data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : 'never';

    const statReports = document.querySelector('#stat-reports');
    const statLastSync = document.querySelector('#stat-last-sync');
    if (statReports) statReports.textContent = String(reportCount);
    if (statLastSync) statLastSync.textContent = lastSync;

    if (syncStateSummary) {
      syncStateSummary.textContent = `Last audit checkpoint: ${auditTs}`;
    }
  }

  async function loadSchedule() {
    const result = await window.apiBridge.sync.getSchedule();

    if (!autoBackupStatus) return;

    if (!result.ok) {
      autoBackupStatus.textContent = result.error || 'Unable to load auto backup settings.';
      autoBackupStatus.className = 'status error';
      return;
    }

    const schedule = result.data || {};
    document.querySelector('#auto-backup-enabled').checked = Boolean(schedule.enabled);
    document.querySelector('#auto-backup-frequency').value = schedule.frequency || 'daily';
    document.querySelector('#auto-backup-time').value = schedule.time || '09:00';
    document.querySelector('#auto-backup-day-of-week').value = String(schedule.dayOfWeek ?? 1);
    document.querySelector('#auto-backup-day-of-month').value = String(schedule.dayOfMonth ?? 1);
    updateFrequencyFields();

    autoBackupStatus.textContent = schedule.enabled
      ? `On — ${schedule.frequency} at ${schedule.time}`
      : 'Off';
    autoBackupStatus.className = 'toast success';
  }

  async function ensureSavePath(device, { forcePick = false } = {}) {
    if (!forcePick && device && device.savePath) {
      return device.savePath;
    }

    try {
      setStatus('Opening folder picker...');
      const picked = await window.apiBridge.folder.pick({
        title: 'Choose folder to save reports and audit files',
        defaultPath: device && device.savePath ? device.savePath : undefined
      });

      if (!picked.ok) {
        setStatus(picked.error || 'A save folder is required.', 'error');
        return null;
      }

      const saveResult = await window.apiBridge.devices.save({
        ...device,
        savePath: picked.data.path
      });

      if (!saveResult.ok) {
        setStatus(saveResult.error || 'Unable to save folder path.', 'error');
        return null;
      }

      selectedDevice = saveResult.data;
      updateSavePathUi(selectedDevice);
      setStatus('Save folder updated.', 'success');
      return picked.data.path;
    } catch (error) {
      setStatus(error.message || 'Could not open folder picker.', 'error');
      return null;
    }
  }

  function setSyncProgress(percent, detail) {
    const safePercent = Math.max(0, Math.min(100, percent));
    syncProgressBar.style.width = `${safePercent}%`;
    syncProgressPercent.textContent = `${Math.round(safePercent)}%`;
    syncProgressDetail.textContent = detail;
  }

  function summarizeSyncResult(result) {
    if (!result || !result.ok || !result.data) {
      return result && result.error ? result.error : 'Sync failed.';
    }

    const parts = [];
    if (result.data.reports && result.data.reports.message) {
      parts.push(result.data.reports.message);
    }
    if (result.data.audit && result.data.audit.message) {
      parts.push(result.data.audit.message);
    }
    return parts.join(' ') || 'Sync completed.';
  }

  function confirmSync() {
    return new Promise((resolve) => {
      const modal = document.querySelector('#sync-confirm-modal');
      const messageEl = document.querySelector('#sync-confirm-message');
      const okBtn = document.querySelector('#sync-confirm-ok');
      const cancelBtn = document.querySelector('#sync-confirm-cancel');

      if (!modal || !okBtn || !cancelBtn) {
        resolve(true);
        return;
      }

      const nickname = selectedDevice
        ? (selectedDevice.nickname || selectedDevice.name || 'machine')
        : 'this machine';

      if (messageEl) {
        messageEl.textContent = `Syncing will download all new reports and audit trails to ${nickname}/reports and ${nickname}/audit on your computer.`;
      }

      function finish(confirmed) {
        modal.classList.remove('active');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(confirmed);
      }

      function onOk() { finish(true); }
      function onCancel() { finish(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.classList.add('active');
    });
  }

  async function runSync(mode) {
    const device = await loadSelectedDevice();
    if (!device) {
      setStatus('Select a machine first.', 'error');
      return;
    }

    if (!(await ensureSavePath(device))) {
      return;
    }

    syncOverlay.classList.add('active');
    await window.apiBridge.sync.setBusy(true);
    setSyncProgress(10, mode === 'reports' ? 'Checking for new reports...' : mode === 'audit' ? 'Checking for new audit trails...' : 'Checking for new files...');

    clearInterval(syncProgressTimer);
    syncProgressTimer = setInterval(() => {
      const current = parseFloat(syncProgressBar.style.width) || 10;
      if (current < 85) {
        setSyncProgress(current + 6, 'Copying files from the machine...');
      }
    }, 700);

    try {
      const result = await window.apiBridge.sync.run({ mode });
      clearInterval(syncProgressTimer);
      setSyncProgress(100, summarizeSyncResult(result));
      setStatus(summarizeSyncResult(result), result.ok ? 'success' : 'error');
      loadSyncState();
    } finally {
      clearInterval(syncProgressTimer);
      await window.apiBridge.sync.setBusy(false);
      setTimeout(() => syncOverlay.classList.remove('active'), 900);
    }
  }

  function renderReportsTable(reports) {
    reportsCache = reports || [];
    selectedReportIds = new Set([...selectedReportIds].filter((id) => reportsCache.some((report) => String(report.id) === String(id))));

    if (!reportsCache.length) {
      reportsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No reports found.</td></tr>';
      updateReportSelectionUi();
      return;
    }

    reportsTableBody.innerHTML = reportsCache.map((report, index) => {
      const id = String(report.id);
      const checked = selectedReportIds.has(id) ? 'checked' : '';
      const status = report.status || report.approvalStatus || '--';
      return `
        <tr data-report-id="${escapeHtml(id)}">
          <td class="col-check"><input type="checkbox" class="report-select" data-report-id="${escapeHtml(id)}" ${checked} aria-label="Select report ${escapeHtml(id)}"></td>
          <td>${index + 1}</td>
          <td>${escapeHtml(reportDisplayName(report, index))}</td>
          <td>${escapeHtml(report.type || '--')}</td>
          <td>${escapeHtml(formatDateTime(report.createdAt || report.completedAt))}</td>
          <td>${escapeHtml(status)}</td>
        <td class="col-actions">
          <button type="button" class="secondary report-preview-btn" data-report-id="${escapeHtml(id)}">Preview</button>
          <button type="button" class="report-export-btn" data-report-id="${escapeHtml(id)}">Download</button>
        </td>
      </tr>
    `;
    }).join('');

    updateReportSelectionUi();
  }

  async function loadReports() {
    if (!reportsTableBody) return;
    if (!window.RLEPermissions.canViewReports(currentUser)) {
      reportsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Permission denied.</td></tr>';
      return;
    }
    reportsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading reports...</td></tr>';
    setStatus('Loading reports from machine...');

    const filterType = document.querySelector('#reports-filter-type').value || 'all';
    const result = await window.apiBridge.reports.list({ type: filterType });

    if (!result.ok) {
      reportsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(result.error || 'Unable to load reports.')}</td></tr>`;
      setStatus(result.error || 'Unable to load reports.', 'error');
      return;
    }

    const reports = (result.data && result.data.reports) || result.data || [];
    renderReportsTable(Array.isArray(reports) ? reports : []);
    setStatus(`Loaded ${reportsCache.length} report${reportsCache.length === 1 ? '' : 's'}.`, 'success');
  }

  function renderAuditTable(entries) {
    auditCache = entries || [];

    if (!auditCache.length) {
      auditTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No audit entries match the filters.</td></tr>';
      return;
    }

    auditTableBody.innerHTML = auditCache.map((entry) => `
      <tr data-audit-id="${escapeHtml(entry.id)}">
        <td>${escapeHtml(formatAuditTimestamp(entry))}</td>
        <td>${escapeHtml(entry.user || '--')}</td>
        <td>${escapeHtml(entry.role || '--')}</td>
        <td>${escapeHtml(entry.action || '--')}</td>
        <td>${escapeHtml(entry.details || '--')}</td>
        <td class="col-actions">
          <button type="button" class="secondary audit-preview-btn" data-audit-id="${escapeHtml(entry.id)}">View</button>
        </td>
      </tr>
    `).join('');
  }

  async function loadAuditEntries() {
    if (!auditTableBody) return;
    if (!window.RLEPermissions.canViewAudit(currentUser)) {
      auditTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Permission denied.</td></tr>';
      return;
    }
    auditTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading audit trails...</td></tr>';
    setStatus('Loading audit trails from machine...');

    const result = await window.apiBridge.audit.list(getAuditFilters());

    if (!result.ok) {
      auditTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(result.error || 'Unable to load audit trails.')}</td></tr>`;
      setStatus(result.error || 'Unable to load audit trails.', 'error');
      return;
    }

    const entries = (result.data && result.data.entries) || result.data || [];
    renderAuditTable(Array.isArray(entries) ? entries : []);
    setStatus(`Loaded ${auditCache.length} audit entr${auditCache.length === 1 ? 'y' : 'ies'}.`, 'success');
  }

  async function openReportPreview(reportId) {
    const report = reportsCache.find((item) => String(item.id) === String(reportId));
    previewReportId = reportId;
    reportPreviewTitle.textContent = report ? reportDisplayName(report, 0) : `Report ${reportId}`;
    reportPreviewSubtitle.textContent = report ? `ID ${report.id} · ${report.type || 'report'}` : '';
    reportPreviewModal.classList.add('active');
    revokePreviewBlob();
    reportPreviewFrame.src = 'about:blank';

    setStatus('Loading report preview...');
    const result = await window.apiBridge.reports.getPdf(reportId);

    if (!result.ok || !result.data || !result.data.base64) {
      setStatus(result.error || 'Unable to load report preview.', 'error');
      reportPreviewModal.classList.remove('active');
      return;
    }

    const bytes = Uint8Array.from(atob(result.data.base64), (char) => char.charCodeAt(0));
    if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF') {
      setStatus('The machine returned an invalid report PDF.', 'error');
      reportPreviewModal.classList.remove('active');
      return;
    }

    const blob = new Blob([bytes], { type: 'application/pdf' });
    previewBlobUrl = URL.createObjectURL(blob);
    reportPreviewFrame.src = previewBlobUrl;
    setStatus('Report preview ready.', 'success');
  }

  function closeReportPreview() {
    reportPreviewModal.classList.remove('active');
    previewReportId = null;
    revokePreviewBlob();
  }

  function showAuditPreview(entryId) {
    const entry = auditCache.find((item) => String(item.id) === String(entryId));
    if (!entry) return;

    auditPreviewTitle.textContent = entry.action || 'Audit Entry';
    auditPreviewSubtitle.textContent = `${formatAuditTimestamp(entry)} · ${entry.user || '--'}`;
    auditPreviewBody.innerHTML = `
      <table>
        <tbody>
          <tr><th>Date &amp; Time</th><td>${escapeHtml(formatAuditTimestamp(entry))}</td></tr>
          <tr><th>User</th><td>${escapeHtml(entry.user || '--')}</td></tr>
          <tr><th>Role</th><td>${escapeHtml(entry.role || '--')}</td></tr>
          <tr><th>Action</th><td>${escapeHtml(entry.action || '--')}</td></tr>
          <tr><th>Details</th><td>${escapeHtml(entry.details || '--')}</td></tr>
          <tr><th>Outcome</th><td>${escapeHtml(entry.outcome || '--')}</td></tr>
          <tr><th>Entity</th><td>${escapeHtml(entry.entityName || entry.entityType || '--')}</td></tr>
        </tbody>
      </table>
    `;
    auditPreviewModal.classList.add('active');
  }

  async function exportReportPdf(reportId, { toFolder = false } = {}) {
    if (!window.RLEPermissions.canDownloadReports(currentUser)) {
      setStatus('You do not have permission to download reports.', 'error');
      return;
    }
    if (toFolder) {
      const device = await loadSelectedDevice();
      if (!device) return;
      if (!(await ensureSavePath(device))) return;
      const result = await window.apiBridge.reports.savePdf({ reportId });
      setStatus(window.apiBridge.messageFromResult(result, 'Report saved to folder.'), result.ok ? 'success' : 'error');
      return;
    }

    const result = await window.apiBridge.reports.downloadPdf(reportId);
    setStatus(window.apiBridge.messageFromResult(result, 'Report downloaded.'), result.ok ? 'success' : 'error');
  }

  async function exportSelectedReports({ asZip = false } = {}) {
    if (!window.RLEPermissions.canDownloadReports(currentUser)) {
      setStatus('You do not have permission to download reports.', 'error');
      return;
    }
    const ids = [...selectedReportIds];
    if (!ids.length) {
      setStatus('Select at least one report.', 'error');
      return;
    }

    if (asZip) {
      const result = await window.apiBridge.reports.downloadZip({ report_ids: ids.map((id) => Number(id)) });
      setStatus(window.apiBridge.messageFromResult(result, 'Reports downloaded as ZIP.'), result.ok ? 'success' : 'error');
      return;
    }

    setStatus(`Downloading ${ids.length} report${ids.length === 1 ? '' : 's'}...`);
    let saved = 0;
    for (const reportId of ids) {
      const result = await window.apiBridge.reports.downloadPdf(reportId);
      if (result.ok) saved += 1;
    }
    setStatus(saved ? `Downloaded ${saved} report${saved === 1 ? '' : 's'}.` : 'Download failed.', saved ? 'success' : 'error');
  }

  async function exportAuditPdf() {
    if (!window.RLEPermissions.canViewAudit(currentUser)) {
      setStatus('You do not have permission to export audit trails.', 'error');
      return;
    }
    const filters = getAuditFilters();
    const result = await window.apiBridge.audit.download({ filters });
    setStatus(window.apiBridge.messageFromResult(result, 'Audit PDF exported.'), result.ok ? 'success' : 'error');
  }

  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      selectTab(el.dataset.tab);
    });
  });

  document.querySelector('#auto-backup-frequency').addEventListener('change', updateFrequencyFields);

  document.querySelector('#auto-backup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const enabled = document.querySelector('#auto-backup-enabled').checked;
    const result = await window.apiBridge.sync.setSchedule({
      enabled,
      frequency: document.querySelector('#auto-backup-frequency').value,
      time: document.querySelector('#auto-backup-time').value,
      dayOfWeek: Number(document.querySelector('#auto-backup-day-of-week').value),
      dayOfMonth: Number(document.querySelector('#auto-backup-day-of-month').value)
    });
    setStatus(window.apiBridge.messageFromResult(result, 'Auto backup settings saved.'), result.ok ? 'success' : 'error');
    loadSchedule();
  });

  document.querySelector('#sync-all-btn').addEventListener('click', async () => {
    const device = await loadSelectedDevice();
    if (!device) {
      setStatus('Select a machine first.', 'error');
      return;
    }
    if (!(await ensureSavePath(device))) return;
    const confirmed = await confirmSync();
    if (confirmed) runSync('all');
  });

  document.querySelector('#change-save-folder-btn').addEventListener('click', async () => {
    const device = await loadSelectedDevice();
    if (!device) return;
    await ensureSavePath(device, { forcePick: true });
  });

  document.querySelector('#health-check-btn').addEventListener('click', async () => {
    const result = await window.apiBridge.devices.health();
    setStatus(window.apiBridge.messageFromResult(result, 'Machine is online.'), result.ok ? 'success' : 'error');
  });

  document.querySelector('#switch-device-btn').addEventListener('click', () => {
    window.location.href = './index.html';
  });

  document.querySelector('#logout-btn').addEventListener('click', async () => {
    const result = await window.apiBridge.auth.logout();
    if (!result.ok) {
      setStatus(result.error || 'Logout failed.', 'error');
      return;
    }
    if (selectedDevice && selectedDevice.id) {
      try { sessionStorage.removeItem(`rle-user-${selectedDevice.id}`); } catch (_e) { /* ignore */ }
    }
    window.location.href = './index.html';
  });

  document.querySelector('#reports-refresh-btn').addEventListener('click', loadReports);
  document.querySelector('#reports-apply-filter-btn').addEventListener('click', loadReports);
  document.querySelector('#reports-export-selected-btn').addEventListener('click', () => exportSelectedReports({ asZip: false }));
  document.querySelector('#reports-export-zip-btn').addEventListener('click', () => exportSelectedReports({ asZip: true }));

  reportsSelectAll.addEventListener('change', () => {
    if (reportsSelectAll.checked) {
      reportsCache.forEach((report) => selectedReportIds.add(String(report.id)));
    } else {
      selectedReportIds.clear();
    }
    reportsTableBody.querySelectorAll('.report-select').forEach((input) => {
      input.checked = reportsSelectAll.checked;
    });
    updateReportSelectionUi();
  });

  reportsTableBody.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.report-select');
    if (!checkbox) return;
    const reportId = checkbox.dataset.reportId;
    if (checkbox.checked) {
      selectedReportIds.add(reportId);
    } else {
      selectedReportIds.delete(reportId);
    }
    updateReportSelectionUi();
  });

  reportsTableBody.addEventListener('click', (event) => {
    const previewBtn = event.target.closest('.report-preview-btn');
    if (previewBtn) {
      openReportPreview(previewBtn.dataset.reportId);
      return;
    }
    const exportBtn = event.target.closest('.report-export-btn');
    if (exportBtn) {
      exportReportPdf(exportBtn.dataset.reportId);
    }
  });

  document.querySelector('#report-preview-close-btn').addEventListener('click', closeReportPreview);
  document.querySelector('#report-preview-export-btn').addEventListener('click', () => {
    if (previewReportId) exportReportPdf(previewReportId);
  });
  document.querySelector('#report-preview-save-folder-btn').addEventListener('click', () => {
    if (previewReportId) exportReportPdf(previewReportId, { toFolder: true });
  });

  document.querySelector('#audit-refresh-btn').addEventListener('click', loadAuditEntries);
  document.querySelector('#audit-apply-filter-btn').addEventListener('click', loadAuditEntries);
  document.querySelector('#audit-export-btn').addEventListener('click', exportAuditPdf);

  auditTableBody.addEventListener('click', (event) => {
    const previewBtn = event.target.closest('.audit-preview-btn');
    if (previewBtn) {
      showAuditPreview(previewBtn.dataset.auditId);
    }
  });

  document.querySelector('#audit-preview-close-btn').addEventListener('click', () => {
    auditPreviewModal.classList.remove('active');
  });

  document.querySelector('#recipes-refresh-btn')?.addEventListener('click', () => {
    recipeEmbedUrl = null;
    const webview = document.querySelector('#recipes-webview');
    if (webview) webview.removeAttribute('src');
    loadRecipeEmbed({ force: true });
  });

  const recipesWebview = document.querySelector('#recipes-webview');
  if (recipesWebview) {
    recipesWebview.addEventListener('did-fail-load', () => {
      const statusEl = document.querySelector('#recipes-embed-status');
      if (statusEl) statusEl.textContent = 'Recipe UI failed to load. Try Refresh.';
    });
  }

  window.apiBridge.sync.onCloseBlocked((payload) => {
    syncOverlay.classList.add('active');
    setSyncProgress(60, payload && payload.message ? payload.message : 'Auto backup in progress...');
  });

  window.apiBridge.sync.onScheduledStarted(() => {
    syncOverlay.classList.add('active');
    setSyncProgress(15, 'Scheduled auto backup started.');
  });

  window.apiBridge.sync.onScheduledFinished((result) => {
    setSyncProgress(100, summarizeSyncResult(result));
    setStatus(summarizeSyncResult(result), result && result.ok ? 'success' : 'error');
    setTimeout(() => {
      syncOverlay.classList.remove('active');
      loadSyncState();
      loadSchedule();
    }, 900);
  });

  loadSelectedDevice().then(async () => {
    await refreshCurrentUser();
    if (!currentUser) return;
    updateFrequencyFields();
    applyPermissionUi();
    if (window.ProfilesModule) await window.ProfilesModule.init(currentUser);
  });
  loadSyncState();
  loadSchedule();
})();
