#!/usr/bin/env node
const { startStack } = require('./start-stack');

startStack({ openCompanion: true, startWeb: false })
  .then((status) => {
    console.log('\nEngrammic Org Memory\n');
    if (status.gateway) console.log('  Gateway    http://127.0.0.1:8790/health');
    if (status.companion) console.log('  Companion  http://127.0.0.1:8792/');
    console.log('\nSign in inside the companion window. Logs: %USERPROFILE%\\.cursor\\aabw-stack.log\n');
    if (!status.gateway || !status.companion) process.exit(1);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
