#!/usr/bin/env node
/**
 * Gmail connector setup for engineer work accounts.
 * Usage: node scripts/connectors/setup.js [email]
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });

const fs = require('node:fs');
const { loginInteractive: gmailLogin, CLIENT_JSON: GMAIL_JSON } = require('./gmail-login');
const { probeGmail, syncGmail } = require('../../services/gateway/lib/connectors/gmail');

const email = process.argv[2] || process.env.GMAIL_LOGIN_EMAIL || 'vu.le@engrammic.ai';
const user = { userId: 'setup', fullName: email.split('@')[0], department: 'Engineering', email };

function waitForFile(filePath, label, maxMs = 600_000) {
  if (fs.existsSync(filePath)) return Promise.resolve(true);
  console.log(`\nWaiting for ${label}…`);
  console.log(`  Drop file at: ${filePath}`);
  console.log('  (polling every 3s, up to 10 min)\n');
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (fs.existsSync(filePath)) return resolve(true);
      if (Date.now() - start > maxMs) return resolve(false);
      setTimeout(tick, 3000);
    };
    tick();
  });
}

async function ensureGmail() {
  let probe = await probeGmail();
  if (probe.ok) {
    console.log('Gmail already connected:', probe.email);
    return probe;
  }

  if (!process.env.GMAIL_CLIENT_ID && !fs.existsSync(GMAIL_JSON)) {
    console.log('\n=== Gmail setup ===');
    console.log('Create OAuth client (Desktop app) and save JSON, or set GMAIL_CLIENT_ID/SECRET in .env');
    const ready = await waitForFile(GMAIL_JSON, 'Gmail OAuth client JSON');
    if (!ready && !process.env.GMAIL_CLIENT_ID) {
      throw new Error('Gmail OAuth client not provided');
    }
  }

  console.log('\n=== Gmail OAuth ===');
  await gmailLogin(email);
  probe = await probeGmail();
  if (!probe.ok) throw new Error(`Gmail probe failed: ${probe.error}`);
  console.log('Gmail connected:', probe.email);
  return probe;
}

async function testSync() {
  console.log('\n=== Test ingest sync (limit 3) ===');
  const g = await syncGmail(user, { limit: 3 });
  console.log('Gmail:', g.ok ? `${g.ingested} ingested, ${g.skipped} skipped` : g.error);
  if (g.errors?.length) console.log('  errors:', g.errors.slice(0, 3));
}

async function main() {
  console.log(`AABW connector setup for ${email}\n`);
  await ensureGmail();
  await testSync();
  console.log('\nSetup complete — restart gateway if it was already running.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
