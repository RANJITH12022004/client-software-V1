(function initDeviceManagement() {
  const statusEl = document.querySelector('#device-management-status') || document.querySelector('#devices-status');
  const listEl = document.querySelector('#device-list');
  const form = document.querySelector('#device-form');
  const addModal = document.querySelector('#add-device-modal');
  const addStatusEl = document.querySelector('#add-device-status');
  const errorPopup = document.querySelector('#connection-error-popup');
  const folderChip = document.querySelector('#folder-chip');

  let healthByDeviceId = {};
  let connectedDraft = null;
  let lastManagedDevices = [];

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = `toast${type ? ` ${type}` : ''}`;
  }

  function setAddStatus(message, type) {
    if (!addStatusEl) return;
    addStatusEl.textContent = message || '';
    addStatusEl.className = `toast${type ? ` ${type}` : ''}`;
  }

  function updateFolderChip(path) {
    if (!folderChip) return;
    if (path) {
      folderChip.textContent = path;
      folderChip.className = 'folder-chip selected';
    } else {
      folderChip.textContent = 'No folder selected';
      folderChip.className = 'folder-chip empty';
    }
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatIpDisplay(deviceOrValue) {
    const value = typeof deviceOrValue === 'string'
      ? deviceOrValue
      : (deviceOrValue && (deviceOrValue.ip || deviceOrValue.baseUrl)) || '';

    if (!value) return '';

    if (!/^https?:\/\//i.test(value)) {
      return value.split(':')[0];
    }

    try {
      return new URL(value).hostname;
    } catch {
      return value.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
    }
  }

  function normalizeIpInput(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        if (!url.port) url.port = '5000';
        return url.toString().replace(/\/$/, '');
      } catch {
        return trimmed;
      }
    }
    return `http://${trimmed}:5000`;
  }

  function deviceHealthEntry(deviceId) {
    return healthByDeviceId[deviceId] || { status: 'checking', online: false };
  }

  function healthLabel(entry) {
    if (entry.status === 'checking') return 'Checking';
    return entry.online ? 'Online' : 'Offline';
  }

  function healthClass(entry) {
    if (entry.status === 'checking') return 'checking';
    return entry.online ? 'online' : 'offline';
  }

  async function refreshHealthSnapshot() {
    const result = await window.apiBridge.devices.getHealthSnapshot();
    if (result.ok && result.data) {
      healthByDeviceId = result.data;
    }
  }

  function startHealthListener() {
    window.apiBridge.devices.onHealthUpdate((snapshot) => {
      healthByDeviceId = snapshot || {};
      if (listEl) renderDevices(lastManagedDevices);
    });
    window.apiBridge.devices.checkAll().catch(() => null);
  }

  function classifyHealthFailure(result) {
    if (!result) return 'Connection failed.';
    if (result.status === 0 && /timed out/i.test(result.error || '')) {
      return 'The machine did not respond. Check that it is powered on and on the network.';
    }
    if (result.status === 0) {
      return 'Could not reach this IP. Check the address and network connection.';
    }
    if (result.status && result.status !== 200) {
      return 'A device responded but it does not appear to be an RLE machine.';
    }
    return result.error || 'Connection failed.';
  }

  function showAddModal(isEdit) {
    if (!addModal) return;
    addModal.classList.add('active');
    document.querySelector('#nickname-fields').hidden = !isEdit;
    document.querySelector('#retry-device-btn').hidden = true;
    document.querySelector('#add-device-title').textContent = isEdit ? 'Edit Machine' : 'Add Machine';
    if (!isEdit) {
      setAddStatus('Enter the machine IP and test the connection.');
    }
  }

  function closeAddModal() {
    if (!addModal) return;
    addModal.classList.remove('active');
    if (form) form.reset();
    connectedDraft = null;
    updateFolderChip('');
    document.querySelector('#device-id').value = '';
  }

  function showConnectionError(message) {
    document.querySelector('#connection-error-message').textContent = message;
    errorPopup.hidden = false;
    errorPopup.classList.add('active');
  }

  function closeConnectionError() {
    errorPopup.hidden = true;
    errorPopup.classList.remove('active');
  }

  async function testUnsavedHealth() {
    const ip = document.querySelector('#device-ip').value;
    const baseUrl = normalizeIpInput(ip);

    if (!baseUrl) {
      setAddStatus('IP address is required.', 'error');
      return;
    }

    setAddStatus('Testing connection…');
    const healthResult = await window.apiBridge.devices.probeUrl({ ip, baseUrl });

    if (!healthResult.ok) {
      showConnectionError(classifyHealthFailure(healthResult));
      setAddStatus('Connection failed.', 'error');
      document.querySelector('#retry-device-btn').hidden = false;
      return;
    }

    connectedDraft = {
      ip,
      baseUrl: healthResult.data.baseUrl || baseUrl,
      clientId: document.querySelector('#device-client-id').value || undefined
    };
    document.querySelector('#device-base-url').value = connectedDraft.baseUrl;
    document.querySelector('#nickname-fields').hidden = false;
    document.querySelector('#device-nickname').focus();
    const probe = healthResult.data && healthResult.data.data ? healthResult.data.data : (healthResult.data || {});
    const appName = probe.app || '';
    const model = probe.model || '';
    const serial = probe.serial || '';
    const details = [appName, model && `Model ${model}`, serial && `S/N ${serial}`].filter(Boolean).join(' · ');
    setAddStatus(details ? `Connected (${details}). Add a nickname and choose a save folder.` : 'Connected. Add a nickname and choose a save folder.', 'success');
  }

  function renderDevices(devices) {
    if (!listEl) return;

    if (!devices.length) {
      listEl.innerHTML = `
        <div class="empty-block">
          <h3>No machines yet</h3>
          <p>Add your first machine by IP address to get started.</p>
          <button type="button" id="empty-add-btn">Add Machine</button>
        </div>`;
      document.querySelector('#empty-add-btn')?.addEventListener('click', () => showAddModal(false));
      return;
    }

    listEl.innerHTML = devices.map((device) => {
      const health = deviceHealthEntry(device.id);
      const productLine = [health.app, health.model && `Model ${health.model}`]
        .filter(Boolean)
        .join(' · ');
      return `
        <article class="machine-card" data-id="${escapeHtml(device.id)}">
          <div class="machine-card-top">
            <div>
              <div class="machine-name">${escapeHtml(device.nickname || device.name)}</div>
              <div class="machine-ip">${escapeHtml(formatIpDisplay(device))}</div>
              ${productLine ? `<div class="machine-product muted">${escapeHtml(productLine)}</div>` : ''}
            </div>
            <span class="status-dot ${healthClass(health)}">${healthLabel(health)}</span>
          </div>
          <div class="machine-actions">
            <button type="button" data-action="connect" data-id="${escapeHtml(device.id)}" ${health.online ? '' : 'disabled'}>Connect</button>
            <button type="button" class="secondary" data-action="edit" data-id="${escapeHtml(device.id)}">Edit</button>
            <button type="button" class="danger" data-action="remove" data-id="${escapeHtml(device.id)}">Remove</button>
          </div>
        </article>`;
    }).join('');
  }

  async function loadDevices() {
    if (!listEl) return;

    const devicesResult = await window.apiBridge.devices.list();
    if (!devicesResult.ok) {
      setStatus(devicesResult.error, 'error');
      return;
    }

    lastManagedDevices = devicesResult.data || [];
    await refreshHealthSnapshot();
    renderDevices(lastManagedDevices);
    window.apiBridge.devices.checkAll().catch(() => null);

    if (lastManagedDevices.length) {
      setStatus(`${lastManagedDevices.length} machine${lastManagedDevices.length === 1 ? '' : 's'} saved.`, 'success');
    } else {
      setStatus('');
    }
  }

  function resetForm() {
    if (!form) return;
    form.reset();
    document.querySelector('#device-id').value = '';
    updateFolderChip('');
  }

  async function pickSaveFolder(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    try {
      setAddStatus('Opening folder picker…');
      const current = document.querySelector('#device-save-path').value;
      const result = await window.apiBridge.folder.pick({
        title: 'Choose folder for reports and audit files',
        defaultPath: current || undefined
      });

      if (!result.ok) {
        setAddStatus(result.error || 'Folder not selected.', result.error && /cancel/i.test(result.error) ? '' : 'error');
        return null;
      }

      document.querySelector('#device-save-path').value = result.data.path;
      updateFolderChip(result.data.path);
      setAddStatus('Folder selected.', 'success');
      return result.data.path;
    } catch (error) {
      setAddStatus(error.message || 'Could not open folder picker.', 'error');
      return null;
    }
  }

  if (listEl) {
    document.querySelector('#add-device-option')?.addEventListener('click', () => showAddModal(false));
    document.querySelector('#refresh-managed-devices-btn')?.addEventListener('click', loadDevices);

    listEl.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const deviceId = button.dataset.id;
      const device = lastManagedDevices.find((item) => item.id === deviceId);

      if (action === 'connect') {
        const result = await window.apiBridge.devices.setSelected(deviceId);
        if (result.ok) window.location.href = './login.html';
        else setStatus(result.error || 'Could not select machine.', 'error');
        return;
      }

      if (action === 'edit' && device) {
        document.querySelector('#device-id').value = device.id;
        document.querySelector('#device-client-id').value = device.clientId || device.id;
        document.querySelector('#device-base-url').value = device.baseUrl;
        document.querySelector('#device-ip').value = formatIpDisplay(device);
        document.querySelector('#device-nickname').value = device.nickname || device.name;
        document.querySelector('#device-save-path').value = device.savePath || '';
        updateFolderChip(device.savePath || '');
        document.querySelector('#nickname-fields').hidden = false;
        connectedDraft = { ip: device.ip, baseUrl: device.baseUrl };
        showAddModal(true);
        setAddStatus('Update the IP if it changed, then Test Connection before saving.', '');
        return;
      }

      if (action === 'remove') {
        const result = await window.apiBridge.devices.remove(deviceId);
        if (result.ok) {
          lastManagedDevices = lastManagedDevices.filter((item) => item.id !== deviceId);
          renderDevices(lastManagedDevices);
          setStatus('Machine removed.', 'success');
        } else {
          setStatus(result.error || 'Remove failed.', 'error');
        }
      }
    });

    loadDevices();
    startHealthListener();
  }

  if (form) {
    document.querySelector('#pick-save-folder-btn').addEventListener('click', pickSaveFolder);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const savePath = document.querySelector('#device-save-path').value.trim();
      const ipValue = document.querySelector('#device-ip').value;
      const normalizedBase = normalizeIpInput(ipValue);

      if (!savePath) {
        setAddStatus('Choose a save folder first.', 'error');
        return;
      }

      if (!normalizedBase) {
        setAddStatus('IP address is required.', 'error');
        return;
      }

      // If IP changed since last successful probe, re-test before saving.
      const previousBase = (connectedDraft && connectedDraft.baseUrl) || document.querySelector('#device-base-url').value;
      if (!connectedDraft || String(previousBase || '').replace(/\/$/, '') !== String(normalizedBase).replace(/\/$/, '')) {
        setAddStatus('Testing connection for the new IP…');
        const healthResult = await window.apiBridge.devices.probeUrl({ ip: ipValue, baseUrl: normalizedBase });
        if (!healthResult.ok) {
          showConnectionError(classifyHealthFailure(healthResult));
          setAddStatus('Connection failed. Fix the IP and try again.', 'error');
          return;
        }
        connectedDraft = {
          ip: ipValue,
          baseUrl: healthResult.data.baseUrl || normalizedBase,
          clientId: document.querySelector('#device-client-id').value || undefined
        };
        document.querySelector('#device-base-url').value = connectedDraft.baseUrl;
      }

      setAddStatus('Saving…');
      const payload = {
        id: document.querySelector('#device-id').value || undefined,
        clientId: document.querySelector('#device-client-id').value || undefined,
        ip: ipValue,
        baseUrl: document.querySelector('#device-base-url').value || connectedDraft.baseUrl || normalizedBase,
        nickname: document.querySelector('#device-nickname').value,
        savePath
      };

      const result = await window.apiBridge.devices.save(payload);
      if (!result.ok) {
        setAddStatus(result.error || 'Save failed.', 'error');
        return;
      }

      await window.apiBridge.devices.setSelected(result.data.id);
      closeAddModal();
      resetForm();

      const online = result.data.handshake && result.data.handshake.online;
      if (online) {
        window.location.href = './login.html';
      } else {
        await loadDevices();
        setStatus('Machine saved. It is offline — connect when it comes online.', 'error');
      }
    });

    document.querySelector('#close-add-device-modal').addEventListener('click', closeAddModal);
    document.querySelector('#connect-device-btn').addEventListener('click', testUnsavedHealth);
    document.querySelector('#retry-device-btn').addEventListener('click', testUnsavedHealth);
    document.querySelector('#connection-error-retry').addEventListener('click', () => {
      closeConnectionError();
      testUnsavedHealth();
    });
    document.querySelector('#connection-error-close').addEventListener('click', closeConnectionError);

    addModal.addEventListener('click', (event) => {
      if (event.target === addModal) closeAddModal();
    });
  }
})();
