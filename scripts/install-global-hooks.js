#!/usr/bin/env node
/**
 * Install Engrammic hooks globally for Cursor (all repos).
 * Writes ~/.cursor/aabw.json, ~/.cursor/hooks/aabw/*, ~/.cursor/hooks.json
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cursorDir = path.join(os.homedir(), '.cursor');
const hookDir = path.join(cursorDir, 'hooks', 'aabw');
const configPath = path.join(cursorDir, 'aabw.json');
const hooksPath = path.join(cursorDir, 'hooks.json');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function mergeHooks(existing) {
  const ours = {
    workspaceOpen: [{ command: `node ${path.join(hookDir, 'workspace-open.js').replace(/\\/g, '/')}` }],
    beforeSubmitPrompt: [{ command: `node ${path.join(hookDir, 'before-submit-prompt.js').replace(/\\/g, '/')}` }],
  };

  const base = existing && typeof existing === 'object' ? existing : { version: 1, hooks: {} };
  base.version = base.version || 1;
  base.hooks = base.hooks || {};

  for (const [event, entries] of Object.entries(ours)) {
    const current = Array.isArray(base.hooks[event]) ? base.hooks[event] : [];
    const filtered = current.filter((e) => !String(e.command || '').includes('aabw'));
    base.hooks[event] = [...filtered, ...entries];
  }

  return base;
}

function main() {
  fs.mkdirSync(hookDir, { recursive: true });
  fs.mkdirSync(path.join(cursorDir, 'aabw'), { recursive: true });

  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        home: root,
        gateway: process.env.AABW_GATEWAY || 'http://127.0.0.1:8790',
        companion: process.env.AABW_COMPANION_PORT || '8792',
        installedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  copyFile(path.join(root, 'hooks', 'global', 'before-submit-prompt.js'), path.join(hookDir, 'before-submit-prompt.js'));
  copyFile(path.join(root, 'hooks', 'global', 'workspace-open.js'), path.join(hookDir, 'workspace-open.js'));

  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch {
    existing = null;
  }

  const merged = mergeHooks(existing);
  fs.writeFileSync(hooksPath, JSON.stringify(merged, null, 2));

  try {
    const { execFileSync } = require('node:child_process');
    execFileSync('go', ['build', '-o', 'aabw-companion.exe', '.'], {
      cwd: path.join(root, 'apps', 'companion'),
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('  companion binary built');
  } catch {
    console.log('  companion: skipped go build (install Go or run npm run companion:build)');
  }

  try {
    require('./start-stack').startStack({ openCompanion: true }).then((status) => {
      console.log('  stack:', status);
    });
  } catch {
    // non-fatal
  }

  console.log('Engrammic global hooks installed');
  console.log('  config:', configPath);
  console.log('  hooks: ', hooksPath);
  console.log('  home:  ', root);
  console.log('\nReload Cursor to activate hooks in every workspace.');
}

main();
