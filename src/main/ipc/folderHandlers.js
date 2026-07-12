const { BrowserWindow, dialog, ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../../shared/constants');

let mainWindowRef = null;
let handlerRegistered = false;

function failure(error) {
  return {
    ok: false,
    error: error.message || String(error)
  };
}

function resolveParentWindow(event) {
  return (
    BrowserWindow.fromWebContents(event.sender)
    || BrowserWindow.getFocusedWindow()
    || mainWindowRef
  );
}

function registerFolderHandlers(mainWindow) {
  if (mainWindow) {
    mainWindowRef = mainWindow;
  }

  if (handlerRegistered) {
    return;
  }

  handlerRegistered = true;

  ipcMain.handle(IPC_CHANNELS.FOLDER_PICK, async (event, options = {}) => {
    try {
      const parent = resolveParentWindow(event);

      if (parent) {
        parent.focus();
        parent.setAlwaysOnTop(true, 'screen-saver');
      }

      const result = await dialog.showOpenDialog(parent || undefined, {
        title: options.title || 'Choose folder to save reports and audit files',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: options.defaultPath || undefined,
        buttonLabel: 'Select Folder'
      });

      if (parent) {
        parent.setAlwaysOnTop(false);
      }

      if (result.canceled || !result.filePaths || !result.filePaths[0]) {
        return { ok: false, error: 'Folder selection was cancelled.' };
      }

      return {
        ok: true,
        data: { path: result.filePaths[0] }
      };
    } catch (error) {
      if (mainWindowRef) {
        mainWindowRef.setAlwaysOnTop(false);
      }
      return failure(error);
    }
  });
}

module.exports = {
  registerFolderHandlers
};
