#!/usr/bin/env node
/**
 * Smoke test — hits key gateway endpoints and asserts basic response shape.
 * Requires the gateway to already be running (npm run gateway / npm start).
 *
 * Usage: npm run smoke
 *        GATEWAY_URL=http://127.0.0.1:8790 npm run smoke
 */

const BASE = process.env.GATEWAY_URL || 'http://127.0.0.1:8790';
const PERSONA_ID = process.env.SMOKE_PERSONA || 'emp_maya';

let cookie = null;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok   - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}: ${err.message}`);
  }
}

async function main() {
  console.log(`Smoke testing gateway at ${BASE}\n`);

  await step('GET /health responds ok', async () => {
    const { status, data } = await call('GET', '/health');
    assert(status === 200, `expected 200, got ${status}`);
    assert(data && data.ok === true, 'expected ok:true');
    assert(data.service === 'aabw-org-memory', 'unexpected service name');
  });

  await step('POST /auth/login signs in a dev persona', async () => {
    const { status, data } = await call('POST', '/auth/login', { personaId: PERSONA_ID });
    assert(status === 200, `expected 200, got ${status}`);
    assert(data?.user?.userId === PERSONA_ID, 'expected logged-in persona in response');
    assert(cookie, 'expected session cookie to be set');
  });

  await step('GET /auth/me reflects the session', async () => {
    const { status, data } = await call('GET', '/auth/me');
    assert(status === 200, `expected 200, got ${status}`);
    assert(data?.authenticated === true, 'expected authenticated:true');
  });

  await step('POST /recall returns a context pack', async () => {
    const { status, data } = await call('POST', '/recall', { query: 'onboarding' });
    assert(status === 200, `expected 200, got ${status}`);
    assert(data && typeof data.pack === 'object', 'expected pack object');
    assert(Array.isArray(data.pack.capabilities), 'expected pack.capabilities array');
  });

  await step('GET /conflicts returns a conflicts list', async () => {
    const { status, data } = await call('GET', '/conflicts');
    assert(status === 200, `expected 200, got ${status}`);
    assert(Array.isArray(data?.conflicts), 'expected conflicts array');
  });

  await step('GET /graph returns nodes and edges', async () => {
    const { status, data } = await call('GET', '/graph');
    assert(status === 200, `expected 200, got ${status}`);
    assert(Array.isArray(data?.nodes), 'expected nodes array');
    assert(Array.isArray(data?.edges), 'expected edges array');
  });

  await step('GET /overview returns totals', async () => {
    const { status, data } = await call('GET', '/overview');
    assert(status === 200, `expected 200, got ${status}`);
    assert(data && typeof data.totals === 'object', 'expected totals object');
  });

  await step('GET /mcp/status reports engrammic connectivity', async () => {
    const { status, data } = await call('GET', '/mcp/status');
    assert(status === 200, `expected 200, got ${status}`);
    assert(typeof data?.authenticated === 'boolean', 'expected authenticated boolean');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`\nSmoke test crashed: ${err.message}`);
  console.error('Is the gateway running? Try `npm run gateway` in another terminal.');
  process.exit(1);
});
