#!/usr/bin/env node
/**
 * Delete a Hindsight document on the live demo via HTTPS (no gcloud).
 *
 * Requires the gateway DELETE /documents/:id route to be deployed
 * (exec-only). Works against mytasco.engrammic.ai once that code is live.
 *
 * Usage:
 *   node scripts/delete-prod-doc.js
 *   node scripts/delete-prod-doc.js file_3e120df1-d4cb-4932-97f3-6a28bd82d2bb
 *   BASE_URL=https://mytasco.engrammic.ai node scripts/delete-prod-doc.js <id>
 */
const BASE = (process.env.BASE_URL || 'https://mytasco.engrammic.ai').replace(/\/$/, '');
const DOC_ID = process.argv[2] || 'file_3e120df1-d4cb-4932-97f3-6a28bd82d2bb';

function parseSetCookie(res) {
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  return raw
    .map((c) => String(c).split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personaId: 'exec_priya' }),
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok) {
    throw new Error(`Login failed ${login.status}: ${JSON.stringify(loginBody)}`);
  }
  const cookie = parseSetCookie(login);
  if (!cookie) throw new Error('Login ok but no Set-Cookie — cannot call DELETE');

  const del = await fetch(`${BASE}/api/documents/${encodeURIComponent(DOC_ID)}`, {
    method: 'DELETE',
    headers: { cookie },
  });
  const text = await del.text();
  console.log(`DELETE ${DOC_ID} → HTTP ${del.status}`);
  console.log(text);

  if (del.status === 404) {
    console.error(`
Endpoint not on prod yet (404). Ship the RBAC/delete code first, then re-run:

  # No local gcloud needed if GitHub Actions secrets work:
  git push origin main

  # Then:
  node scripts/delete-prod-doc.js ${DOC_ID}
`);
    process.exit(2);
  }
  if (!del.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
