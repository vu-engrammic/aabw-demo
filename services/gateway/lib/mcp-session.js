const { mcpConfig } = require('./mcp-config');

const SESSION_TTL_MS = 4 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;

let session = null;
let sessionExpiresAt = 0;
let sessionPromise = null;

function parseSsePayload(text) {
  const messages = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const chunk = line.slice(5).trim();
    if (!chunk || chunk === '[DONE]') continue;
    try {
      messages.push(JSON.parse(chunk));
    } catch {
      // ignore non-json sse lines
    }
  }
  return messages;
}

async function readMcpResponse(res) {
  const contentType = res.headers?.get?.('content-type') || '';
  const text = await res.text();
  if (!text) return null;

  if (contentType.includes('text/event-stream') || text.startsWith('event:')) {
    const messages = parseSsePayload(text);
    const withResult = messages.filter((m) => m?.result !== undefined || m?.error !== undefined);
    return withResult[withResult.length - 1] || messages[messages.length - 1] || null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const messages = parseSsePayload(text);
    if (messages.length) {
      const withResult = messages.filter((m) => m?.result !== undefined || m?.error !== undefined);
      return withResult[withResult.length - 1] || messages[messages.length - 1];
    }
    throw new Error(`Unexpected MCP response: ${text.slice(0, 80)}`);
  }
}

function parseMcpPayload(payload) {
  let data = payload?.result;
  if (data?.content) {
    const text = data.content.find((c) => c.type === 'text')?.text;
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { results: [{ node_id: 'mcp-text', layer: 'memory', content: text }] };
      }
    }
  }
  return data;
}

async function openSession() {
  const now = Date.now();
  if (session && sessionExpiresAt > now) return session;
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const { url, token } = mcpConfig();
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (token) headers.authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const initRes = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'aabw-gateway', version: '0.2.0' },
          },
        }),
      });

      if (!initRes.ok) {
        throw new Error(`MCP init HTTP ${initRes.status}`);
      }

      const sessionId = initRes.headers?.get?.('mcp-session-id');
      const callHeaders = { ...headers };
      if (sessionId) callHeaders['mcp-session-id'] = sessionId;

      const initBody = await readMcpResponse(initRes).catch(() => null);
      if (initBody?.error) {
        throw new Error(initBody.error.message || 'MCP init error');
      }

      await fetch(url, {
        method: 'POST',
        headers: callHeaders,
        signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      }).catch(() => {});

      session = { url, callHeaders };
      sessionExpiresAt = Date.now() + SESSION_TTL_MS;
      return session;
    } finally {
      clearTimeout(timer);
      sessionPromise = null;
    }
  })();

  return sessionPromise;
}

function invalidateSession() {
  session = null;
  sessionExpiresAt = 0;
  sessionPromise = null;
}

async function callMcpTool(name, args = {}, { retries = 1 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) invalidateSession();

    try {
      const active = await openSession();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const callRes = await fetch(active.url, {
          method: 'POST',
          headers: active.callHeaders,
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        });

        if (!callRes.ok) {
          throw new Error(`MCP call HTTP ${callRes.status}`);
        }

        const payload = await readMcpResponse(callRes);
        if (!payload) {
          throw new Error('Empty MCP response');
        }
        if (payload.error) {
          throw new Error(payload.error.message || 'MCP error');
        }

        return { ok: true, data: parseMcpPayload(payload) };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err;
      if (attempt < retries) continue;
    }
  }

  return { ok: false, error: lastError?.message || 'MCP unavailable' };
}

module.exports = { callMcpTool, invalidateSession, openSession };
