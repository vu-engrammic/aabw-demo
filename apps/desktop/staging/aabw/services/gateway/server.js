const { loadEnv } = require('./lib/env');
loadEnv();

const http = require('node:http');
const { URL } = require('node:url');
const crypto = require('node:crypto');

const store = require('./lib/store');
const access = require('./lib/access');
const { seedIfEmpty } = require('./lib/seed-org');
const auth = require('./lib/auth');
const live = require('./lib/live');
const { resolveLiveUser } = require('./lib/live-persona');
const { syncHookPersona, clearHookPersona } = require('./lib/hook-config');
const { recallUnified } = require('./lib/recall-unified');
const { ingestDocument, ingestFile } = require('./lib/ingest/pipeline');
const { parseMultipart } = require('./lib/ingest/multipart');
const { graphUnified } = require('./lib/graph-unified');
const { mcpConfig } = require('./lib/mcp-config');
const { callMcpTool } = require('./lib/mcp-session');
const { traceViaMcp } = require('./lib/engrammic-mcp');
const { graphCacheVersion } = require('./lib/graph-cache');
const { loginInteractive, ensureValidToken } = require('../../scripts/mcp-login');
const { connectCursor, readSetupStatus, FIRST_ONBOARDING_PROMPT } = require('./lib/device-setup');
const connectors = require('./lib/connectors');

let mcpLoginInProgress = false;

const PORT = Number(process.env.GATEWAY_PORT || 8790);
const INGEST_FILE_LIMIT = 25 * 1024 * 1024;
const CORS_ALLOW_HEADERS = 'content-type, accept';
const ALLOWED_ORIGINS = new Set([
  process.env.WEB_ORIGIN || 'http://127.0.0.1:5173',
  process.env.COMPANION_ORIGIN || 'http://127.0.0.1:8792',
]);

seedIfEmpty();

function corsOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  return process.env.WEB_ORIGIN || 'http://127.0.0.1:5173';
}

