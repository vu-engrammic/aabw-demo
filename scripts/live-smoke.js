#!/usr/bin/env node
/**
 * Smoke test live prompt ingest + SSE snapshot.
 */
const http = require('node:http');

const GATEWAY = process.env.AABW_GATEWAY || 'http://127.0.0.1:8790';
const HOOK_SECRET = process.env.LIVE_HOOK_SECRET || 'aabw-live-dev-secret';
const SSE_TIMEOUT_MS = 25_000;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GATEWAY);
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          ...(body
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
                'x-aabw-hook-secret': HOOK_SECRET,
              }
            : {}),
        },
        timeout: 8000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForPromptEvent() {
  return new Promise((resolve, reject) => {
    const url = new URL('/live/stream', GATEWAY);
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('SSE timeout waiting for prompt event'));
    }, SSE_TIMEOUT_MS);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: { accept: 'text/event-stream' },
      },
      (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
            if (eventLine !== 'event: prompt') continue;
            const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;
            clearTimeout(timer);
            req.destroy();
            resolve(JSON.parse(dataLine.slice(6)));
            return;
          }
        });
        res.on('end', () => {
          clearTimeout(timer);
          reject(new Error('SSE ended before prompt event'));
        });
      }
    );
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

async function main() {
  const health = await request('GET', '/health');
  if (health.status !== 200) throw new Error('gateway not healthy');

  const sseWait = waitForPromptEvent();
  const ingest = await request('POST', '/live/prompt', {
    prompt: 'expense automation invoice ocr',
    harness: 'smoke',
    workspace: process.cwd(),
  });

  if (ingest.status !== 200 || !ingest.data?.ok) {
    throw new Error('live prompt ingest failed: ' + JSON.stringify(ingest.data));
  }

  const event = await sseWait;
  const itemCount =
    (event.pack?.capabilities?.length || 0) +
    (event.pack?.claims?.length || 0) +
    (event.pack?.beliefs?.length || 0) +
    (event.pack?.observations?.length || 0);
  const liveState = await request('GET', '/live/state');
  const promptMatched =
    liveState.data?.lastPrompt?.includes('invoice') && event.prompt?.includes('invoice');
  const pass = promptMatched && event.pack?.source !== 'local-demo';

  console.log('live ingest ok (async:', Boolean(ingest.data?.async), ')');
  console.log('recalled items:', itemCount, 'source:', event.pack?.source || event.source);
  if (itemCount === 0) {
    console.warn('Warning: empty recall — MCP may be offline or query off corpus');
  }
  if (event.suggestion) console.log('suggestion:', event.suggestion.text?.slice(0, 80));
  console.log('live state prompt:', liveState.data?.lastPrompt?.slice(0, 60));
  console.log(pass ? '\nLive smoke PASSED' : '\nLive smoke FAILED');
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
