const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS = Object.freeze({
  DEVICE_LIST: 'device:list',
  DEVICE_ACTIVE_GET: 'device:active:get',
  DEVICE_ACTIVE_SET: 'device:active:set',
  DEVICE_SELECTED_GET: 'device:selected:get',
  DEVICE_SELECTED_SET: 'device:selected:set',
  DEVICE_SAVE: 'device:save',
  DEVICE_REMOVE: 'device:remove',
  DEVICE_HEALTH: 'device:health',
  DEVICE_HEALTH_ALL: 'device:health:all',
  DEVICE_HEALTH_SNAPSHOT: 'device:health:snapshot',
  DEVICE_HEALTH_UPDATE: 'device:health:update',
  DEVICE_PROBE_URL: 'device:probe:url',
  DEVICE_NETWORK_IPS: 'device:network:ips',
  FOLDER_PICK: 'folder:pick',
  AUTH_LOGIN: 'auth:login',
  AUTH_ME: 'auth:me',
  AUTH_LOGOUT: 'auth:logout',
  SYNC_RUN: 'sync:run',
  SYNC_STATE_GET: 'sync:state:get',
  SYNC_SCHEDULE_GET: 'sync:schedule:get',
  SYNC_SCHEDULE_SET: 'sync:schedule:set',
  SYNC_BUSY_SET: 'sync:busy:set',
  SYNC_SCHEDULE_STARTED: 'sync:schedule:started',
  SYNC_SCHEDULE_FINISHED: 'sync:schedule:finished',
  APP_CLOSE_BLOCKED: 'app:close:blocked',
  REPORTS_LIST: 'reports:list',
  REPORTS_PDF_GET: 'reports:pdf:get',
  REPORTS_PDF_DOWNLOAD: 'reports:pdf:download',
  REPORTS_PDF_SAVE: 'reports:pdf:save',
  REPORTS_DOWNLOAD: 'reports:download',
  AUDIT_LIST: 'audit:list',
  AUDIT_DOWNLOAD: 'audit:download',
  MEMBERS_LIST: 'members:list',
  MEMBERS_GET: 'members:get',
  MEMBERS_SAVE: 'members:save',
  MEMBERS_REMOVE: 'members:remove',
  MEMBERS_UNLOCK: 'members:unlock',
  MEMBERS_ENABLE: 'members:enable',
  MEMBERS_PERMISSION_CARDS: 'members:getPermissionCards',
  APPROVAL_VERIFY: 'approval:verify',
  EMBED_RECIPE_URL: 'embed:getRecipeUrl',
  EMBED_OPEN_EXTERNAL: 'embed:openExternal'
});

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const electronAPI = {
  devices: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_LIST),
    getActive: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_ACTIVE_GET),
    setActive: (deviceId) => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_ACTIVE_SET, deviceId),
    getSelected: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_SELECTED_GET),
    setSelected: (deviceId) => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_SELECTED_SET, deviceId),
    save: (device) => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_SAVE, device),
    remove: (deviceId) => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_REMOVE, deviceId),
    health: (deviceId) => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_HEALTH, deviceId),
    checkAll: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_HEALTH_ALL),
    getHealthSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_HEALTH_SNAPSHOT),
    probeUrl: (payload) => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_PROBE_URL, payload),
    getNetworkIps: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_NETWORK_IPS),
    onHealthUpdate: (callback) => on(IPC_CHANNELS.DEVICE_HEALTH_UPDATE, callback)
  },
  reports: {
    list: (filters) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_LIST, filters),
    getPdf: (reportId) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_PDF_GET, reportId),
    savePdf: (payload) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_PDF_SAVE, payload),
    downloadPdf: (reportId) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_PDF_DOWNLOAD, reportId),
    downloadZip: (payload) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_DOWNLOAD, payload)
  },
  audit: {
    list: (filters) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LIST, filters),
    download: (payload) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_DOWNLOAD, payload)
  },
  members: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MEMBERS_LIST),
    get: (memberId) => ipcRenderer.invoke(IPC_CHANNELS.MEMBERS_GET, memberId),
    save: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEMBERS_SAVE, payload),
    remove: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEMBERS_REMOVE, payload),
    unlock: (memberId) => ipcRenderer.invoke(IPC_CHANNELS.MEMBERS_UNLOCK, memberId),
    enable: (memberId) => ipcRenderer.invoke(IPC_CHANNELS.MEMBERS_ENABLE, memberId),
    getPermissionCards: () => ipcRenderer.invoke(IPC_CHANNELS.MEMBERS_PERMISSION_CARDS),
    verifyApproval: (payload) => ipcRenderer.invoke(IPC_CHANNELS.APPROVAL_VERIFY, payload)
  },
  embed: {
    getRecipeUrl: () => ipcRenderer.invoke(IPC_CHANNELS.EMBED_RECIPE_URL),
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.EMBED_OPEN_EXTERNAL, url)
  },
  folder: {
    pick: (options) => ipcRenderer.invoke(IPC_CHANNELS.FOLDER_PICK, options || {})
  },
  auth: {
    login: (credentials) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, credentials),
    me: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_ME),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT)
  },
  sync: {
    run: (options) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_RUN, options || {}),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_STATE_GET),
    getSchedule: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_SCHEDULE_GET),
    setSchedule: (schedule) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_SCHEDULE_SET, schedule),
    setBusy: (busy) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_BUSY_SET, busy),
    onScheduledStarted: (callback) => on(IPC_CHANNELS.SYNC_SCHEDULE_STARTED, callback),
    onScheduledFinished: (callback) => on(IPC_CHANNELS.SYNC_SCHEDULE_FINISHED, callback),
    onCloseBlocked: (callback) => on(IPC_CHANNELS.APP_CLOSE_BLOCKED, callback)
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
