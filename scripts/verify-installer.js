#!/usr/bin/env node
/**
 * Verify packaged installer layout before/after electron-builder.
 * Usage: node scripts/verify-installer.js [win-unpacked-dir]
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const UNPACKED = process.argv[2]
  || path.join(ROOT, 'apps', 'desktop', 'dist', 'win-unpacked');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function mustExist(rel) {
  const p = path.join(UNPACKED, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  ok(rel);
}

async function main() {
  console.log('=== Installer verify ===\n');
  console.log('Unpacked:', UNPACKED);

  if (!fs.existsSync(UNPACKED)) fail(`unpacked dir not found: ${UNPACKED}`);

  mustExist('Engrammic Companion.exe');
  mustExist('resources/aabw/runtime/node.exe');
  mustExist('resources/aabw/scripts/start-stack.js');
  mustExist('resources/aabw/services/gateway/server.js');
  mustExist('resources/aabw/services/gateway/lib/device-setup.js');
  mustExist('resources/aabw/scripts/mcp-login.js');
  mustExist('resources/app.asar');

  const runtime = path.join(UNPACKED, 'resources', 'aabw');
  const nodeBin = path.join(runtime, 'runtime', 'node.exe');
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(path.join(runtime, 'services', 'gateway', 'lib', 'device-setup'));
    ok('device-setup loads from bundled runtime');
  } catch (err) {
    fail(`device-setup require failed: ${err.message}`);
  }

  console.log('\nStarting gateway (15s timeout, companion skipped)…');
  const stackScript = path.join(runtime, 'scripts', 'start-stack.js');
  const child = spawn(nodeBin, [stackScript], {
    cwd: runtime,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, AABW_HOME: runtime, AABW_SKIP_COMPANION: '1' },
  });

  let gateway = false;
  for (let i = 0; i < 50; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    gateway = gateway || (await ping('http://127.0.0.1:8790/health'));
    if (gateway) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
  }

  try {
    child.kill();
  } catch {
    // ignore
  }

  if (!gateway) fail('gateway did not respond on :8790');
  ok('gateway :8790 (companion UI is in the desktop app, not :8792)');

  console.log('\n=== Installer verify PASSED ===');
}

main().catch((err) => fail(err.message || String(err)));
