# Publishing this to the Homebridge community

There's no separate "Homebridge Marketplace" to submit to — the Plugins tab
in the Homebridge UI searches **npm** directly for any package whose name
starts with `homebridge-` (or is scoped) and has `"homebridge-plugin"` in its
`keywords`. This package already has both, so publishing it to npm is the
whole job. Verified/Certified badges are a separate, optional step (see
bottom).

## 1. Put it on GitHub (recommended, not required)

Not strictly necessary to publish, but makes the `repository`/`bugs`/
`homepage` fields in `package.json` real instead of placeholders, and gives
people somewhere to file issues. Create a public repo, push this folder's
contents to it, then update those three fields in `package.json` to your
actual GitHub URL.

## 2. Create an npm account

If you don't already have one: [npmjs.com/signup](https://www.npmjs.com/signup)

## 3. Check the name is available

```bash
npm view homebridge-sonos-cloud-doorbell
```

If that returns "404 Not Found," the name is free. If someone's already
taken it, either pick a different name (update `"name"` in `package.json`)
or publish under an npm scope tied to your account, e.g.
`@oncuehome/homebridge-sonos-cloud-doorbell` (update the `name` field
accordingly, and use `npm publish --access public` in that case, since
scoped packages default to private).

## 4. Log in and publish

```bash
npm login
npm publish
```

That's it — it should now be installable by anyone via `npm install -g
homebridge-sonos-cloud-doorbell` or found by searching "Sonos Cloud
Doorbell" in the Homebridge UI's Plugins tab within a few minutes to a few
hours (npm's search index isn't instant).

## 5. Publishing updates later

Bump the version in `package.json` (semver — patch for fixes, minor for new
features, major for breaking changes), then:

```bash
npm publish
```

## Optional: Homebridge Verified Plugin status

Homebridge maintains a curated list of plugins that have passed a manual
review (shows a green checkmark badge in the UI, like the other plugins in
your Plugins tab). This is optional and separate from just being installable
— see [github.com/homebridge/homebridge/wiki/Verified-Plugins](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
for their current requirements and submission process. Worth doing once
you've had a few real users and are happy with the plugin's stability, not
necessary for anyone to install and use it in the meantime.
