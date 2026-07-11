#!/usr/bin/env node
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });

const { probeGmail } = require('../../services/gateway/lib/connectors/gmail');
const { syncGmail } = require('../../services/gateway/lib/connectors');

const user = { userId: 'connector-probe', fullName: 'Connector Probe', department: 'Engineering' };

async function main() {
  const doSync = process.argv.includes('--sync');
  console.log('--- Connector probe ---');

  const gmail = await probeGmail();
  console.log('Gmail:', gmail.ok ? `OK · ${gmail.email}` : gmail.error);

  if (!gmail.ok) process.exit(1);

  if (doSync) {
    console.log('\n--- Test sync (limit 5) ---');
    const g = await syncGmail(user, { limit: 5 });
    console.log('Gmail sync:', g);
  }

  console.log('\nProbe complete');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
