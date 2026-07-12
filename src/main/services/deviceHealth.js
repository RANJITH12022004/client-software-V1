const { DESKTOP_API, MACHINE_API } = require('../../shared/constants');
const { KioskApiClient } = require('./kioskApiClient');
const { normalizeBaseUrl, withMachinePort } = require('./deviceStore');

const HEALTH_TIMEOUT_MS = 10000;

async function requestHealth(baseUrl) {
  const client = new KioskApiClient({ baseUrl });
  let result = await client.request(DESKTOP_API.HEALTH, { timeoutMs: HEALTH_TIMEOUT_MS });

  if (!result.ok && (result.status === 404 || result.status === 0)) {
    const legacy = await client.request(MACHINE_API.HEALTH, { timeoutMs: HEALTH_TIMEOUT_MS });
    if (legacy.ok) {
      return {
        ok: true,
        status: legacy.status,
        data: {
          ok: true,
          status: 'ok',
          legacy: true,
          ...(legacy.data || {})
        }
      };
    }
  }

  return result;
}

async function probeDeviceHealth(device) {
  const candidates = [];
  const seen = new Set();

  function addCandidate(url) {
    const normalized = String(url || '').trim().replace(/\/$/, '');
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  }

  addCandidate(device.baseUrl);
  addCandidate(withMachinePort(device.baseUrl));
  addCandidate(withMachinePort(device.ip));

  if (device.ip) {
    const ip = String(device.ip).trim();
    if (/^https?:\/\//i.test(ip)) {
      addCandidate(withMachinePort(ip));
    } else {
      addCandidate(withMachinePort(`http://${ip}`));
    }
  }

  let lastResult = { ok: false, status: 0, error: 'Unable to reach the machine.' };

  for (const baseUrl of candidates) {
    try {
      const result = await requestHealth(baseUrl);
      lastResult = { ...result, baseUrl };
      if (result.ok) {
        return {
          ok: true,
          status: result.status,
          baseUrl: normalizeBaseUrl(baseUrl),
          data: result.data,
          checkedAt: new Date().toISOString()
        };
      }
    } catch (error) {
      lastResult = {
        ok: false,
        status: 0,
        error: error.message || String(error),
        baseUrl
      };
    }
  }

  return {
    ok: false,
    status: lastResult.status || 0,
    error: lastResult.error || 'Unable to reach the machine.',
    baseUrl: device.baseUrl,
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  probeDeviceHealth,
  requestHealth
};
