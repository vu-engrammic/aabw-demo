#!/usr/bin/env node
/**
 * Smoke test auto-ingest pipeline (extract → remember → learn).
 */
const http = require('node:http');
const { ingestViaMcp } = require('../services/gateway/lib/engrammic-mcp');
const { extractKnowledge } = require('../services/gateway/lib/ingest/extract');
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
  const docText = `# Postmortem ${stamp}\n\nWe decided to always validate DPI before OCR batch jobs.\nRoot cause was low-quality scans in finance workflows.`;

  const extracted = extractKnowledge(docText, { source: 'document', title: `Smoke doc ${stamp}` });
  if (!extracted?.claim) {
    console.error('extractKnowledge failed');
    process.exit(2);
  }

  const direct = await ingestViaMcp({
    ...extracted,
    sourceUri: `doc://smoke/${stamp}`,
    source: 'document',
    team: 'Engineering',
    user: { userId: 'emp_maya', fullName: 'Maya Chen', department: 'Engineering' },
    harness: 'ingest-smoke',
  });

  if (!direct.ok) {
    console.error('ingestViaMcp failed:', direct.error);
    process.exit(3);
  }

  console.log('direct ingest ok');
  console.log('  extracted:', extracted.claim.slice(0, 60));
  console.log('  memory:', direct.memory?.node_id?.slice(0, 12));
  console.log('  claim:', direct.claimNode?.id?.slice(0, 12));

  const login = await request('POST', '/auth/login', { personaId: 'emp_maya' });
  const cookie = (login.cookie || [])[0]?.split(';')[0] || '';

  const viaGateway = await request(
    'POST',
    '/ingest/document',
    { text: docText, label: `Gateway ingest ${stamp}` },
    cookie,
  );

  if (viaGateway.status !== 200 || viaGateway.data?.source !== 'engrammic-mcp') {
    console.error('POST /ingest/document failed:', viaGateway.status, viaGateway.data);
    process.exit(4);
  }

  console.log('gateway /ingest/document:', viaGateway.data?.source, viaGateway.data?.trace?.claimId?.slice(0, 12));

  const connectors = await request('GET', '/connectors', null, cookie);
  if (connectors.status !== 200) {
    console.error('GET /connectors failed:', connectors.status);
    process.exit(5);
  }
  console.log('connectors gmail configured:', connectors.data?.gmail?.configured);

  const hookPayload = JSON.stringify({ text: `Hook ingest smoke ${stamp}: we must run CI before deploy.` });
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
    process.exit(6);
  }
  console.log('hook /live/capture:', hookRes.data?.source, hookRes.data?.trace?.claimId?.slice(0, 12));

  const pass = direct.memory?.node_id && (direct.claimNode?.id || direct.partial);
  console.log(pass ? '\nIngest smoke PASSED' : '\nIngest smoke FAILED');
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
