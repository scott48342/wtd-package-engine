const axios = require('axios');

class InstallerService {
  /**
   * @param {{db: import('pg').Pool, cacheTtlDays?:number}} deps
   */
  constructor({ db, cacheTtlDays = 30 }) {
    this.db = db;
    this.cacheTtlDays = cacheTtlDays;
    this.http = axios.create({ timeout: 15_000, headers: { Accept: 'application/json' } });
  }

  async _ensureTables() {
    await this.db.query({
      text: `
        create table if not exists installer (
          id uuid primary key,
          name text not null,
          address1 text,
          address2 text,
          city text,
          state text,
          zip text not null,
          phone text,
          website text,
          active boolean not null default true,
          lat numeric(9,6),
          lon numeric(9,6),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        create index if not exists installer_active_idx on installer(active);
        create index if not exists installer_zip_idx on installer(zip);

        create table if not exists zip_geo (
          zip text primary key,
          lat numeric(9,6) not null,
          lon numeric(9,6) not null,
          city text,
          state text,
          country text,
          as_of timestamptz not null default now()
        );
      `
    });
  }

  async _getZipGeo(zip) {
    await this._ensureTables();
    const { rows } = await this.db.query({
      text: `select zip, lat, lon, as_of from zip_geo where zip = $1`,
      values: [zip]
    });
    return rows[0] || null;
  }

  _isFresh(asOf) {
    if (!asOf) return false;
    const t = new Date(asOf).getTime();
    if (!Number.isFinite(t)) return false;
    const ageMs = Date.now() - t;
    return ageMs >= 0 && ageMs <= this.cacheTtlDays * 24 * 60 * 60 * 1000;
  }

  async _fetchZipGeo(zip) {
    // US-only simple ZIP lookup. If you need CA/etc later, we can swap providers.
    // https://api.zippopotam.us/us/{zip}
    const url = `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`;
    const res = await this.http.get(url);
    const data = res.data || {};
    const place = Array.isArray(data.places) ? data.places[0] : null;

    const lat = place?.latitude != null ? Number(place.latitude) : null;
    const lon = place?.longitude != null ? Number(place.longitude) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const err = new Error('zip_geocode_failed');
      err.details = { zip, data };
      err.status = 400;
      throw err;
    }

    return {
      zip,
      lat,
      lon,
      city: place['place name'] || null,
      state: place['state abbreviation'] || null,
      country: data.country_abbreviation || null
    };
  }

  async getZipLatLon(zip) {
    const z = String(zip || '').trim();
    if (!z) {
      const err = new Error('zip_required');
      err.status = 400;
      throw err;
    }

    const cached = await this._getZipGeo(z);
    if (cached && this._isFresh(cached.as_of)) {
      return { zip: z, lat: Number(cached.lat), lon: Number(cached.lon) };
    }

    const fresh = await this._fetchZipGeo(z);

    await this.db.query({
      text: `
        insert into zip_geo (zip, lat, lon, city, state, country, as_of)
        values ($1, $2::numeric(9,6), $3::numeric(9,6), $4, $5, $6, now())
        on conflict (zip) do update set
          lat = excluded.lat,
          lon = excluded.lon,
          city = excluded.city,
          state = excluded.state,
          country = excluded.country,
          as_of = excluded.as_of
      `,
      values: [fresh.zip, fresh.lat, fresh.lon, fresh.city, fresh.state, fresh.country]
    });

    return { zip: z, lat: fresh.lat, lon: fresh.lon };
  }

  async lookupBestInstallerByZip(zip) {
    await this._ensureTables();

    const z = String(zip || '').trim();
    if (!z) {
      const err = new Error('zip_required');
      err.status = 400;
      throw err;
    }

    const origin = await this.getZipLatLon(z);

    const { rows } = await this.db.query({
      text: `
        select id, name, address1, address2, city, state, zip, phone, website, active,
               lat, lon
        from installer
        where active = true
          and lat is not null
          and lon is not null
      `
    });

    const best = rows
      .map((r) => {
        const d = haversineMiles(origin.lat, origin.lon, Number(r.lat), Number(r.lon));
        return { ...r, distanceMiles: d };
      })
      .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];

    if (!best) return { installer: null };

    return {
      installer: {
        id: best.id,
        name: best.name,
        address1: best.address1,
        address2: best.address2,
        city: best.city,
        state: best.state,
        zip: best.zip,
        phone: best.phone,
        website: best.website,
        distanceMiles: round(best.distanceMiles, 2)
      }
    };
  }
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function round(n, digits) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

module.exports = { InstallerService };
