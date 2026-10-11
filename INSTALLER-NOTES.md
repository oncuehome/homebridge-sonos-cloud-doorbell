# Installer Notes

Practical notes for installing this on a client system. Most of what's here
was learned the hard way and isn't obvious from the code.

## Sonos developer portal

You need one Control Integration per Sonos account, at
[developer.sonos.com](https://developer.sonos.com). The portal is
unreliable in specific ways:

- **Redirect URI and Event Callback URL must both be real HTTPS URLs.**
  `localhost` is rejected. Use `https://example.com/callback` for both —
  neither is ever called, Sonos only validates the format.
- **Each field has its own save button.** Typing a value and hitting submit
  discards it, with a "You have sections with unsaved changes" error and no
  indication of which section. Save each field individually first.
- **"Oops, there was a problem" during login** is a portal-side fault, not
  a config error. Deleting the integration and creating a fresh one has
  resolved it every time. Private browsing sometimes helps.

## Authorisation

`npm run authorize -- --clientId=X --clientSecret=Y` prints a login URL.
Open it, approve, then copy the whole `example.com/callback?code=...` URL
from the address bar back into the terminal.

Refresh tokens rotate on every use and the plugin persists the current one
to `.sonos-cloud-doorbell-token.json` in the Homebridge storage directory.
**Back that file up with the config**, or a restore will resurrect a dead
token. Re-running authorize with a new token in config.json overrides the
stored one automatically.

## Installing on the official Homebridge Pi image (hb-service)

This catches people out. The appliance image is self-contained under
`/opt/homebridge` and `/var/lib/homebridge`, entirely separate from any
system Node or nvm install. Plugins live in
`/var/lib/homebridge/node_modules`.

Install from inside the Homebridge directory, as a local dependency:

```bash
cd /var/lib/homebridge && sudo env PATH="/opt/homebridge/bin:$PATH" \
  /opt/homebridge/bin/npm install /path/to/homebridge-sonos-cloud-doorbell-x.y.z.tgz
```

Do **not** use `--prefix /var/lib/homebridge -g`. That variant installs to
`/var/lib/homebridge/lib/node_modules` (or occasionally
`/opt/homebridge/lib/node_modules`), leaving the plugin invisible to
Homebridge and requiring a manual move. The destination varies between
runs, which makes any follow-up `rm`/`mv` genuinely dangerous — one
mis-pasted line can delete every installed plugin.

If you do need to move things: paste one command at a time. Multi-line
pastes over SSH can arrive with newlines stripped, concatenating commands.

Before any plugin surgery, take a backup via the Homebridge UI. Instance
backups include plugins, config, and HomeKit pairing state, and restore
cleanly without re-pairing bridges.

## Finding speaker IDs

```bash
npm run list-players -- --clientId=X --clientSecret=Y --refreshToken=Z
```

Reuses the saved token, no browser step. Run it again after any room rename
— IDs are stable but names aren't, and the config's `name` field is only a
label for logs.

Bonded home theatre sets (soundbar plus surrounds) appear as a single
player. Target that one ID and the surrounds are included.

## Behaviours worth knowing

**Sonos deduplicates audio clips.** Clips sharing a name and appId are
accepted with HTTP 200 and silently never played if one was recently sent.
The plugin generates a unique name per ring. If you're writing anything else
against this API, you will hit this.

**Refresh races.** Firing at several speakers at once means several parallel
API calls. Because refresh tokens rotate, naive concurrent refreshes
invalidate each other and fail with `invalid_grant`. The plugin
single-flights refreshes; anything else calling this API needs to as well.

**Volume is absolute.** The `volume` setting isn't relative to what's
playing. Sonos ducks the music by a fixed amount you can't control, so
against loud music the answer is raising the clip volume, not expecting the
ducking to compensate.

**Battery Nest doorbells throttle press events.** Only the first of several
rapid presses reaches the cloud. Not fixable downstream — use the `repeat`
option, or build the repeat into the audio file, so one press carries.
Wired doorbells don't have this constraint.

## Audio files

Any HTTPS-reachable MP3 or WAV works. Hosting on the client's own site or a
CDN is fine. Keep clips short — 2 to 5 seconds.

If using `repeat`, set `repeatGapSeconds` comfortably longer than the file,
or rings overlap. Building the repeat into the file gives tighter timing
than two API calls ever will.

## Handover

`HANDOVER.md` is written for the client — plain language, no shell
commands. Give them that, keep this.
