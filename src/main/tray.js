const path = require('node:path');
const { Menu, Tray, app } = require('electron');

let tray;

function createTray(mainWindow) {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show RLE Client',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  tray.setToolTip('RLE Client');
  tray.setContextMenu(contextMenu);

  return tray;
}

module.exports = {
  createTray
};
