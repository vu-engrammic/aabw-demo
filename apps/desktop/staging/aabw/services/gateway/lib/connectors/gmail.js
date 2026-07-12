const { extractKnowledge } = require('../ingest/extract');
const { ingestAuto } = require('../ingest/pipeline');
const { hasIngested, markIngested, updateConnector, readState } = require('./state');

async function gmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

function decodeBase64Url(data) {
  const normalized = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function extractEmailBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts || []) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      const nested = extractEmailBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function messageUri(id) {
  return `gmail://message/${id}`;
}

async function syncGmail(user, { limit = 25 } = {}) {
  const token = await gmailAccessToken();
  if (!token) {
    return {
      ok: false,
      error: 'Gmail not configured — set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN',
    };
  }

  const query = process.env.GMAIL_QUERY || 'newer_than:7d';
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('maxResults', String(Math.min(limit, 50)));
  listUrl.searchParams.set('q', query);

  const listRes = await fetch(listUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    return { ok: false, error: `Gmail list HTTP ${listRes.status}` };
  }
  const list = await listRes.json();
  const messages = list.messages || [];

  let ingested = 0;
  let skipped = 0;
  const errors = [];

  for (const ref of messages) {
    const uri = messageUri(ref.id);
    if (hasIngested(uri)) {
      skipped += 1;
      continue;
    }

    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!msgRes.ok) {
      errors.push(`${ref.id}: HTTP ${msgRes.status}`);
      continue;
    }
    const msg = await msgRes.json();
    const headers = msg.payload?.headers || [];
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
    const body = extractEmailBody(msg.payload);
    const text = `${subject}\n\n${body}`.trim();
    if (text.length < 30) {
      skipped += 1;
      continue;
    }

    const extracted = extractKnowledge(text, {
      source: 'gmail',
      subject,
      from,
      title: subject || 'Email',
    });
    if (!extracted) continue;

    const result = await ingestAuto({
      ...extracted,
      sourceUri: uri,
      source: 'gmail',
      team: user?.department || 'Engineering',
      user,
      harness: 'gmail-connector',
    });

    if (!result.ok) {
      errors.push(`${uri}: ${result.error}`);
      continue;
    }

    markIngested(uri, result.trace?.memoryId || result.trace?.claimId);
    ingested += 1;
  }

  const prev = readState().gmail?.ingested || 0;
  updateConnector('gmail', {
    lastSync: new Date().toISOString(),
    ingested: prev + ingested,
    lastError: errors[0] || null,
  });

  return { ok: true, ingested, skipped, errors, source: 'gmail' };
}

async function probeGmail() {
  const token = await gmailAccessToken();
  if (!token) return { ok: false, error: 'not configured' };
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.error?.message || detail;
    } catch {
      // ignore
    }
    return { ok: false, error: detail };
  }
  const profile = await res.json();
  return { ok: true, email: profile.emailAddress };
}

module.exports = { syncGmail, probeGmail, gmailAccessToken };
