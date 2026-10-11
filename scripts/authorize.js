#!/usr/bin/env node
'use strict';

/**
 * One-time setup helper.
 *
 * Run this ONCE per Sonos household to get a refresh token for your
 * config.json. Sonos requires the Redirect URI on file to be a real,
 * publicly-routable HTTPS URL — it will NOT accept localhost — so this
 * script uses a manual copy/paste flow instead of running a local server:
 * you log in in a browser, then paste the resulting URL back into the
 * terminal.
 *
 * Usage:
 *   node scripts/authorize.js --clientId=xxx --clientSecret=yyy
 *
 * Before running: in the Sonos Developer portal (developer.sonos.com),
 * create a "Control" integration and set BOTH the Redirect URI and the
 * Event Callback URL to:
 *   https://example.com/callback
 * (It's never actually called — Sonos only validates that it's a real
 * HTTPS URL. You'll copy the code out of the browser address bar instead.)
 */

const crypto = require('crypto');
const readline = require('readline');
const { URL } = require('url');
void URL; // URL global is also available without this import on modern Node; kept explicit for clarity

const REDIRECT_URI = 'https://example.com/callback';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const clientId = args.clientId || process.env.SONOS_CLIENT_ID;
const clientSecret = args.clientSecret || process.env.SONOS_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/authorize.js --clientId=xxx --clientSecret=yyy');
  process.exit(1);
}

const state = crypto.randomBytes(12).toString('hex');

const authorizeUrl =
  'https://api.sonos.com/login/v3/oauth' +
  `?client_id=${encodeURIComponent(clientId)}` +
  '&response_type=code' +
  `&state=${state}` +
  '&scope=playback-control-all' +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch('https://api.sonos.com/login/v3/oauth/access', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function listPlayers(accessToken) {
  const householdsRes = await fetch('https://api.ws.sonos.com/control/api/v1/households', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { households } = await householdsRes.json();

  const out = [];
  for (const h of households || []) {
    const groupsRes = await fetch(`https://api.ws.sonos.com/control/api/v1/households/${h.id}/groups`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await groupsRes.json();
    out.push({ householdId: h.id, players: data.players || [] });
  }
  return out;
}

function askForPastedUrl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      '\nAfter approving, your browser will land on an example.com page (that\'s expected — ' +
        'we never run a server there). Copy the FULL URL from the address bar and paste it here:\n\n> ',
      (answer) => {
        rl.close();
        resolve(answer.trim());
      }
    );
  });
}

async function main() {
  console.log('Open this URL in a browser and log in with your Sonos account:\n');
  console.log(authorizeUrl + '\n');

  const pasted = await askForPastedUrl();

  let parsed;
  try {
    parsed = new URL(pasted);
  } catch {
    console.error('That doesn\'t look like a URL. Copy the whole address bar contents and try again.');
    process.exit(1);
  }

  const returnedState = parsed.searchParams.get('state');
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error');

  if (error) {
    console.error(`Sonos returned an error: ${error}`);
    process.exit(1);
  }
  if (!code) {
    console.error('No "code" parameter found in that URL — make sure you pasted the address after logging in and approving.');
    process.exit(1);
  }
  if (returnedState !== state) {
    console.error('State mismatch — the pasted URL doesn\'t match this session. Run the script again and use a fresh link.');
    process.exit(1);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const householdInfo = await listPlayers(tokens.access_token);

    console.log('\n=== Success ===\n');
    console.log('Add this to your Homebridge config.json platform block:\n');
    console.log(
      JSON.stringify(
        {
          platform: 'SonosCloudDoorbell',
          clientId,
          clientSecret,
          refreshToken: tokens.refresh_token,
        },
        null,
        2
      )
    );

    console.log('\nYour speakers (copy the playerId values you want into the "players" array):\n');
    for (const h of householdInfo) {
      console.log(`Household: ${h.householdId}`);
      for (const p of h.players) {
        console.log(`  - ${p.name}  ->  playerId: ${p.id}`);
      }
    }
    console.log(
      '\nExample "players" entry:\n' +
        JSON.stringify([{ name: 'Kitchen', playerId: '<paste playerId here>' }], null, 2)
    );
  } catch (e) {
    console.error('Failed to complete setup:', e.message);
    process.exit(1);
  }
}

main();
