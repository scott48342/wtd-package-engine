const axios = require('axios');

/**
 * Wheel-Size API client (v2).
 *
 * Swagger: https://api.wheel-size.com/v2/swagger/
 * Auth: API key as query parameter `user_key`.
 * Base URL should look like: https://api.wheel-size.com/v2
 */
class WheelSizeClient {
  /**
   * @param {{baseUrl:string, apiKey:string, timeoutMs?:number}} opts
   */
  constructor({ baseUrl, apiKey, timeoutMs = 25_000 }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;

    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: { Accept: 'application/json' }
    });
  }

  _authParams(params = {}) {
    if (!this.apiKey) throw new Error('WheelSizeClient missing apiKey');
    return { user_key: this.apiKey, ...params };
  }

  async years() {
    const res = await this.http.get('/years/', {
      params: this._authParams({})
    });
    return res.data;
  }

  async makes({ year, region, ordering, lang, brands, brandsExclude } = {}) {
    const res = await this.http.get('/makes/', {
      params: this._authParams({
        year,
        region,
        ordering,
        lang,
        brands,
        brands_exclude: brandsExclude
      })
    });
    return res.data;
  }

  async models({ make, year, region, ordering, lang } = {}) {
    if (!make) throw new Error('WheelSizeClient.models requires make');
    const res = await this.http.get('/models/', {
      params: this._authParams({ make, year, region, ordering, lang })
    });
    return res.data;
  }

  async modifications({ make, model, year, generation, region, fuel, horsepower, horsepowerMin, horsepowerMax, trim, trimLevel, ordering, lang } = {}) {
    if (!make || !model) throw new Error('WheelSizeClient.modifications requires make and model');
    const res = await this.http.get('/modifications/', {
      params: this._authParams({
        make,
        model,
        year,
        generation,
        region,
        fuel,
        horsepower,
        horsepower_min: horsepowerMin,
        horsepower_max: horsepowerMax,
        trim,
        trim_level: trimLevel,
        ordering,
        lang
      })
    });
    return res.data;
  }

  async searchByModel({ make, model, year, generation, modification, region, addConfigurator, ordering, lang } = {}) {
    if (!make || !model) throw new Error('WheelSizeClient.searchByModel requires make and model');
    const res = await this.http.get('/search/by_model/', {
      params: this._authParams({
        make,
        model,
        year,
        generation,
        modification,
        region,
        add_configurator: addConfigurator,
        ordering,
        lang
      })
    });
    return res.data;
  }
}

module.exports = { WheelSizeClient };
