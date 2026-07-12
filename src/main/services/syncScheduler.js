const { EventEmitter } = require('node:events');
const { SyncStore, computeNextRunAt } = require('./syncStore');

class SyncScheduler extends EventEmitter {
  constructor() {
    super();
    this.store = new SyncStore();
    this.timer = null;
    this.runSync = null;
  }

  async init(runSync) {
    await this.store.init();
    this.runSync = runSync || this.runSync;
    this.refreshTimer();
    return this;
  }

  getSchedule() {
    return this.store.getSchedule();
  }

  async setSchedule(schedule) {
    await this.store.init();
    const next = await this.store.setSchedule(schedule);
    this.refreshTimer();
    return next;
  }

  refreshTimer() {
    clearTimeout(this.timer);
    this.timer = null;

    const schedule = this.getSchedule();
    if (!schedule.enabled || !schedule.nextRunAt) {
      return;
    }

    const delay = Math.max(new Date(schedule.nextRunAt).getTime() - Date.now(), 1000);
    this.timer = setTimeout(() => {
      this.executeScheduledSync();
    }, delay);
  }

  async executeScheduledSync() {
    const schedule = this.getSchedule();

    if (!schedule.enabled || !this.runSync) {
      this.refreshTimer();
      return;
    }

    try {
      this.emit('start', { scheduled: true });
      const result = await this.runSync({ scheduled: true, mode: 'all' });
      this.emit('finish', result);
    } catch (error) {
      this.emit('finish', {
        ok: false,
        error: error.message || String(error)
      });
    } finally {
      const updated = {
        ...schedule,
        lastRunAt: new Date().toISOString(),
        nextRunAt: computeNextRunAt(schedule).toISOString()
      };
      await this.store.setSchedule(updated);
      this.refreshTimer();
    }
  }
}

module.exports = {
  SyncScheduler
};
