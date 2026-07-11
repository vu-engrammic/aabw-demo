#!/usr/bin/env node
/**
 * Start gateway silently (desktop app, Cursor hooks, dev).
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const LOG = path.join(os.homedir(), '.cursor', 'aabw-stack.log');
const GATEWAY = 'http://127.0.0.1:8790/health';

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
    env: { ...process.env },
  });
  child.unref();
  log(`spawn ${command} ${args.join(' ')} (cwd=${cwd})`);
  return child;
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

async function startStack() {
  log('start-stack begin');
  const gatewayOk = await ensureGateway();
  const status = { gateway: gatewayOk };
  log(`start-stack done ${JSON.stringify(status)}`);
  return status;
}

module.exports = { startStack, ping, GATEWAY };

if (require.main === module) {
  startStack()
    .then((status) => {
      console.log('Engrammic gateway:', status);
      if (status.gateway) console.log('  http://127.0.0.1:8790/health');
      if (!status.gateway) process.exit(1);
    })
    .catch((err) => {
      log(`start-stack error: ${err.message}`);
      console.error(err.message);
      process.exit(1);
    });
}
