const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { resolveHome, workspaceLabel } = require('./home');
const { postJson, readStdin } = require('./prompt-bridge');

const GATEWAY = process.env.AABW_GATEWAY || 'http://127.0.0.1:8790';

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function ensureGateway(home) {
  const script = path.join(home, 'scripts', 'start-stack.js');
  if (!fs.existsSync(script)) return Promise.resolve(false);

  spawn(process.execPath, [script], {
    cwd: home,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
    env: { ...process.env },
  }).unref();

  return waitFor(`${GATEWAY}/health`);
}

function waitFor(url, attempts = 30) {
  return new Promise((resolve) => {
    let n = 0;
    const tick = async () => {
      n += 1;
      // eslint-disable-next-line no-await-in-loop
      if (await ping(url)) return resolve(true);
      if (n >= attempts) return resolve(false);
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function runSessionBridge() {
  const home = resolveHome();
  if (!home) return {};

  let workspace = process.env.CURSOR_PROJECT_DIR || null;
  try {
    const raw = await readStdin();
    const input = raw ? JSON.parse(raw) : {};
    workspace =
      workspace ||
      (Array.isArray(input.workspace_roots) ? input.workspace_roots[0] : null);
  } catch {
    // ignore parse errors
  }

  // Gateway only — web UI is at http://127.0.0.1:5173/
  await ensureGateway(home);
  await postJson('/live/session', {
    harness: 'cursor',
    workspace,
    workspaceLabel: workspaceLabel(workspace),
    event: 'workspaceOpen',
  });

  return {};
}

module.exports = { runSessionBridge };
