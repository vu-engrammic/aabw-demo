#!/usr/bin/env node
const { runSessionBridge } = require('../lib/session-bridge');

runSessionBridge().then((out) => {
  process.stdout.write(JSON.stringify(out));
});
