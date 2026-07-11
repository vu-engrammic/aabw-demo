const crypto = require('node:crypto');
const path = require('node:path');
const store = require('./store');
const auth = require('./auth');
const { recallUnified } = require('./recall-unified');
const { invalidateGraphCache, graphCacheVersion } = require('./graph-cache');
const { buildSuggestion } = require('./suggestion');
const { resolveLiveUser, setSessionLivePersona } = require('./live-persona');

const MAX_EVENTS = 80;
const MAX_HISTORY = 30;
const HEARTBEAT_MS = 15_000;
const subscribers = new Set();
const recentEvents = [];
const promptHistory = [];
let heartbeatTimer = null;

let state = {
  harness: null,
  workspace: null,
  workspaceLabel: null,
  lastPrompt: null,
  lastPack: null,
  lastSuggestion: null,
  lastEventAt: null,
  sessionStartedAt: null,
  sessionId: null,
};

function hookSecret() {
  return process.env.LIVE_HOOK_SECRET || 'aabw-live-dev-secret';
}

function verifyHookSecret(header) {
  return String(header || '') === hookSecret();
}

function workspaceLabel(workspace, provided) {
  if (provided) return provided;
  if (!workspace) return 'unknown workspace';
  return path.basename(String(workspace).replace(/\\/g, path.sep)) || workspace;
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

function feedFromHistory() {
  return promptHistory.map((h) => ({
    id: h.id,
    prompt: h.prompt,
    harness: h.harness,
    workspace: h.workspace,
    workspaceLabel: h.workspaceLabel,
    at: h.at,
    capabilityCount: h.pack?.capabilities?.length || 0,
    cautionCount: h.pack?.cautions?.length || 0,
    itemCount: itemCount(h.pack),
    hasSuggestion: Boolean(h.suggestion),
    source: h.source,
    pending: Boolean(h.pending),
  }));
}

function pushEvent(type, payload) {
  const event = {
    id: crypto.randomUUID(),
    type,
    at: new Date().toISOString(),
    live: true,
    ...payload,
  };

  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS) recentEvents.splice(0, recentEvents.length - MAX_EVENTS);

  for (const res of subscribers) {
    try {
      res.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      subscribers.delete(res);
    }
  }

  return event;
}

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!subscribers.size) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      return;
    }
    for (const res of subscribers) {
      try {
        res.write(': ping\n\n');
      } catch {
        subscribers.delete(res);
      }
    }
  }, HEARTBEAT_MS);
}

function notifyGraphStale() {
  invalidateGraphCache();
  pushEvent('graph', { version: graphCacheVersion(), reason: 'live-recall' });
}

function recallForPrompt(prompt, user) {
  return recallUnified({ query: prompt, user, topK: 8, forLive: true }).then(({ pack, source, mcpError }) => {
    if (source === 'engrammic-mcp' && itemCount(pack) > 0) {
      store.recordQuery(prompt, itemCount(pack), user.userId);
      const ids = [...(pack.capabilities || []), ...(pack.claims || []), ...(pack.observations || [])]
        .slice(0, 5)
        .map((h) => h.id)
        .filter(Boolean);
      if (ids.length) store.bumpHeat(ids);
    }
    return { pack: { ...pack, source, query: prompt }, source, mcpError };
  });
}

async function finalizePromptIngest({
  historyId,
  text,
  harness,
  workspace,
  wsLabel,
  user,
  conversationId,
  generationId,
  model,
}) {
  const { pack, source, mcpError } = await recallForPrompt(text, user);
  const suggestion = buildSuggestion(text, pack, { epistemicHints: pack.epistemic_hints });
  const at = new Date().toISOString();

  state = {
    ...state,
    harness,
    workspace: workspace || state.workspace,
    workspaceLabel: wsLabel,
    lastPrompt: text,
    lastPack: pack,
    lastSuggestion: suggestion,
    lastEventAt: at,
  };

  const historyEntry = {
    id: historyId,
    at,
    prompt: text,
    harness,
    workspace: workspace || state.workspace,
    workspaceLabel: wsLabel,
    pack,
    source,
    mcpError,
    suggestion,
    conversationId,
    generationId,
    model,
    pending: false,
  };

  const pendingIdx = promptHistory.findIndex((h) => h.id === historyId);
  if (pendingIdx >= 0) promptHistory[pendingIdx] = historyEntry;
  else {
    promptHistory.unshift(historyEntry);
    if (promptHistory.length > MAX_HISTORY) promptHistory.length = MAX_HISTORY;
  }

  pushEvent('prompt', {
    id: historyId,
    harness,
    workspace: state.workspace,
    workspaceLabel: wsLabel,
    prompt: text,
    pack,
    source,
    mcpError,
    suggestion,
    user: auth.publicUser(user),
    conversationId,
    generationId,
    model,
  });

  notifyGraphStale();

  return { pack, source, mcpError, suggestion };
}

