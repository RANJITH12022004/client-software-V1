const path = require('node:path');
const { app, BrowserWindow, Menu } = require('electron');
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow;
  let syncInProgress = false;

  function getAppIconPath() {
    return path.join(__dirname, '../../assets/icon.png');
  }

  function focusMainWindow() {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }

  function createMainWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 700,
      show: false,
      title: 'RLE Client',
      icon: getAppIconPath(),
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

  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createMainWindow();
    registerIpcHandlers(mainWindow);
    createTray(mainWindow);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        registerFolderHandlers(mainWindow);
        createTray(mainWindow);
      } else {
        focusMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
