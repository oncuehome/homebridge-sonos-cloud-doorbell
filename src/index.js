'use strict';

const { SonosCloudClient } = require('./sonosCloudClient');

const PLATFORM_NAME = 'SonosCloudDoorbell';
const PLUGIN_NAME = 'homebridge-sonos-cloud-doorbell';

module.exports = (api) => {
  api.registerPlatform(PLATFORM_NAME, SonosCloudDoorbellPlatform);
};

class SonosCloudDoorbellPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.accessories = [];

    if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken) {
      this.log.error(
        'Missing clientId / clientSecret / refreshToken. Run `npm run authorize` ' +
          'in the plugin folder to generate these — see README.'
      );
      return;
    }

    this.client = new SonosCloudClient({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      refreshToken: this.config.refreshToken,
      log: this.log,
      storagePath: typeof api.user?.storagePath === 'function' ? api.user.storagePath() : undefined,
    });

    this.appId = this.config.appId || 'com.oncuehome.doorbell';

    this.chimes = this._resolveChimes();
    if (!this.chimes.length) {
      this.log.error(
        'No usable chimes configured. Define a "chimes" array (each with name + players), ' +
          'or the single-chime fields chimeName/players — see README.'
      );
      return;
    }

    api.on('didFinishLaunching', () => this._setupAccessories());
  }

  /**
   * Build the list of chimes to expose.
   *
   * Supports two config shapes:
   *
   *   NEW (multiple switches) -- a "chimes" array, each entry its own
   *   HomeKit switch with its own sound, volume and target speakers:
   *     "chimes": [
   *       { "name": "Front Door", "chimeUrl": "...", "players": [...] },
   *       { "name": "Driveway Gate", "chimeUrl": "...", "players": [...] }
   *     ]
   *
   *   LEGACY (single switch) -- top-level chimeName/chimeUrl/volume/players.
   *   Still honoured so existing configs keep working untouched.
   *
   * Any field a chime omits falls back to the top-level value, so shared
   * settings (usually players and volume) need only be written once.
   */
  _resolveChimes() {
    const topPlayers = Array.isArray(this.config.players) ? this.config.players : [];
    const defaults = {
      volume: this.config.volume,
      priority: this.config.priority || 'HIGH',
      chimeUrl: this.config.chimeUrl,
      players: topPlayers,
      autoOffSeconds: this.config.autoOffSeconds ?? 1,
    };

    const raw = Array.isArray(this.config.chimes) && this.config.chimes.length
      ? this.config.chimes
      : [
          {
            name: this.config.chimeName || 'Doorbell',
            chimeUrl: this.config.chimeUrl,
            volume: this.config.volume,
            players: topPlayers,
          },
        ];

    const seen = new Set();
    const out = [];

    raw.forEach((c, i) => {
      const name = (c && typeof c.name === 'string' && c.name.trim()) || `Chime ${i + 1}`;

      if (seen.has(name.toLowerCase())) {
        this.log.warn(`Duplicate chime name "${name}" — skipping the later one. Names must be unique.`);
        return;
      }

      const players = Array.isArray(c.players) && c.players.length ? c.players : defaults.players;
      if (!players.length) {
        this.log.error(`Chime "${name}" has no players and no top-level "players" fallback — skipping it.`);
        return;
      }

      const valid = players.filter((p) => p && typeof p.playerId === 'string' && p.playerId.trim());
      if (!valid.length) {
        this.log.error(`Chime "${name}": no entry in "players" has a playerId — skipping it.`);
        return;
      }
      if (valid.length !== players.length) {
        this.log.warn(`Chime "${name}": ignoring ${players.length - valid.length} player entry/entries with no playerId.`);
      }

      seen.add(name.toLowerCase());

      // repeat: how many times to sound the clip per trigger. Useful where
      // the upstream doorbell throttles repeat press events (Nest/Google do),
      // so a single press can still be made more noticeable.
      const rawRepeat = c.repeat !== undefined ? c.repeat : this.config.repeat;
      let repeat = Number.isFinite(Number(rawRepeat)) ? Math.round(Number(rawRepeat)) : 1;
      if (repeat < 1 || repeat > 5) {
        if (rawRepeat !== undefined) {
          this.log.warn(`Chime "${name}": repeat must be 1-5, got ${rawRepeat} — using ${Math.min(Math.max(repeat, 1), 5)}.`);
        }
        repeat = Math.min(Math.max(repeat, 1), 5);
      }

      const rawGap = c.repeatGapSeconds !== undefined ? c.repeatGapSeconds : this.config.repeatGapSeconds;
      let gap = Number.isFinite(Number(rawGap)) ? Number(rawGap) : 4;
      if (gap < 0.5 || gap > 30) {
        if (rawGap !== undefined) {
          this.log.warn(`Chime "${name}": repeatGapSeconds must be 0.5-30, got ${rawGap} — using ${Math.min(Math.max(gap, 0.5), 30)}.`);
        }
        gap = Math.min(Math.max(gap, 0.5), 30);
      }

      out.push({
        name,
        chimeUrl: c.chimeUrl !== undefined ? c.chimeUrl : defaults.chimeUrl,
        volume: c.volume !== undefined ? c.volume : defaults.volume,
        priority: c.priority || defaults.priority,
        players: valid,
        repeat,
        repeatGapMs: Math.round(gap * 1000),
        autoOffMs: (c.autoOffSeconds ?? defaults.autoOffSeconds) * 1000,
      });
    });

    return out;
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }

  _uuidFor(name) {
    // Keyed on the chime's name, so renaming a chime creates a fresh
    // accessory and the old one gets cleaned up below.
    return this.api.hap.uuid.generate(`${PLUGIN_NAME}:chime:${name}`);
  }

  _setupAccessories() {
    const wanted = new Map();

    for (const chime of this.chimes) {
      const uuid = this._uuidFor(chime.name);
      wanted.set(uuid, chime);

      let accessory = this.accessories.find((a) => a.UUID === uuid);
      const isNew = !accessory;

      if (isNew) {
        accessory = new this.api.platformAccessory(chime.name, uuid);
      }

      accessory.category = this.api.hap.Categories.SWITCH;
      accessory.context.chime = { name: chime.name };

      const service =
        accessory.getService(this.Service.Switch) ||
        accessory.addService(this.Service.Switch, chime.name);

      service.setCharacteristic(this.Characteristic.Name, chime.name);

      // Replace any handler left over from a previous config load
      const on = service.getCharacteristic(this.Characteristic.On);
      on.removeAllListeners('set');
      on.removeAllListeners('get');
      on.onSet(async (value) => {
        if (!value) return; // only react to the on-transition, ignore the auto-off
        this._trigger(chime, service);
      }).onGet(() => false);

      // Make sure it starts off, in case Homebridge restored it as on
      service.updateCharacteristic(this.Characteristic.On, false);

      if (isNew) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      const target = chime.players.map((p) => p.name || p.playerId).join(', ');
      this.log.info(`Chime switch ready: "${chime.name}" -> ${target}`);
    }

    // Remove accessories for chimes that are no longer in the config
    const stale = this.accessories.filter((a) => !wanted.has(a.UUID));
    if (stale.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      this.accessories = this.accessories.filter((a) => wanted.has(a.UUID));
      for (const a of stale) {
        this.log.info(`Removed chime switch no longer in config: "${a.displayName}"`);
      }
    }
  }

  /** One pass of the clip at every configured speaker, in parallel. */
  async _fireOnce(chime, pass) {
    const start = Date.now();
    const targets = chime.players;

    // Sonos deduplicates audioClips that share a name+appId: a repeat
    // arriving while the previous one is still active (or very recently
    // played) is accepted with HTTP 200 but never sounded. Sending a unique
    // name each time is what makes consecutive rings actually ring.
    // The name is an internal identifier, not shown to anyone.
    const clipName = `${chime.name} ${Date.now().toString(36)}-${(this._seq = (this._seq || 0) + 1)}`;

    const results = await Promise.allSettled(
      targets.map((p) =>
        this.client.playAudioClip(p.playerId, {
          name: clipName,
          appId: this.appId,
          streamUrl: chime.chimeUrl,
          volume: chime.volume,
          priority: chime.priority,
        })
      )
    );

    const failed = results
      .map((r, i) => ({ r, name: targets[i].name || targets[i].playerId }))
      .filter((x) => x.r.status === 'rejected');

    const label = chime.repeat > 1 ? `"${chime.name}" (${pass}/${chime.repeat})` : `"${chime.name}"`;
    this.log.info(
      `${label} dispatched to ${targets.length} speaker(s) in ${Date.now() - start}ms` +
        (failed.length ? ` (${failed.length} failed)` : '')
    );
    for (const f of failed) {
      this.log.error(`${label} failed on "${f.name}": ${f.r.reason?.message || f.r.reason}`);
    }
  }

  async _trigger(chime, service) {
    const start = Date.now();

    // Guard against a trigger landing while a repeat sequence is still
    // running -- otherwise two overlapping sequences interleave on the
    // speakers. The switch still resets normally either way.
    if (chime._busy) {
      this.log.info(`"${chime.name}" already sounding — ignoring overlapping trigger.`);
      return;
    }
    chime._busy = true;

    try {
      for (let i = 0; i < chime.repeat; i++) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, chime.repeatGapMs));
        }
        await this._fireOnce(chime, i + 1);
      }
      if (chime.repeat > 1) {
        this.log.info(`"${chime.name}" finished ${chime.repeat} rings in ${Date.now() - start}ms`);
      }
    } finally {
      chime._busy = false;
    }

    // Flip the switch back off so the automation can trigger it again
    setTimeout(() => {
      service.updateCharacteristic(this.Characteristic.On, false);
    }, chime.autoOffMs);
  }
}
