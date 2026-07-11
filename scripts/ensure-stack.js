#!/usr/bin/env node
/**
 * @deprecated — use scripts/start-stack.js
 */
const { startStack } = require('./start-stack');

startStack({ openCompanion: false }).then((status) => {
  if (!status.gateway) process.exit(1);
});
