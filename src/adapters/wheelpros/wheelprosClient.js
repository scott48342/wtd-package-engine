const axios = require('axios');

class WheelProsAuthClient {
  constructor({ authBaseUrl, userName, password, tokenSkewMs = 60_000 }) {
    this.authBaseUrl = authBaseUrl;
    this.userName = userName;
    this.password = password;
    this.tokenSkewMs = tokenSkewMs;

    this._token = null;
    this._expiresAtMs = 0;
    this._refreshPromise = null;

    this.http = axios.create({
      baseURL: authBaseUrl,
      timeout: 20_000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    });
  }

  hasValidToken() {
    return !!this._token && Date.now() < (this._expiresAtMs - this.tokenSkewMs);
  }

  async refreshToken() {
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = (async () => {
      if (!this.userName || !this.password) {
        throw new Error('WheelPros credentials missing (WHEELPROS_USERNAME/WHEELPROS_PASSWORD)');
      }

      // WheelPros Auth API: POST /v1/authorize
      const res = await this.http.post('v1/authorize', {
        userName: this.userName,
        password: this.password
      });

      const data = res.data || {};
      if (!data.accessToken) {
        const err = new Error('WheelPros auth did not return accessToken');
        err.details = data;
        throw err;
      }

      const expiresInSec = Number(data.expiresIn ?? 3600);
      this._token = data.accessToken;
      this._expiresAtMs = Date.now() + expiresInSec * 1000;

      return {
        accessToken: this._token,
        expiresIn: expiresInSec,
        tokenType: data.tokenType ?? 'Bearer'
      };
    })();

    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  async getToken() {
    if (this.hasValidToken()) return this._token;
    await this.refreshToken();
    return this._token;
  }
}

class WheelProsProductsClient {
  constructor({ productsBaseUrl, authClient }) {
    this.authClient = authClient;
    this.http = axios.create({
      baseURL: productsBaseUrl,
      timeout: 30_000,
      headers: { Accept: 'application/json' }
    });
  }

  async request(config) {
    let token = await this.authClient.getToken();

    const attempt = async (bearerToken) => {
      return this.http.request({
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${bearerToken}`
        }
      });
    };

    try {
      return await attempt(token);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401 || status === 403) {
        const refreshed = await this.authClient.refreshToken();
        token = refreshed.accessToken;
        return await attempt(token);
      }
      throw e;
    }
  }
}

class WheelProsPricingClient {
  constructor({ pricingBaseUrl, authClient }) {
    this.authClient = authClient;
    this.http = axios.create({
      baseURL: pricingBaseUrl,
      timeout: 30_000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    });
  }

  async request(config) {
    let token = await this.authClient.getToken();

    const attempt = async (bearerToken) => {
      return this.http.request({
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${bearerToken}`
        }
      });
    };

    try {
      return await attempt(token);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401 || status === 403) {
        const refreshed = await this.authClient.refreshToken();
        token = refreshed.accessToken;
        return await attempt(token);
      }
      throw e;
    }
  }
}

module.exports = { WheelProsAuthClient, WheelProsProductsClient, WheelProsPricingClient };