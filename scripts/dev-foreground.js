#!/usr/bin/env node
/**
 * Foreground dev mode — gateway logs in terminal.
 */
const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function wait(url, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= attempts) reject(new Error('timeout ' + url));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

const children = [];
function start(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  children.push(child);
}

start(process.execPath, ['services/gateway/server.js']);

wait('http://127.0.0.1:8790/health')
  .then(() => {
    console.log('\nEngrammic dev gateway: http://127.0.0.1:8790/health');
    console.log('UI: open the Engrammic desktop app\n');
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });

function shutdown() {
  for (const c of children) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /F /T /PID ${c.pid}`, { stdio: 'ignore' });
      else c.kill('SIGTERM');
    } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
