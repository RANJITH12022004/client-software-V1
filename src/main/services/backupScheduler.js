const { EventEmitter } = require('node:events');

const MIN_INTERVAL_MINUTES = 15;
const FREQUENCY_INTERVALS = Object.freeze({
  daily: 1440,
  weekly: 10080,
  monthly: 43200
});

let StoreConstructor;

async function getStoreConstructor() {
  if (!StoreConstructor) {
    const module = await import('electron-store');
    StoreConstructor = module.default || module;
  }

  return StoreConstructor;
}

class BackupScheduler extends EventEmitter {
  constructor() {
    super();
    this.store = null;
    this.timer = null;
    this.runBackup = null;
  }

  async init(runBackup) {
    if (!this.store) {
      const Store = await getStoreConstructor();
      this.store = new Store({
        name: 'backup-scheduler',
        defaults: {
          schedule: {
            enabled: false,
            intervalMinutes: 1440,
            lastRunAt: null,
            nextRunAt: null
          }
        }
      });
    }

    this.runBackup = runBackup || this.runBackup;
    this.refreshTimer();
    return this;
  }

  getSchedule() {
    return this.store.get('schedule');
  }

  async setSchedule(schedule) {
    await this.init();
    const frequency = ['daily', 'weekly', 'monthly'].includes(schedule.frequency) ? schedule.frequency : 'daily';
    const intervalMinutes = Math.max(Number(schedule.intervalMinutes) || FREQUENCY_INTERVALS[frequency], MIN_INTERVAL_MINUTES);
    const nextRunAt = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
    const nextSchedule = {
      enabled: schedule.enabled !== false,
      frequency,
      intervalMinutes,
      lastRunAt: this.getSchedule().lastRunAt || null,
      nextRunAt: schedule.enabled === false ? null : nextRunAt
    };

    this.store.set('schedule', nextSchedule);
    this.refreshTimer();
    return nextSchedule;
  }

  async clearSchedule() {
    await this.init();
    const schedule = {
      enabled: false,
      intervalMinutes: 1440,
      lastRunAt: null,
      nextRunAt: null
    };

    this.store.set('schedule', schedule);
    this.refreshTimer();
    return schedule;
  }

  refreshTimer() {
    clearTimeout(this.timer);
    this.timer = null;

    if (!this.store) {
      return;
    }

    const schedule = this.getSchedule();
    if (!schedule.enabled || !schedule.nextRunAt) {
      return;
    }

    const delay = Math.max(new Date(schedule.nextRunAt).getTime() - Date.now(), 1000);
    this.timer = setTimeout(() => {
      this.executeScheduledBackup();
    }, delay);
  }

  async executeScheduledBackup() {
    const schedule = this.getSchedule();

    if (!schedule.enabled || !this.runBackup) {
      this.refreshTimer();
      return;
    }

    try {
      this.emit('start', { scheduled: true });
      const result = await this.runBackup({ scheduled: true });
      this.emit('run', result);
      this.emit('finish', result);
    } catch (error) {
      this.emit('error', error);
      this.emit('finish', {
        ok: false,
        error: error.message || String(error)
      });
    } finally {
      const intervalMinutes = Math.max(Number(schedule.intervalMinutes) || 1440, MIN_INTERVAL_MINUTES);
      this.store.set('schedule', {
        ...schedule,
        lastRunAt: new Date().toISOString(),
        nextRunAt: new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString()
      });
      this.refreshTimer();
    }
  }
}

module.exports = {
  BackupScheduler
};
