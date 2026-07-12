const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveHome, workspaceLabel } = require('./home');

const GATEWAY = process.env.AABW_GATEWAY || 'http://127.0.0.1:8790';
const HOOK_SECRET = process.env.LIVE_HOOK_SECRET || 'aabw-live-dev-secret';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(raw));
  });
}

function readHookPersonaId() {
  try {
    const cfgPath = path.join(os.homedir(), '.cursor', 'aabw.json');
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return raw.livePersona || raw.defaultPersona || null;
  } catch {
    return null;
  }
}

function firePost(pathname, body) {
  try {
    const url = new URL(pathname, GATEWAY);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'x-aabw-hook-secret': HOOK_SECRET,
        },
        timeout: 3000,
      },
      (res) => {
        res.resume();
      }
    );
    req.on('error', () => {});
    req.on('timeout', () => {
      req.destroy();
    });
    req.write(payload);
    req.end();
  } catch {
    // Never block the harness on hook failures.
  }
}

function postJson(pathname, body) {
  return new Promise((resolve) => {
    const url = new URL(pathname, GATEWAY);
    const payload = JSON.stringify(body);
    let buf = '';
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'x-aabw-hook-secret': HOOK_SECRET,
        },
        timeout: 8000,
      },
      (res) => {
        res.on('data', (c) => {
          buf += c;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: buf ? JSON.parse(buf) : null });
          } catch {
            resolve({ status: res.statusCode, data: null });
          }
        });
      }
    );
    req.on('error', () => resolve({ status: 0, data: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, data: null });
    });
    req.write(payload);
    req.end();
  });
}

async function runPromptBridge() {
  if (!resolveHome()) return { continue: true };

  try {
    const raw = await readStdin();
    const input = raw ? JSON.parse(raw) : {};
    const prompt = String(input.prompt || '').trim();
    const workspace =
      process.env.CURSOR_PROJECT_DIR ||
      input.cwd ||
      (Array.isArray(input.workspace_roots) ? input.workspace_roots[0] : null);

    if (prompt) {
      const personaId = readHookPersonaId();
      firePost('/live/prompt', {
        prompt,
        harness: input.hook_event_name === 'UserPromptSubmit' ? 'claude' : 'cursor',
        workspace,
        workspaceLabel: workspaceLabel(workspace),
        personaId,
        conversationId: input.conversation_id || null,
        generationId: input.generation_id || null,
        model: input.model || input.model_id || null,
        event: input.hook_event_name || 'beforeSubmitPrompt',
      });
    }
  } catch {
    // Never block the harness on hook failures.
  }

  return { continue: true };
}

module.exports = { runPromptBridge, firePost, postJson, readStdin };
