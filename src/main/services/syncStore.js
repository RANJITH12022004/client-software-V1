let StoreConstructor;

async function getStoreConstructor() {
  if (!StoreConstructor) {
    const module = await import('electron-store');
    StoreConstructor = module.default || module;
  }

  return StoreConstructor;
}

function defaultDeviceState() {
  return {
    downloadedReportIds: [],
    lastAuditTimestampMs: null,
    lastSyncAt: null
  };
}

class SyncStore {
  constructor() {
    this.store = null;
  }

  async init() {
    if (!this.store) {
      const Store = await getStoreConstructor();
      this.store = new Store({
        name: 'device-sync',
        defaults: {
          devices: {},
          schedule: {
            enabled: false,
            frequency: 'daily',
            time: '09:00',
            dayOfWeek: 1,
            dayOfMonth: 1,
            deviceId: null,
            lastRunAt: null,
            nextRunAt: null
          }
        }
      });
    }

    return this;
  }

  async getDeviceState(deviceId) {
    await this.init();
    const devices = this.store.get('devices', {});
    return { ...defaultDeviceState(), ...(devices[deviceId] || {}) };
  }

  async setDeviceState(deviceId, patch) {
    await this.init();
    const devices = this.store.get('devices', {});
    devices[deviceId] = {
      ...defaultDeviceState(),
      ...(devices[deviceId] || {}),
      ...patch
    };
    this.store.set('devices', devices);
    return devices[deviceId];
  }

  async markReportDownloaded(deviceId, reportId) {
    const state = await this.getDeviceState(deviceId);
    const ids = new Set(state.downloadedReportIds.map(String));
    ids.add(String(reportId));
    return this.setDeviceState(deviceId, { downloadedReportIds: [...ids] });
  }

  async setLastAuditTimestamp(deviceId, timestampMs) {
    return this.setDeviceState(deviceId, { lastAuditTimestampMs: Number(timestampMs) || null });
  }

  async touchSync(deviceId) {
    return this.setDeviceState(deviceId, { lastSyncAt: new Date().toISOString() });
  }

  getSchedule() {
    return this.store.get('schedule');
  }

  async setSchedule(schedule) {
    await this.init();
    const current = this.getSchedule();
    const next = {
      ...current,
      ...schedule,
      enabled: schedule.enabled === true,
      frequency: ['daily', 'weekly', 'monthly'].includes(schedule.frequency)
        ? schedule.frequency
        : current.frequency || 'daily',
      time: /^\d{2}:\d{2}$/.test(schedule.time || '') ? schedule.time : (current.time || '09:00')
    };
    next.nextRunAt = next.enabled ? computeNextRunAt(next).toISOString() : null;
    this.store.set('schedule', next);
    return next;
  }
}

function parseTime(timeStr) {
  const [h, m] = String(timeStr || '09:00').split(':').map(Number);
  return { hours: h || 9, minutes: m || 0 };
}

function computeNextRunAt(schedule, fromDate = new Date()) {
  const { hours, minutes } = parseTime(schedule.time);
  const next = new Date(fromDate);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);

  if (schedule.frequency === 'daily') {
    if (next <= fromDate) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (schedule.frequency === 'weekly') {
    const targetDay = Number.isInteger(schedule.dayOfWeek) ? schedule.dayOfWeek : 1;
    let delta = (targetDay - next.getDay() + 7) % 7;
    if (delta === 0 && next <= fromDate) {
      delta = 7;
    }
    next.setDate(next.getDate() + delta);
    return next;
  }

  const targetDom = Math.min(Math.max(Number(schedule.dayOfMonth) || 1, 1), 28);
  next.setDate(targetDom);
  if (next <= fromDate) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(targetDom);
  }
  return next;
}

module.exports = {
  SyncStore,
  computeNextRunAt
};
