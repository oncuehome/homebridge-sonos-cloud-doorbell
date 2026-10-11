'use strict';

const fs = require('fs');
const path = require('path');

const TOKEN_URL = 'https://api.sonos.com/login/v3/oauth/access';
const API_BASE = 'https://api.ws.sonos.com/control/api/v1';

/**
 * Client for the parts of the Sonos Control API this plugin needs:
 * token refresh + the audioClip endpoint.
 *
 * Two things about Sonos's OAuth make this fiddlier than it looks:
 *
 *   1. REFRESH TOKENS ROTATE. Every successful refresh returns a NEW
 *      refresh token and invalidates the old one. So the token in
 *      config.json is single-use. It must be persisted on rotation, or the
 *      next restart authenticates with a dead token and everything fails
 *      with invalid_grant.
 *
 *   2. CONCURRENT REFRESHES RACE. A chime fires at every speaker in
 *      parallel. If the access token has expired, each of those calls
 *      would independently try to refresh -- and because of (1), the first
 *      to land invalidates the token the others are still using. They fail
 *      with "Invalid Refresh Token" even though nothing is actually wrong.
 *      Refreshes are therefore single-flighted: concurrent callers all
 *      await the same in-flight promise.
 */
class SonosCloudClient {
  constructor({ clientId, clientSecret, refreshToken, log, storagePath }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.log = log || console;

    this._tokenFile = storagePath
      ? path.join(storagePath, '.sonos-cloud-doorbell-token.json')
      : null;

    // A token persisted from a previous rotation supersedes config.json,
    // because the config one has almost certainly been invalidated by now.
    this.refreshToken = this._loadPersistedToken(refreshToken) || refreshToken;
    this._configToken = refreshToken;

    this._accessToken = null;
    this._accessTokenExpiresAt = 0;
    this._refreshInFlight = null;
  }

  _loadPersistedToken(configToken) {
    if (!this._tokenFile) return null;
    try {
      if (!fs.existsSync(this._tokenFile)) return null;
      const saved = JSON.parse(fs.readFileSync(this._tokenFile, 'utf8'));
      if (!saved || typeof saved.refreshToken !== 'string') return null;
      // If the config token changed (user re-ran authorize), trust the config.
      if (saved.forConfigToken && saved.forConfigToken !== configToken) {
        this.log.info('Config refresh token changed — using the new one.');
        return null;
      }
      return saved.refreshToken;
    } catch (e) {
      this.log.warn(`Could not read stored Sonos token: ${e.message}`);
      return null;
    }
  }

  _persistToken(token) {
    if (!this._tokenFile) return;
    try {
      fs.writeFileSync(
        this._tokenFile,
        JSON.stringify({ refreshToken: token, forConfigToken: this._configToken, updated: new Date().toISOString() }, null, 2),
        { mode: 0o600 }
      );
    } catch (e) {
      this.log.warn(`Could not save rotated Sonos token: ${e.message}`);
    }
  }

  _basicAuthHeader() {
    return `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
  }

  async _doRefresh() {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: this._basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 400 && text.includes('invalid_grant')) {
        throw new Error(
          'Sonos refresh token is no longer valid. Re-run `npm run authorize` ' +
            'in the plugin folder and put the new refreshToken in config.json.'
        );
      }
      throw new Error(`Sonos token refresh failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    this._accessToken = json.access_token;
    this._accessTokenExpiresAt = Date.now() + (json.expires_in || 900) * 1000 - 60_000;

    // Sonos rotates the refresh token — keep and persist the new one.
    if (json.refresh_token && json.refresh_token !== this.refreshToken) {
      this.refreshToken = json.refresh_token;
      this._persistToken(json.refresh_token);
    }

    return this._accessToken;
  }

  /** Single-flight: concurrent callers share one refresh. */
  async _refresh() {
    if (this._refreshInFlight) return this._refreshInFlight;
    this._refreshInFlight = this._doRefresh().finally(() => {
      this._refreshInFlight = null;
    });
    return this._refreshInFlight;
  }

  async getAccessToken() {
    if (this._accessToken && Date.now() < this._accessTokenExpiresAt) {
      return this._accessToken;
    }
    return this._refresh();
  }

  async _authedFetch(path_, options = {}) {
    const send = async (token) =>
      fetch(`${API_BASE}${path_}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });

    let res = await send(await this.getAccessToken());

    if (res.status === 401) {
      // Expired between check and send — refresh once (single-flighted, so
      // parallel speaker calls share it) and retry.
      this._accessToken = null;
      res = await send(await this.getAccessToken());
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sonos API ${path_} failed (${res.status}): ${text}`);
    }

    return res.json().catch(() => ({}));
  }

  async getHouseholds() {
    const json = await this._authedFetch('/households');
    return json.households || [];
  }

  async getGroups(householdId) {
    return this._authedFetch(`/households/${householdId}/groups`);
  }

  /**
   * Play an audio clip on one player. Ducks current audio, plays, restores.
   * `name` must be unique per invocation -- Sonos silently drops repeats
   * that share a name+appId.
   */
  async playAudioClip(playerId, opts) {
    const payload = {
      name: opts.name,
      appId: opts.appId,
      priority: opts.priority || 'HIGH',
    };
    if (opts.streamUrl) payload.streamUrl = opts.streamUrl;
    if (opts.volume !== undefined && opts.volume !== null) payload.volume = opts.volume;

    return this._authedFetch(`/players/${playerId}/audioClip`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

module.exports = { SonosCloudClient };
