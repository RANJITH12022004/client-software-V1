const fs = require('node:fs/promises');
const path = require('node:path');
const { BrowserWindow, dialog } = require('electron');

function defaultFileName(prefix, extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${extension}`;
}

function resolveParentWindow(event) {
  if (event && event.sender) {
    const fromSender = BrowserWindow.fromWebContents(event.sender);
    if (fromSender && !fromSender.isDestroyed()) {
      return fromSender;
    }
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused;
  }
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) || null;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  return Buffer.from(data || []);
}

async function saveBufferWithDialog(event, { buffer, defaultPath, filters }) {
  const parent = resolveParentWindow(event);
  const payload = Buffer.from(toBuffer(buffer));

  if (!payload.length) {
    return { ok: false, error: 'Download returned an empty file.' };
  }

  const result = await dialog.showSaveDialog(parent, {
    title: 'Save file',
    defaultPath: defaultPath || defaultFileName('download', 'bin'),
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, error: 'Save was cancelled.' };
  }

  const filePath = path.resolve(result.filePath);
  await fs.writeFile(filePath, payload);
  return {
    ok: true,
    data: { filePath, bytes: payload.length }
  };
}

module.exports = {
  defaultFileName,
  saveBufferWithDialog,
  toBuffer
};
