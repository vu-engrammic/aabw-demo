const crypto = require('node:crypto');
const { extractKnowledge } = require('./extract');
const { parseDocument } = require('./parse-client');
const { ingestViaMcp } = require('../engrammic-mcp');
const { invalidateGraphCache } = require('../graph-cache');
const { mcpConfig } = require('../mcp-config');
const store = require('../store');
const { markIngested, hasIngested } = require('../connectors/state');

/**
 * Auto-ingest: remember observation → learn extracted claim (no manual fields).
 */
async function ingestAuto({
  title,
  claim,
  observation,
  tags = [],
  sourceUri,
  source,
  team,
  scope = 'team',
  ownerId,
  user,
  harness = 'ingest',
}) {
  const preferMcp = process.env.AABW_RECALL_LOCAL_ONLY !== '1' && Boolean(mcpConfig().token);

  if (preferMcp) {
    const result = await ingestViaMcp({
      title,
      claim,
      observation,
      tags,
      sourceUri,
      source,
      team,
      scope,
      ownerId,
      user,
      harness,
    });
    if (result.ok) {
      invalidateGraphCache();
      return { ok: true, source: 'engrammic-mcp', ...result };
    }
    if (process.env.AABW_ALLOW_DEMO_FALLBACK !== '1') {
      return { ok: false, error: result.error || 'Engrammic ingest failed' };
    }
  }

  const local = ingestLocal({ title, claim: claim || title, observation, sourceUri, team, scope, ownerId, user });
  invalidateGraphCache();
  return { ok: true, source: 'local-demo', ...local, mcpError: preferMcp ? 'MCP unavailable' : null };
}

function ingestLocal({ title, claim, observation, sourceUri, team, scope = 'team', ownerId, user }) {
  const mem = store.addNode({
    layer: 'memory',
    type: 'observation',
    title,
    content: observation,
    team,
    scope,
    ownerId: ownerId || user?.userId,
    classification: 'internal',
    sourceUri,
    sourceTier: sourceUri?.startsWith('slack://') ? 'community' : 'validated',
    tags: ['ingested', 'engineering'],
    owner: ownerId || user?.userId,
  });
  const kn = store.addNode({
    layer: 'knowledge',
    type: 'claim',
    title,
    content: claim,
    team,
    scope,
    ownerId: ownerId || user?.userId,
    classification: 'internal',
    sourceUri,
    sourceTier: mem.sourceTier,
    tags: ['ingested', 'engineering', 'auto-extracted'],
    owner: ownerId || user?.userId,
  });
  store.addEdge('DERIVED_FROM', kn.id, mem.id);
  return {
    trace: { memoryId: mem.id, claimId: kn.id },
    memory: { node_id: mem.id },
    claimNode: { id: kn.id },
  };
}

/** Manual doc paste — engineers paste runbooks, ADRs, notes; knowledge auto-extracted. */
async function ingestDocument({ text, label, sourceUri, user, team, scope = 'team', ownerId }) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'Empty document' };

  const extracted = extractKnowledge(body, {
    source: 'document',
    title: label || 'Engineering document',
  });
  if (!extracted) return { ok: false, error: 'Could not extract content' };

  const uri = sourceUri || `doc://manual/${Date.now()}`;
  const result = await ingestAuto({
    ...extracted,
    sourceUri: uri,
    source: 'document',
    team: team || user?.department || 'Engineering',
    scope,
    ownerId: ownerId || user?.userId,
    user,
    harness: 'document',
  });

  if (result.ok) markIngested(uri, result.trace?.memoryId || result.trace?.claimId);
  return result;
}

/** Upload ingest: parse file → extractKnowledge → remember/learn. */
async function ingestFile({ buffer, filename, mimeType, user, team, scope = 'team', ownerId }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, error: 'Empty file' };
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const sourceUri = `file://${sha256}`;
  if (hasIngested(sourceUri)) {
    return { ok: true, skipped: true, sourceUri, sha256, message: 'Already ingested' };
  }

  const parsed = await parseDocument(buffer, filename, mimeType);
  if (!parsed.ok) return { ok: false, error: parsed.error || 'Parse failed' };

  const text = String(parsed.text || parsed.markdown || '').trim();
  if (!text) return { ok: false, error: 'No text extracted from file' };

  const result = await ingestDocument({
    text,
    label: filename || parsed.meta?.filename || 'Uploaded document',
    sourceUri,
    user,
    team,
    scope,
    ownerId,
  });

  return {
    ...result,
    sha256,
    sourceUri,
    parser: parsed.source || parsed.meta?.parser || null,
    filename: filename || parsed.meta?.filename || null,
  };
}

module.exports = { ingestAuto, ingestDocument, ingestFile, ingestLocal };
