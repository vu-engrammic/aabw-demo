#!/usr/bin/env node
/**
 * Simulate a Cursor prompting & iterating session against /live/prompt.
 * Prints recall counts + suggestions after each step.
 */
const http = require('node:http');

const GATEWAY = process.env.AABW_GATEWAY || 'http://127.0.0.1:8790';
const HOOK_SECRET = process.env.LIVE_HOOK_SECRET || 'aabw-live-dev-secret';

const SEQUENCE = [
  { label: '1 — expense automation', prompt: 'How do we automate invoice OCR for expense reports?' },
  { label: '2 — iterate narrower', prompt: 'expense automation invoice approval workflow' },
  { label: '3 — pivot topic', prompt: 'annual leave policy and PTO carryover rules' },
  { label: '4 — connection probe', prompt: 'Luke testimonies meeting notes customer story' },
  { label: '5 — graph trigger', prompt: 'board pack executive summary quarterly metrics' },
];

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
        timeout: 12000,
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

function itemCount(pack) {
  if (!pack) return 0;
  return (
    (pack.capabilities?.length || 0) +
    (pack.claims?.length || 0) +
    (pack.beliefs?.length || 0) +
    (pack.observations?.length || 0)
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Live sequence test — gateway', GATEWAY);
  console.log('Posting', SEQUENCE.length, 'prompts with 2.5s gaps\n');

  for (const step of SEQUENCE) {
    const res = await request('POST', '/live/prompt', {
      prompt: step.prompt,
      harness: 'sequence-test',
      workspace: process.cwd(),
      workspaceLabel: 'aabw',
      personaId: 'emp_maya',
    });

    const pack = res.data?.pack;
    const items = itemCount(pack);
    const top = [
      ...(pack?.capabilities || []),
      ...(pack?.claims || []),
      ...(pack?.observations || []),
    ][0];
    const sug = res.data?.suggestion;

    console.log(`── ${step.label}`);
    console.log(`   prompt: ${step.prompt.slice(0, 64)}${step.prompt.length > 64 ? '…' : ''}`);
    console.log(`   status: ${res.status} · source: ${pack?.source || res.data?.source || '?'}`);
    console.log(`   recalled: ${items} items${top ? ` · top: "${(top.title || top.content || '').slice(0, 48)}"` : ''}`);
    if (sug?.text) console.log(`   suggestion: ${sug.text.slice(0, 90)}${sug.text.length > 90 ? '…' : ''}`);
    console.log('');

    await sleep(2500);
  }

  const state = await request('GET', '/live/state');
  const feed = state.data?.promptFeed || [];
  console.log('Final /live/state');
  console.log(`   feed entries: ${feed.length}`);
  console.log(`   last prompt: ${(state.data?.lastPrompt || '').slice(0, 72)}`);
  console.log(`   waitingForLive: ${state.data?.waitingForLive}`);
  console.log('\nSequence complete — check companion Live + Graph tabs.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
