const fs = require('node:fs/promises');
const path = require('node:path');

function sanitizeFolderName(name) {
  const cleaned = String(name || 'machine')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 80);

  return cleaned || 'machine';
}

function deviceSaveRoot(device) {
  if (!device || !device.savePath) {
    throw new Error('Choose a save folder for this machine before downloading files.');
  }

  const nickname = sanitizeFolderName(device.nickname || device.name);
  return path.join(device.savePath, nickname);
}

function deviceReportsDir(device) {
  return path.join(deviceSaveRoot(device), 'reports');
}

function deviceAuditDir(device) {
  return path.join(deviceSaveRoot(device), 'audit');
}

async function ensureDeviceSubdirs(device) {
  const root = deviceSaveRoot(device);
  await fs.mkdir(path.join(root, 'reports'), { recursive: true });
  await fs.mkdir(path.join(root, 'audit'), { recursive: true });
  return root;
}

module.exports = {
  sanitizeFolderName,
  deviceSaveRoot,
  deviceReportsDir,
  deviceAuditDir,
  ensureDeviceSubdirs
};
