const SERVICE_NAME = 'RLE Client';

let keytarModule;

async function getKeytar() {
  if (!keytarModule) {
    keytarModule = await import('keytar');
  }

  return keytarModule.default || keytarModule;
}

function accountForDevice(deviceId) {
  if (!deviceId) {
    throw new Error('Device id is required for secure token storage.');
  }

  return `device:${deviceId}`;
}

class TokenStore {
  async getToken(deviceId) {
    const keytar = await getKeytar();
    return keytar.getPassword(SERVICE_NAME, accountForDevice(deviceId));
  }

  async setToken(deviceId, token) {
    const value = String(token || '').trim();

    if (!value) {
      throw new Error('Token is required.');
    }

    const keytar = await getKeytar();
    await keytar.setPassword(SERVICE_NAME, accountForDevice(deviceId), value);
    return { saved: true };
  }

  async clearToken(deviceId) {
    const keytar = await getKeytar();
    await keytar.deletePassword(SERVICE_NAME, accountForDevice(deviceId));
    return { cleared: true };
  }
}

module.exports = {
  TokenStore
};
