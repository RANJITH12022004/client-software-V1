(function initLogin() {
  const form = document.querySelector('#login-form');
  const statusEl = document.querySelector('#login-status');
  const machineNameEl = document.querySelector('#login-machine-name');
  const machineIpEl = document.querySelector('#login-machine-ip');
  const submitBtn = form?.querySelector('button[type="submit"]');
  let stickyStatusMessage = '';

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = `toast${type ? ` ${type}` : ''}`;
  }

  function showSavedStatus() {
    try {
      const message = sessionStorage.getItem('rle-login-status');
      if (message) {
        sessionStorage.removeItem('rle-login-status');
        stickyStatusMessage = message;
        setStatus(message, 'error');
      }
    } catch (_e) { /* ignore */ }
  }

  function formatIp(device) {
    const value = device.ip || device.baseUrl || '';
    if (!/^https?:\/\//i.test(value)) return value.split(':')[0];
    try { return new URL(value).hostname; } catch { return value; }
  }

  async function loadActiveDevice() {
    const result = await window.apiBridge.devices.getSelected();

    if (!result.ok || !result.data) {
      if (machineNameEl) machineNameEl.textContent = 'No machine selected';
      if (machineIpEl) machineIpEl.textContent = 'Go back and select a machine';
      if (submitBtn) submitBtn.disabled = true;
      setStatus('Select a machine from the Machines page.', 'error');
      return;
    }

    const device = result.data;
    if (machineNameEl) machineNameEl.textContent = device.nickname || device.name;
    if (machineIpEl) machineIpEl.textContent = formatIp(device);
    if (submitBtn) submitBtn.disabled = false;
    if (!stickyStatusMessage) setStatus('');
  }

  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.querySelector('#login-username').value;
    const password = document.querySelector('#login-password').value;

    setStatus('Signing in…');
    window.apiBridge.auth.login({ username, password }).then((result) => {
      if (!result.ok) {
        let message = result.error || 'Sign in failed.';
        const data = result.data || {};
        if (data.remainingAttempts !== undefined && data.remainingAttempts !== null) {
          message += ` (${data.remainingAttempts} attempt${data.remainingAttempts === 1 ? '' : 's'} remaining)`;
        }
        if (data.passwordChangeRequired) {
          message = 'Password change is required on the kiosk before this account can use the desktop client. Ask an admin to reset the password.';
        }
        setStatus(message, 'error');
        return;
      }
      setStatus('Success. Opening workspace…', 'success');
      const user = result.data && result.data.user;
      const device = result.data && result.data.device;
      if (user && device && device.id) {
        try {
          sessionStorage.setItem(`rle-user-${device.id}`, JSON.stringify(user));
        } catch (_e) { /* ignore */ }
      }
      window.location.href = './dashboard.html';
    });
  });

  loadActiveDevice();
  showSavedStatus();
})();