function send(req, res, code, body) {
  if (!res.headersSent) {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('access-control-allow-origin', corsOrigin(req));
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', CORS_ALLOW_HEADERS);
  }
  res.end(JSON.stringify(body, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function requireUser(req, res) {
  const user = auth.readSession(req.headers.cookie);
  if (!user) {
    send(req, res, 401, { error: 'Sign in required' });
    return null;
  }
  return user;
}

function userSilo(user) {
  return access.userSilo(user);
}

function inSilo(node, silo, user) {
  return access.inSilo(node, silo, user);
}

function selectedSilo(url, user) {
  return access.selectedSilo(url, user);
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': corsOrigin(req),
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': CORS_ALLOW_HEADERS,
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // ---- live harness bridge (hook secret, no session) ----
    if (req.method === 'GET' && url.pathname === '/live/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'access-control-allow-origin': corsOrigin(req),
      });
      live.subscribe(res);
      req.on('close', () => live.unsubscribe(res));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/live/state') {
      return send(req, res, 200, live.getState());
    }

    if (req.method === 'POST' && url.pathname === '/live/prompt') {
      if (!live.verifyHookSecret(req.headers['x-aabw-hook-secret'])) {
        return send(req, res, 401, { error: 'Invalid hook secret' });
      }
      const body = await readBody(req);
      return send(req, res, 200, await live.ingestPrompt(body));
    }

    if (req.method === 'POST' && url.pathname === '/live/session') {
      if (!live.verifyHookSecret(req.headers['x-aabw-hook-secret'])) {
        return send(req, res, 401, { error: 'Invalid hook secret' });
      }
      const body = await readBody(req);
      return send(req, res, 200, live.ingestSession(body));
    }

    if (req.method === 'POST' && url.pathname === '/live/capture') {
      if (!live.verifyHookSecret(req.headers['x-aabw-hook-secret'])) {
        return send(req, res, 401, { error: 'Invalid hook secret' });
      }
      const body = await readBody(req);
      const user = resolveLiveUser(body.personaId);
      const team = body.team || user.department || 'Engineering';
      const text = String(body.text || [body.title, body.content].filter(Boolean).join('\n\n')).trim();
      if (!text) return send(req, res, 400, { error: 'Missing text' });
      const result = await ingestDocument({
        text,
        label: body.label || body.title,
        sourceUri: body.sourceUri,
        user,
        team,
      });
      if (!result.ok) return send(req, res, 502, result);
      return send(req, res, 200, { ...result, user: auth.publicUser(user) });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      const a = store.analytics();
      const mcp = mcpConfig();
      return send(req, res, 200, {
        ok: true,
        service: 'aabw-org-memory',
        engrammic: mcp.token ? 'mcp-authenticated' : 'mcp-token-missing',
        engrammicMcp: mcp.url,
        totals: a.totals,
        workos: auth.workosConfigured(),
        requestId: crypto.randomUUID(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/mcp/status') {
      await ensureValidToken().catch(() => {});
      const mcp = mcpConfig();
      let probe = null;
      if (mcp.token) {
        const result = await callMcpTool('recall', {
          query: 'memory knowledge wisdom',
          top_k: 5,
          depth: 0,
          min_threshold: 0,
        });
        probe = result.ok
          ? { ok: true, nodes: result.data?.results?.length || 0 }
          : { ok: false, error: result.error };
      }
      return send(req, res, 200, {
        url: mcp.url,
        authenticated: Boolean(mcp.token),
        tokenSource: mcp.source || null,
        demoFallback: process.env.AABW_ALLOW_DEMO_FALLBACK === '1',
        graphCacheVersion: graphCacheVersion(),
        loginUrl: 'http://127.0.0.1:8790/mcp/login',
        probe,
      });
    }

    if (req.method === 'GET' && url.pathname === '/setup/status') {
      const status = readSetupStatus();
      const mcp = mcpConfig();
      return send(req, res, 200, {
        ...status,
        mcpAuthenticated: Boolean(mcp.token),
        mcpSource: mcp.source || null,
        onboardingPrompt: FIRST_ONBOARDING_PROMPT,
        companionUrl: process.env.COMPANION_ORIGIN || 'http://127.0.0.1:8792',
        loginUrl: 'http://127.0.0.1:8790/mcp/login',
      });
    }

    if (req.method === 'POST' && (url.pathname === '/setup/connect-cursor' || url.pathname === '/setup/connect-agent')) {
      try {
        const { connectAgent } = require('./lib/device-setup');
        const result = connectAgent({ syncMcp: true });
        return send(req, res, 200, { ok: true, ...result, status: readSetupStatus() });
      } catch (err) {
        return send(req, res, 500, { ok: false, error: err.message || String(err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/mcp/login') {
      if (mcpLoginInProgress) {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.end('<h1>Engrammic login in progress</h1><p>Complete sign-in in the browser tab that opened.</p>');
      }
      mcpLoginInProgress = true;
      loginInteractive()
        .then(() => {
          mcpLoginInProgress = false;
        })
        .catch(() => {
          mcpLoginInProgress = false;
        });
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end('<h1>Connecting Engrammic</h1><p>Complete sign-in in the browser window.</p>');
    }

    if (req.method === 'GET' && url.pathname === '/') {
      const accept = String(req.headers.accept || '');
      if (accept.includes('text/html')) {
        res.writeHead(302, { location: (process.env.COMPANION_ORIGIN || 'http://127.0.0.1:8792') + '/' });
        return res.end();
      }
      const mcp = mcpConfig();
      return send(req, res, 200, {
        ok: true,
        service: 'aabw-org-memory',
        message: 'API gateway — open the Engrammic companion app',
        companion: process.env.COMPANION_ORIGIN || 'http://127.0.0.1:8792',
        engrammicMcp: mcp.url,
        publicEndpoints: [
          '/health',
          '/live/state',
          '/live/stream',
          '/setup/status',
          '/setup/connect-cursor',
          '/setup/connect-agent',
          '/mcp/status',
          '/mcp/login',
          '/auth/personas',
          '/auth/me',
          '/auth/login',
        ],
      });
    }

    // ---- auth ----
    if (req.method === 'GET' && url.pathname === '/auth/personas') {
      return send(req, res, 200, {
        workos: auth.workosConfigured(),
        personas: auth.loadPersonas().map(auth.publicUser),
      });
    }

    if (req.method === 'GET' && url.pathname === '/auth/workos/status') {
      return send(req, res, 200, auth.workosConfigStatus());
    }

    if (req.method === 'POST' && url.pathname === '/auth/login') {
      const body = await readBody(req);
      const user = auth.devLogin(body.personaId);
      auth.setSessionCookie(res, user);
      live.setSessionLivePersona(user.userId);
      syncHookPersona(user.userId);
      return send(req, res, 200, { user: auth.publicUser(user) });
    }

    if (req.method === 'GET' && url.pathname === '/auth/sso') {
      if (!auth.workosConfigured()) return send(req, res, 400, { error: 'WorkOS not configured' });
      const state = auth.createOAuthState();
      res.writeHead(302, { location: auth.authorizationUrl(state) });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code) return send(req, res, 400, { error: 'Missing code' });
      if (state && !auth.validateOAuthState(state)) {
        return send(req, res, 400, { error: 'Invalid OAuth state' });
      }
      const user = await auth.authenticateCode(code);
      auth.setSessionCookie(res, user);
      live.setSessionLivePersona(user.userId);
      syncHookPersona(user.userId);
      res.writeHead(302, { location: (process.env.COMPANION_ORIGIN || 'http://127.0.0.1:8792') + '/' });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/auth/me') {
      const user = auth.readSession(req.headers.cookie);
      if (user) {
        live.setSessionLivePersona(user.userId);
        syncHookPersona(user.userId);
      }
      return send(req, res, 200, { user: auth.publicUser(user), authenticated: Boolean(user) });
    }

    if (req.method === 'POST' && url.pathname === '/auth/logout') {
      auth.clearSessionCookie(res);
      live.setSessionLivePersona(null);
      clearHookPersona();
      return send(req, res, 200, { ok: true });
    }

    // ---- everything below requires a session ----
    const user = requireUser(req, res);
    if (!user) return;
    const silo = selectedSilo(url, user);

    if (req.method === 'GET' && url.pathname === '/overview') {
      const a = store.analytics();
      const openConflicts = store
        .listConflicts('open')
        .filter((c) => {
          const aNode = store.getNode(c.nodeA);
          const bNode = store.getNode(c.nodeB);
          return (
            (aNode && store.canSee(user, aNode) && inSilo(aNode, silo, user)) ||
            (bNode && store.canSee(user, bNode) && inSilo(bNode, silo, user))
          );
        });
      const recentQueries = store.load().queries.slice(-6).reverse();
      return send(req, res, 200, {
        totals: a.totals,
        byLayer: a.byLayer,
        hottest: a.hottest.filter((n) => store.canSee(user, n) && inSilo(n, silo, user)).slice(0, 5),
        openConflicts,
        gaps: a.gaps.slice(0, 4),
        recentQueries,
        sources: store.listSources(),
        silo,
      });
    }

    if (req.method === 'GET' && url.pathname === '/silos') {
      return send(req, res, 200, {
        silos: store.listSilos({ user }),
        selected: silo === access.SILO_DENIED ? userSilo(user) : silo,
        locked: silo !== access.SILO_PRIVATE,
        scopes: ['private', 'team'],
      });
    }

    if (req.method === 'GET' && url.pathname === '/inbox') {
      return send(req, res, 200, { ...store.inbox({ user, silo }), silo });
    }

    if (req.method === 'GET' && url.pathname === '/graph') {
      const bypassCache = url.searchParams.get('fresh') === '1';
      const forLive = url.searchParams.get('live') === '1';
      const graph = await graphUnified({ user, silo, bypassCache, forLive });
      return send(req, res, 200, { ...graph, silo });
    }

    if (req.method === 'POST' && url.pathname === '/recall') {
      const body = await readBody(req);
      const query = String(body.query || '').trim();
      if (!query) return send(req, res, 400, { error: 'Missing query' });
      const { pack, source, mcpError } = await recallUnified({
        query,
        user,
        topK: body.topK || 12,
        silo: silo === access.SILO_DENIED ? userSilo(user) : silo,
      });
      store.recordQuery(query, (pack.capabilities?.length || 0) + (pack.claims?.length || 0), user.userId);
      return send(req, res, 200, { pack, source, mcpError, user: auth.publicUser(user) });
    }

    if (req.method === 'POST' && url.pathname === '/ingest/document') {
      const body = await readBody(req);
      const text = String(body.text || '').trim();
      if (!text) return send(req, res, 400, { error: 'Missing text' });
      const write = access.resolveWriteTarget(silo, user);
      const result = await ingestDocument({
        text,
        label: body.label,
        sourceUri: body.sourceUri,
        user,
        team: write.team,
        scope: write.scope,
        ownerId: write.ownerId,
      });
      if (!result.ok) {
        const code = /empty|missing|extract/i.test(result.error || '') ? 400 : 502;
        return send(req, res, code, result);
      }
      return send(req, res, 200, {
        ...result,
        user: auth.publicUser(user),
        team: write.team,
        scope: write.scope,
      });
    }

    if (req.method === 'POST' && url.pathname === '/ingest/file') {
      let multipart;
      try {
        multipart = await parseMultipart(req, { limit: INGEST_FILE_LIMIT });
      } catch (err) {
        const code = /too large/i.test(err.message || '') ? 413 : 400;
        return send(req, res, code, { error: err.message || 'Invalid multipart upload' });
      }

      const file = multipart.file;
      if (!file?.buffer?.length) return send(req, res, 400, { error: 'Missing file field' });

      const write = access.resolveWriteTarget(silo, user);
      const result = await ingestFile({
        buffer: file.buffer,
        filename: file.filename,
        mimeType: file.mimeType,
        user,
        team: write.team,
        scope: write.scope,
        ownerId: write.ownerId,
      });
      if (!result.ok) {
        const code = /empty|missing|extract|parse|no text/i.test(result.error || '') ? 400 : 502;
        return send(req, res, code, result);
      }
      return send(req, res, 200, {
        ...result,
        user: auth.publicUser(user),
        team: write.team,
        scope: write.scope,
      });
    }

    if (req.method === 'GET' && url.pathname === '/connectors') {
      const status = connectors.publicStatus();
      const probes = await connectors.probeAll();
      return send(req, res, 200, { ...status, probes });
    }

    if (req.method === 'POST' && url.pathname === '/connectors/sync') {
      const body = await readBody(req);
      const team = silo === '__denied__' ? userSilo(user) : silo;
      const result = await connectors.syncAll({ ...user, department: team }, {
        limit: body.limit || 25,
      });
      return send(req, res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/connectors/gmail/sync') {
      const body = await readBody(req);
      const team = silo === '__denied__' ? userSilo(user) : silo;
      const result = await connectors.syncGmail({ ...user, department: team }, { limit: body.limit || 25 });
      if (!result.ok) return send(req, res, 502, result);
      return send(req, res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/capture') {
      const body = await readBody(req);
      const text = String(body.text || [body.title, body.content, body.whyItWorked].filter(Boolean).join('\n\n')).trim();
      if (!text) return send(req, res, 400, { error: 'Missing text — use POST /ingest/document' });
      const team = silo === '__denied__' ? userSilo(user) : silo;
      const result = await ingestDocument({
        text,
        label: body.label || body.title,
        sourceUri: body.sourceUri,
        user,
        team,
      });
      if (!result.ok) return send(req, res, 502, result);
      return send(req, res, 200, { ...result, user: auth.publicUser(user), team, deprecated: 'Use POST /ingest/document' });
    }

    if (req.method === 'GET' && url.pathname === '/nodes') {
      const nodes = store.listNodes({
        layer: url.searchParams.get('layer') || null,
        team: silo === '__denied__' ? '__denied__' : silo,
        query: url.searchParams.get('q') || null,
        user,
      });
      return send(req, res, 200, { nodes: nodes.slice(0, 100) });
    }

    if (req.method === 'GET' && parts[0] === 'nodes' && parts[1]) {
      const nodeId = parts[1];
      const node = store.getNode(nodeId);
      if (node) {
        if (!store.canSee(user, node)) return send(req, res, 403, { error: 'Access denied by role scope' });
        return send(req, res, 200, {
          node,
          trace: store.trace(nodeId),
          confidence: node.confidence,
          source: 'local-demo',
        });
      }
      const mcp = await traceViaMcp(nodeId);
      if (mcp.ok) {
        return send(req, res, 200, {
          node: mcp.node,
          trace: mcp.trace,
          confidence: mcp.node.confidence,
          credibility: mcp.node.credibility,
          source: 'engrammic-mcp',
          orphan: Boolean(mcp.orphan),
        });
      }
      return send(req, res, 404, { error: 'Node not found' });
    }

    if (req.method === 'GET' && url.pathname === '/conflicts') {
      const status = url.searchParams.get('status') || null;
      const conflicts = store.listConflicts(status).map((c) => ({
        ...c,
        a: store.getNode(c.nodeA),
        b: store.getNode(c.nodeB),
      }))
      .filter((c) => {
        const aVisible = c.a && store.canSee(user, c.a) && inSilo(c.a, silo, user);
        const bVisible = c.b && store.canSee(user, c.b) && inSilo(c.b, silo, user);
        return aVisible || bVisible;
      });
      return send(req, res, 200, { conflicts });
    }

    if (req.method === 'POST' && parts[0] === 'conflicts' && parts[1] && parts[2] === 'resolve') {
      const body = await readBody(req);
      if (!body.winnerId) return send(req, res, 400, { error: 'Missing winnerId' });
      const conflict = store.listConflicts().find((c) => c.id === parts[1]);
      if (!conflict) return send(req, res, 404, { error: 'Conflict not found' });
      const aNode = store.getNode(conflict.nodeA);
      const bNode = store.getNode(conflict.nodeB);
      const canResolve =
        (aNode && store.canSee(user, aNode) && inSilo(aNode, silo, user)) ||
        (bNode && store.canSee(user, bNode) && inSilo(bNode, silo, user));
      if (!canResolve) return send(req, res, 403, { error: 'Not allowed to resolve this conflict in current silo' });
      const result = store.resolveConflict(parts[1], {
        winnerId: body.winnerId,
        note: body.note,
        resolvedBy: user.userId,
      });
      return send(req, res, 200, result);
    }

    if (req.method === 'GET' && url.pathname === '/sources') {
      return send(req, res, 200, { sources: store.listSources() });
    }

    if (req.method === 'POST' && parts[0] === 'sources' && parts[1] && parts[2] === 'sync') {
      return send(req, res, 200, { source: store.syncSource(parts[1]) });
    }

    if (req.method === 'GET' && url.pathname === '/scopes') {
      const personas = auth.loadPersonas().map(auth.publicUser);
      const matrix = ['public', 'internal', 'confidential', 'restricted'].map((cls) => ({
        classification: cls,
        employee: cls === 'public' || cls === 'internal',
        manager: cls !== 'restricted',
        director: cls !== 'restricted',
        executive: true,
        note:
          cls === 'confidential'
            ? 'manager+ within own team (or Company-wide items)'
            : cls === 'restricted'
              ? 'executive only'
              : 'all roles',
      }));
      const teams = [...new Set(store.listNodes({}).map((n) => n.team))];
      return send(req, res, 200, {
        personas,
        matrix,
        teams,
        silos: store.listSilos({ user }),
        workos: auth.workosConfigured(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/analytics') {
      const a = store.analytics();
      const visible = store.listNodes({ user, team: silo === '__denied__' ? '__denied__' : silo });
      const ids = new Set(visible.map((n) => n.id));
      return send(req, res, 200, {
        ...a,
        hottest: a.hottest.filter((n) => ids.has(n.id)),
        coldest: a.coldest.filter((n) => ids.has(n.id)),
        duplication: a.duplication.filter((d) => {
          const aNode = visible.find((n) => n.id === d.a.id);
          const bNode = visible.find((n) => n.id === d.b.id);
          return aNode && bNode;
        }),
        silo,
      });
    }

    if (req.method === 'POST' && url.pathname === '/seed/reset') {
      store.reset();
      seedIfEmpty();
      return send(req, res, 200, { ok: true, totals: store.analytics().totals });
    }

    return send(req, res, 404, { error: 'Not found', path: url.pathname });
  } catch (err) {
    return send(req, res, 500, { error: err.message });
  }
}

http.createServer(handle).listen(PORT, '127.0.0.1', () => {
  console.log(`AABW org-memory gateway on http://127.0.0.1:${PORT}`);
  connectors.startAutoSync(() => ({ userId: 'system', department: 'Engineering', fullName: 'AABW Sync' }));
});
