#!/usr/bin/env node
/**
 * Start gateway + web + companion silently (no terminal windows on Windows).
 * Used by Cursor hooks, npm start, and manual recovery.
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const LOG = path.join(os.homedir(), '.cursor', 'aabw-stack.log');
const GATEWAY = 'http://127.0.0.1:8790/health';
const WEB = 'http://127.0.0.1:5173/';
const COMPANION = 'http://127.0.0.1:8792/health';

function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // ignore log failures
  }
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnHidden(command, args, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  });
  child.unref();
  log(`spawn ${command} ${args.join(' ')} (cwd=${cwd})`);
  return child;
}

function viteBin() {
  const candidates = [
    path.join(root, 'apps', 'web', 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function companionBin() {
  const candidates = [
    path.join(root, 'apps', 'companion', 'aabw-companion.exe'),
    path.join(root, 'apps', 'companion', 'aabw-companion'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function companionUiStale() {
  const bin = companionBin();
  const uiDir = path.join(root, 'apps', 'companion', 'ui');
  if (!fs.existsSync(uiDir)) return false;
  if (!bin) return true;
  const binMtime = fs.statSync(bin).mtimeMs;
  for (const name of fs.readdirSync(uiDir)) {
    const p = path.join(uiDir, name);
    if (!fs.statSync(p).isFile()) continue;
    if (fs.statSync(p).mtimeMs > binMtime) return true;
  }
  return false;
}

function killPort(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
        log(`killed pid ${pid} on port ${port}`);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function buildCompanion() {
  const mainGo = path.join(root, 'apps', 'companion', 'main.go');
  if (!fs.existsSync(mainGo)) return false;
  try {
    log('building companion binary');
    execFileSync('go', ['build', '-o', 'aabw-companion.exe', '.'], {
      cwd: path.join(root, 'apps', 'companion'),
      stdio: 'ignore',
      windowsHide: true,
    });
    return Boolean(companionBin());
  } catch (err) {
    log(`companion build failed: ${err.message}`);
    return false;
  }
}

async function waitFor(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await ping(url)) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function ensureGateway() {
  if (await ping(GATEWAY)) return true;
  killPort(8790);
  await new Promise((r) => setTimeout(r, 300));
  spawnHidden(process.execPath, [path.join(root, 'services', 'gateway', 'server.js')]);
  return waitFor(GATEWAY);
}

async function ensureWeb() {
  if (await ping(WEB)) return true;
  const bin = viteBin();
  if (!bin) {
    log('vite binary not found — run npm install');
    return false;
  }
  spawnHidden(process.execPath, [bin, '--host', '127.0.0.1'], path.join(root, 'apps', 'web'));
  return waitFor(WEB);
}

function focusCompanion() {
  return new Promise((resolve) => {
    http.get('http://127.0.0.1:8792/focus', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

async function focusCompanionWithRetry(attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await focusCompanion()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function ensureCompanion(openWindow = true) {
  const stale = companionUiStale();
  const up = await ping(COMPANION);

  if (up && stale) {
    log('companion UI newer than binary — rebuilding and restarting');
    killPort(8792);
    await new Promise((r) => setTimeout(r, 400));
  } else if (up && !stale) {
    if (openWindow) await focusCompanionWithRetry();
    return true;
  }

  if (!companionBin() || stale) buildCompanion();

  let bin = companionBin();
  if (bin) {
    spawnHidden(bin, [], path.join(root, 'apps', 'companion'));
  } else if (fs.existsSync(path.join(root, 'apps', 'companion', 'main.go'))) {
    spawnHidden('go', ['run', '.'], path.join(root, 'apps', 'companion'));
  } else {
    log('companion not found');
    return false;
  }

  const ok = await waitFor(COMPANION);
  if (ok && openWindow) await focusCompanionWithRetry();
  return ok;
}

async function startStack({ openCompanion = true } = {}) {
  log('start-stack begin');
  const gatewayOk = await ensureGateway();
  const companionOk = await ensureCompanion(openCompanion);

  const status = { gateway: gatewayOk, companion: companionOk };
  log(`start-stack done ${JSON.stringify(status)}`);
  return status;
}

module.exports = { startStack, ping, GATEWAY, WEB, COMPANION };

if (require.main === module) {
  startStack({ openCompanion: true })
    .then((status) => {
      console.log('AABW stack:', status);
      if (status.gateway) console.log('  Gateway    http://127.0.0.1:8790/health');
      if (status.companion) console.log('  Companion  http://127.0.0.1:8792/');
      if (!status.gateway || !status.companion) process.exit(1);
    })
    .catch((err) => {
      log(`start-stack error: ${err.message}`);
      console.error(err.message);
      process.exit(1);
    });
}
