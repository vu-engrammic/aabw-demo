#!/usr/bin/env node
/** Copy companion UI into Electron app bundle. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'apps', 'companion', 'ui');
const DEST = path.join(ROOT, 'apps', 'desktop', 'companion-ui');
const LOGO_SRC = path.join(ROOT, 'apps', 'desktop', 'build', 'icon.png');
const LOGO_DEST = path.join(DEST, 'logo.png');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(SRC)) {
  console.error('Missing', SRC);
  process.exit(1);
}
if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });
copyDir(SRC, DEST);
if (fs.existsSync(LOGO_SRC)) fs.copyFileSync(LOGO_SRC, LOGO_DEST);
console.log('Synced companion UI → apps/desktop/companion-ui/');