function ingestPrompt(body) {
  const text = String(body.prompt || '').trim();
  if (!text) return Promise.resolve({ ok: false, error: 'Empty prompt' });

  const user = resolveLiveUser(body.personaId);
  const wsLabel = workspaceLabel(body.workspace, body.workspaceLabel);
  const historyId = crypto.randomUUID();
  const at = new Date().toISOString();

  if (!state.sessionId) {
    state.sessionId = crypto.randomUUID();
    state.sessionStartedAt = at;
  }

  const pendingEntry = {
    id: historyId,
    at,
    prompt: text,
    harness: body.harness || 'cursor',
    workspace: body.workspace || state.workspace,
    workspaceLabel: wsLabel,
    pack: null,
    source: 'engrammic-mcp',
    mcpError: null,
    suggestion: null,
    pending: true,
  };
  promptHistory.unshift(pendingEntry);
  if (promptHistory.length > MAX_HISTORY) promptHistory.length = MAX_HISTORY;

  pushEvent('prompt-pending', {
    id: historyId,
    at,
    prompt: text,
    harness: pendingEntry.harness,
    workspace: pendingEntry.workspace,
    workspaceLabel: wsLabel,
  });

  const runFinalize = () =>
    finalizePromptIngest({
      historyId,
      text,
      harness: pendingEntry.harness,
      workspace: body.workspace,
      wsLabel,
      user,
      conversationId: body.conversationId || null,
      generationId: body.generationId || null,
      model: body.model || null,
    });

  const emitFailure = (err) => {
    const fallbackPack = {
      query: text,
      source: 'engrammic-mcp',
      capabilities: [],
      claims: [],
      beliefs: [],
      observations: [],
      cautions: [],
      excluded: [],
    };
    pushEvent('prompt', {
      id: historyId,
      at: new Date().toISOString(),
      prompt: text,
      harness: pendingEntry.harness,
      workspaceLabel: wsLabel,
      pack: fallbackPack,
      source: 'engrammic-mcp',
      mcpError: err?.message || 'Live recall failed',
      suggestion: null,
      user: auth.publicUser(user),
    });
    notifyGraphStale();
    return fallbackPack;
  };

  // Hook callers that need the recall pack back in the same request (e.g. to
  // inject it into agent context) pass `wait: true` and block on the recall.
  // Fire-and-forget callers (live monitor UI) omit it and get an immediate ack
  // while the recall completes in the background and streams over SSE.
  if (body.wait) {
    return runFinalize()
      .then(({ pack, source, mcpError, suggestion }) => ({
        ok: true,
        accepted: true,
        id: historyId,
        async: false,
        pack,
        source,
        mcpError,
        suggestion,
      }))
      .catch((err) => ({
        ok: true,
        accepted: true,
        id: historyId,
        async: false,
        pack: emitFailure(err),
        source: 'engrammic-mcp',
        mcpError: err?.message || 'Live recall failed',
        suggestion: null,
      }));
  }

  setImmediate(() => {
    runFinalize().catch(emitFailure);
  });

  return Promise.resolve({ ok: true, accepted: true, id: historyId, async: true });
}

function ingestSession({ harness = 'cursor', workspace = null, workspaceLabel: label = null }) {
  const wsLabel = workspaceLabel(workspace, label);
  const at = new Date().toISOString();
  state = {
    ...state,
    harness,
    workspace: workspace || state.workspace,
    workspaceLabel: wsLabel,
    sessionStartedAt: at,
    sessionId: crypto.randomUUID(),
    lastEventAt: at,
  };

  const event = pushEvent('session', {
    harness,
    workspace: state.workspace,
    workspaceLabel: wsLabel,
    sessionId: state.sessionId,
  });

  return { ok: true, event };
}

function publicState() {
  return {
    harness: state.harness,
    workspace: state.workspace,
    workspaceLabel: state.workspaceLabel,
    lastPrompt: state.lastPrompt,
    lastPack: state.lastPack,
    lastSuggestion: state.lastSuggestion,
    lastEventAt: state.lastEventAt,
    sessionStartedAt: state.sessionStartedAt,
    sessionId: state.sessionId,
    subscribers: subscribers.size,
    promptFeed: feedFromHistory(),
    promptHistory: promptHistory.slice(0, MAX_HISTORY),
    recentEvents: recentEvents.slice(-12).reverse(),
    waitingForLive: promptHistory.length === 0,
  };
}

function getState() {
  return publicState();
}

function subscribe(res) {
  subscribers.add(res);
  ensureHeartbeat();
  res.write(': connected\n\n');
  res.write(`event: snapshot\ndata: ${JSON.stringify(publicState())}\n\n`);
}

function unsubscribe(res) {
  subscribers.delete(res);
}

module.exports = {
  hookSecret,
  verifyHookSecret,
  ingestPrompt,
  ingestSession,
  getState,
  subscribe,
  unsubscribe,
  setSessionLivePersona,
};
