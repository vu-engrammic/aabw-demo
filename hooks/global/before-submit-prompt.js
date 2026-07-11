#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function aabwHome() {
  if (process.env.AABW_HOME) return process.env.AABW_HOME;
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), '.cursor', 'aabw.json'), 'utf8')
    );
    return cfg.home || null;
  } catch {
    return null;
  }
}

async function main() {
  const home = aabwHome();
  if (!home) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }
  const { runPromptBridge } = require(path.join(home, 'hooks', 'lib', 'prompt-bridge'));
  const out = await runPromptBridge();
  process.stdout.write(JSON.stringify(out));
}

main();
