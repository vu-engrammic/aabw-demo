#!/usr/bin/env node
require('../lib/prompt-bridge').runPromptBridge().then((out) => {
  process.stdout.write(JSON.stringify(out));
});
