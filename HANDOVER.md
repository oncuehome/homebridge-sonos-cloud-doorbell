# Your Sonos Doorbell Announcements

## What this does

When someone presses your doorbell, your Sonos speakers announce it — over
the top of whatever is already playing.

The important part: your music doesn't stop. Older ways of doing this
hijacked the speaker to play the chime, which kicked Spotify, AirPlay or
whatever else was streaming off the speaker and left someone having to
reconnect manually. This doesn't. The music dips briefly, the announcement
plays over it, and the music comes back on its own.

## What you'll hear

A soft two-tone chime, then a voice:

- **Front door** — "Someone's at your front door"
- **Back gate** — "Someone's at your back gate"

Each announcement plays twice per press. That's deliberate — see
"Why it announces twice" below.

## Which speakers

Announcements play on all of these at once:

- Family Room
- Living
- Peter's Office Ray
- Gym
- Move

Where a room has a soundbar with surround speakers, the whole set plays it,
not just the soundbar.

## Why it announces twice

Battery-powered Nest doorbells limit how much they send to the internet, to
preserve battery life. If a visitor presses twice in quick succession, only
the first press is reported — the second never leaves the doorbell.

Rather than depend on something outside our control, the announcement plays
twice from a single press. The result is consistent: every visitor press
produces the same announcement, every time.

## Changing things yourself

Everything below is in Homebridge, under the **Sonos Cloud Doorbell** plugin
settings. After any change, save and restart Homebridge.

**Volume** — currently 55 out of 100. The chime volume is independent of
your music volume, so if it gets lost under loud music, raise this number
rather than expecting it to adjust itself. Each announcement can have its
own volume if you want the gate louder than the door.

**Which speakers** — under "Default Speakers". Adding a speaker needs its
Player ID, not just its name; see the technical notes for how to look those
up.

**How many times it announces** — the "Repeat" setting, currently 2. If you
change it, keep "Gap Between Repeats" above 3 seconds or the announcements
will talk over each other.

**The sounds themselves** — hosted on the On Cue Home website. Replacing
them means uploading a new MP3 and updating the link in the settings.

## If it stops working

**Nothing happens at all when the doorbell is pressed**
Check the doorbell itself is working — does its own built-in chime still
sound? If not, the problem is the doorbell, not this. If it does chime but
the speakers stay silent, check Homebridge is running.

**Some speakers announce, others don't**
The Homebridge log names the speaker that failed and why. Most often it's a
speaker that's powered off, or the Move being away from its base and out of
range.

**It worked, then stopped completely after a few months**
The connection to Sonos uses an access token that renews itself
automatically, but can expire if the system is offline for a long stretch or
if the Sonos account password changes. Re-authorising takes a few minutes —
see the technical notes, or get in touch.

**Announcements play but the music stops**
That shouldn't happen. Worth reporting.

## Requirements worth knowing

- **Internet connection.** Announcements go via Sonos's cloud service, so if
  your internet is down, they won't play. The doorbell's own chime is
  unaffected.
- **Speaker compatibility.** All your speakers support this. Much older
  Sonos models (Play:1, Play:3, original Play:5, Connect) don't, so if you
  add speakers later, worth checking.

## Support

On Cue Home
hello@oncuehome.com
+44 (0)203 627 0738
