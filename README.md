# Homebridge Sonos Cloud Doorbell

A HomeKit switch that plays a chime on your Sonos speakers using Sonos's
**Cloud `audioClip` API** — instead of the local UPnP play-then-restore trick
that plugins like `homebridge-sonos-alert` use.

## Why this exists

Most "play a sound on Sonos" plugins hijack each speaker's transport to play
the chime, then try to snapshot and restore whatever was playing before. That
restore step is unreliable for streaming sources — Spotify Connect, AirPlay,
etc. — because Sonos has no reliable way to save/resume that kind of session
over local UPnP. In practice this means every time your doorbell rings, it
kicks anyone listening off whatever they were streaming, forcing a manual
reconnect.

`audioClip` is Sonos's own purpose-built solution: it **ducks** (temporarily
lowers) whatever's currently playing, layers the clip on top, and
un-ducks/resumes automatically — the transport session is never torn down.
It's also faster, since it doesn't have to query and restore state.

## Hardware requirements

`audioClip` only works on Sonos speakers that advertise the `AUDIO_CLIP`
capability. All current S2 hardware supports it, including: **One, One SL,
Amp, Port, Beam, Play:5 (gen 2), Move, and the Symfonisk range.** Home theater
setups (soundbar + bonded surrounds/sub) work automatically — Sonos exposes
the whole bonded system as a single player, so targeting the soundbar's ID
covers the surrounds too.

Older, S1-only/legacy hardware (Play:1, Play:3, original Play:5, Connect,
etc.) is **not** supported for this feature by Sonos, regardless of what this
plugin does.

## Install

```bash
npm install -g homebridge-sonos-cloud-doorbell
```

Or search for **"Sonos Cloud Doorbell"** in the Homebridge UI's Plugins tab
and click Install.

## One-time setup

### 1. Register a free Sonos integration

1. Go to [developer.sonos.com](https://developer.sonos.com) and sign in (or
   create an account) with your Sonos account.
2. **My Account → Integrations → New Control Integration.**
3. Give it any name and description, pick the closest category, and continue.
4. Create a key.
5. Sonos requires the **Redirect URI** and **Event Callback URL** fields to
   both be real, HTTPS, publicly-routable URLs — it will silently reject
   `localhost`. Set **both** fields to:
   ```
   https://example.com/callback
   ```
   Neither is ever actually called by this plugin — Sonos only validates
   that the URL is well-formed at registration time. The authorize script
   below uses a copy/paste step instead of a live server, so this is safe.
6. **Important:** after typing a value into a field, look for that field's
   own small "Save" or "Add" button and click it *before* submitting the
   whole form. The portal has a habit of silently discarding edits that
   aren't explicitly saved per-field — if you see "You have sections with
   unsaved changes" when submitting, this is why. Go back and save each
   field individually.
7. Copy the **Key** (Client ID) and **Secret** (Client Secret) somewhere
   safe — treat the Secret like a password.

### 2. Generate a refresh token

From the plugin's install folder (find it with `npm root -g`, then
`cd` into `homebridge-sonos-cloud-doorbell`):

```bash
npm run authorize -- --clientId=YOUR_KEY --clientSecret=YOUR_SECRET
```

This prints a `https://api.sonos.com/login/v3/oauth?...` URL. Open it in any
browser, log in with your Sonos account, and approve the integration. You'll
land on a generic example.com page — that's expected, ignore the page
content. **Copy the full URL from the address bar** (it'll have
`?code=...&state=...` on the end) and paste it back into the terminal when
prompted.

If you hit **"Oops, there was a problem"** partway through this flow: this is
a known instability in Sonos's own login page, unrelated to this plugin.
Try, in order: a private/incognito browser window, a different browser
entirely, or deleting and recreating the integration from scratch in the
developer portal (a clean key has resolved this every time in testing).

The script then prints:

- A ready-to-paste `config.json` platform block, with your refresh token
- Every speaker's name and `playerId` in your household(s)

### 3. Configure

Each entry under `chimes` becomes its own HomeKit switch, with its own
sound, volume and target speakers:

```json
{
  "platform": "SonosCloudDoorbell",
  "clientId": "YOUR_KEY",
  "clientSecret": "YOUR_SECRET",
  "refreshToken": "PASTE_FROM_STEP_2",
  "volume": 55,
  "players": [
    { "name": "Kitchen", "playerId": "RINCON_XXXXXXXXXXXX01400" },
    { "name": "Study",   "playerId": "RINCON_YYYYYYYYYYYY01400" }
  ],
  "chimes": [
    {
      "name": "Front Door",
      "chimeUrl": "https://example.com/front-door.mp3"
    },
    {
      "name": "Driveway Gate",
      "chimeUrl": "https://example.com/gate.mp3",
      "volume": 65,
      "players": [
        { "name": "Kitchen", "playerId": "RINCON_XXXXXXXXXXXX01400" }
      ]
    }
  ]
}
```

