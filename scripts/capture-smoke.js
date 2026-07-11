#!/usr/bin/env node
/**
 * Smoke test MCP capture write-back (remember → learn).
 */
const http = require('node:http');
const { captureViaMcp } = require('../services/gateway/lib/engrammic-mcp');
const { mcpConfig } = require('../services/gateway/lib/mcp-config');

const GATEWAY = process.env.AABW_GATEWAY || 'http://127.0.0.1:8790';
const HOOK_SECRET = process.env.LIVE_HOOK_SECRET || 'aabw-live-dev-secret';

function request(method, path, body, cookie) {
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
          ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 30_000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null, cookie: res.headers['set-cookie'] });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const cfg = mcpConfig();
  if (!cfg.token) {
    console.error('MCP token missing — run npm run mcp:login');
    process.exit(1);
  }

  const stamp = Date.now();
  const direct = await captureViaMcp({
    title: `AABW capture smoke ${stamp}`,
    content: `Smoke test practice ${stamp}: validate DPI before OCR batch jobs.`,
    whyItWorked: 'Reduces false negatives on low-quality scans in finance workflows.',
    team: 'Finance',
    user: { userId: 'emp_maya', fullName: 'Maya Chen', department: 'Engineering' },
    harness: 'capture-smoke',
  });

  if (!direct.ok) {
    console.error('captureViaMcp failed:', direct.error);
    process.exit(2);
  }

  console.log('direct capture ok');
  console.log('  memory:', direct.memory?.node_id?.slice(0, 12));
  console.log('  claim:', direct.claimNode?.id?.slice(0, 12));
  if (direct.partial) {
    console.warn('  partial (learn failed):', direct.error);
  }

  const login = await request('POST', '/auth/login', { personaId: 'emp_maya' });
  const cookie = (login.cookie || [])[0]?.split(';')[0] || '';
  const viaGateway = await request(
    'POST',
    '/capture',
    {
      title: `Gateway capture ${stamp}`,
      content: `Gateway smoke capture ${stamp} for expense automation.`,
      whyItWorked: 'Hook + companion path uses same unified capture.',
      harness: 'capture-smoke',
    },
    cookie,
  );

  if (viaGateway.status !== 200 || viaGateway.data?.source !== 'engrammic-mcp') {
    console.error('POST /capture failed:', viaGateway.status, viaGateway.data);
    process.exit(3);
  }

  console.log('gateway /capture:', viaGateway.data?.source, viaGateway.data?.trace?.claimId?.slice(0, 12));

  const hookPayload = JSON.stringify({
    title: `Hook capture ${stamp}`,
    content: `Harness hook capture ${stamp}.`,
    harness: 'harness',
  });
  const hookRes = await new Promise((resolve, reject) => {
    const url = new URL('/live/capture', GATEWAY);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(hookPayload),
          'x-aabw-hook-secret': HOOK_SECRET,
        },
        timeout: 30_000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }));
      },
    );
    req.on('error', reject);
    req.write(hookPayload);
    req.end();
  });

  if (hookRes.status !== 200) {
    console.error('POST /live/capture failed:', hookRes.status, hookRes.data);
    process.exit(4);
  }
  console.log('hook /live/capture:', hookRes.data?.source, hookRes.data?.trace?.claimId?.slice(0, 12));

  const pass = direct.memory?.node_id && (direct.claimNode?.id || direct.partial);
  console.log(pass ? '\nCapture smoke PASSED' : '\nCapture smoke FAILED');
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
