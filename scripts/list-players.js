#!/usr/bin/env node
'use strict';

/**
 * Quick lookup: list every household + speaker (with playerId) using a
 * refresh token you already have (e.g. from config.json). No browser
 * login needed — this reuses the token from the one-time authorize step.
 *
 * Usage:
 *   node scripts/list-players.js --clientId=xxx --clientSecret=yyy --refreshToken=zzz
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const clientId = args.clientId;
const clientSecret = args.clientSecret;
const refreshToken = args.refreshToken;

if (!clientId || !clientSecret || !refreshToken) {
  console.error(
    'Usage: node scripts/list-players.js --clientId=xxx --clientSecret=yyy --refreshToken=zzz'
  );
  process.exit(1);
}

async function main() {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

  const tokenRes = await fetch('https://api.sonos.com/login/v3/oauth/access', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    console.error(`Token refresh failed (${tokenRes.status}):`, await tokenRes.text());
    process.exit(1);
  }
  const { access_token } = await tokenRes.json();

  const householdsRes = await fetch('https://api.ws.sonos.com/control/api/v1/households', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const { households } = await householdsRes.json();

  for (const h of households || []) {
    const groupsRes = await fetch(`https://api.ws.sonos.com/control/api/v1/households/${h.id}/groups`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const data = await groupsRes.json();
    console.log(`\nHousehold: ${h.id}`);
    for (const p of data.players || []) {
      const audioClipCapable = (p.devices || []).some((d) => (d.capabilities || []).includes('AUDIO_CLIP'));
      console.log(`  - ${p.name}  ->  playerId: ${p.id}${audioClipCapable ? '' : '  (no audioClip support)'}`);
    }
  }
}

main();