Above, "Front Door" plays on both default speakers at volume 55; "Driveway
Gate" overrides both, playing only in the Kitchen at 65. Anything a chime
omits falls back to the top-level value, so shared settings are written once.

**Config reference:**

| Field | Required | Notes |
|---|---|---|
| `clientId` / `clientSecret` / `refreshToken` | Yes | From setup above |
| `chimes[].name` | Yes | HomeKit switch name. Must be unique — renaming one replaces its accessory |
| `chimes[].chimeUrl` | No | HTTPS URL to an MP3/WAV. Blank uses Sonos's built-in tone |
| `chimes[].volume` | No | 0–100. Volume is absolute, not relative to current playback — if a chime gets buried under loud music, raise this rather than expecting Sonos's ducking to compensate |
| `chimes[].players` | No | Speakers for this chime; falls back to top-level `players` |
| `chimes[].repeat` | No | Times to sound per press, 1–5 (default `1`). See below |
| `chimes[].repeatGapSeconds` | No | Seconds between repeats, 0.5–30 (default `4`) |
| `chimes[].priority` | No | `"HIGH"` (default) or `"LOW"` |
| `chimes[].autoOffSeconds` | No | Switch reset delay (cosmetic; default `1`) |
| `players` | Yes* | Default speakers. *Required unless every chime lists its own |
| `volume` / `priority` / `autoOffSeconds` | No | Defaults for chimes that don't override them |

Re-run `npm run list-players` any time to get current speaker names and IDs.

**Single-chime configs still work.** The older top-level
`chimeName`/`chimeUrl`/`volume`/`players` shape is still honoured when no
`chimes` array is present, so existing installs need no changes.

Restart Homebridge. Check the log for `Doorbell chime switch ready` to
confirm it loaded.

### 4. Wire up your automation

This plugin exposes one HomeKit **Switch** per configured chime. Point each
"doorbell rings → play sound" automation at the matching switch. Switches
auto-reset to off after `autoOffSeconds` so automations can fire again.

Removing a chime from the config removes its switch on the next restart.

## Repeating the chime

Some doorbells throttle their press events upstream — Nest/Google in
particular will often deliver only the first of several presses made close
together, so a visitor who rings twice is heard once. `repeat` sounds the
clip more than once per trigger to make a single press harder to miss:

```json
{ "name": "Front Door", "chimeUrl": "...", "repeat": 2, "repeatGapSeconds": 4 }
```

Set `repeatGapSeconds` longer than your audio file, or rings will overlap.
A trigger arriving while a repeat sequence is still running is ignored, so
sequences can't interleave.

Note this does not recover a press that never reached HomeKit — it makes
each press that *does* arrive more noticeable.

## Re-checking your speaker list later

If you rename or move speakers, re-run this any time — it reuses your saved
refresh token, no browser login needed:

```bash
npm run list-players -- --clientId=YOUR_KEY --clientSecret=YOUR_SECRET --refreshToken=YOUR_REFRESH_TOKEN
```

## Troubleshooting

**A specific speaker never chimes, but others do:** Check the Homebridge log
for a line like `Chime failed on "SpeakerName": <reason>` — the plugin logs
per-speaker failures without blocking the others. Common causes: the
speaker doesn't support `AUDIO_CLIP` (see Hardware requirements above), or a
battery speaker (Move) was asleep/out of range when the request came in.

**Plugin doesn't show up in the Homebridge UI's Plugins tab after
install:** on some Homebridge setups (particularly the official Raspberry Pi
appliance image using `hb-service`), Homebridge's actual plugin directory is
`/var/lib/homebridge/node_modules`, separate from any system-wide or
nvm-managed Node install. If a manual/local install doesn't appear, confirm
you installed into the same directory your other working plugins are sitting
in.

**Token refresh fails after a long time:** Sonos refresh tokens are
long-lived but not infinite. If calls start failing with a 401 after months
of working fine, re-run the setup script in Step 2 to get a fresh token.

## Limitations

- Requires an internet connection to Sonos's cloud at chime-time (unlike
  purely local plugins) — if your network's uplink is down, the chime won't
  play.
- Calls to all configured speakers fire in parallel, so total latency is
  roughly one network round-trip, not one per speaker.

## License

MIT
