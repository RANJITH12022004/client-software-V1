const { normalizeBaseUrl } = require('./deviceStore');

const DEFAULT_TIMEOUT_MS = 30000;

function buildUrl(baseUrl, endpoint, query) {
  const url = new URL(endpoint, `${baseUrl}/`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

function formatFetchError(error) {
  if (error.name === 'AbortError') {
    return 'The machine did not respond in time.';
  }

  return error.message || 'Unable to reach the machine.';
}

async function parseResponse(response, responseType) {
  if (responseType === 'arrayBuffer') {
    return Buffer.from(await response.arrayBuffer());
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

class KioskApiClient {
  constructor({ baseUrl, token } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token || null;
  }

  withToken(token) {
    return new KioskApiClient({ baseUrl: this.baseUrl, token });
  }

  async request(endpoint, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const headers = {
      Accept: options.responseType === 'arrayBuffer' ? '*/*' : 'application/json',
      ...(options.headers || {})
    };

    if (options.body !== undefined && !(options.body instanceof Buffer)) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(buildUrl(this.baseUrl, endpoint, options.query), {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined
          ? undefined
          : options.body instanceof Buffer
            ? options.body
            : JSON.stringify(options.body),
        signal: controller.signal
      });

      const data = await parseResponse(response, options.responseType);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: data && (data.error || data.message) ? data.error || data.message : `The machine returned an error (${response.status}).`,
          data
        };
      }

      return {
        ok: true,
        status: response.status,
        data
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: formatFetchError(error)
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = {
  KioskApiClient
};
