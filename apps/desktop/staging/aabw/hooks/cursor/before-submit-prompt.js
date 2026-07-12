#!/usr/bin/env node
const { runPromptBridge } = require('../lib/prompt-bridge');

runPromptBridge().then((out) => {
  process.stdout.write(JSON.stringify(out));
});
