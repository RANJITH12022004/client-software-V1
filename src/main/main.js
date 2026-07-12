const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../shared/constants');

const { registerDeviceHandlers } = require('./ipc/deviceHandlers');
const { registerAuthHandlers } = require('./ipc/authHandlers');
const { registerFolderHandlers } = require('./ipc/folderHandlers');
const { registerSyncHandlers } = require('./ipc/syncHandlers');
const { registerReportsHandlers } = require('./ipc/reportsHandlers');
const { registerAuditHandlers } = require('./ipc/auditHandlers');
const { registerMembersHandlers } = require('./ipc/membersHandlers');
const { registerEmbedHandlers } = require('./ipc/embedHandlers');
const { createTray } = require('./tray');

let mainWindow;
let syncInProgress = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('close', (event) => {
    if (!syncInProgress) {
      return;
    }

    event.preventDefault();
    mainWindow.webContents.send(IPC_CHANNELS.APP_CLOSE_BLOCKED, {
      message: 'Auto backup is running. Do not close the application until it finishes.'
    });
  });

  return mainWindow;
}

function registerIpcHandlers(window) {
  registerDeviceHandlers(window);
  registerAuthHandlers();
  registerFolderHandlers(window);
  registerSyncHandlers(window, (busy) => {
    syncInProgress = Boolean(busy);
  });
  registerReportsHandlers();
  registerAuditHandlers();
  registerMembersHandlers();
  registerEmbedHandlers();
}

app.whenReady().then(() => {
  createMainWindow();
  registerIpcHandlers(mainWindow);
  createTray(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      registerFolderHandlers(mainWindow);
      createTray(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
