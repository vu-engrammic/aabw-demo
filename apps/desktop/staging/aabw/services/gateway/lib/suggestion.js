function tokens(text) {
  return (
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]+/g) || []
  );
}

function packAllItems(pack) {
  if (!pack) return [];
  return [
    ...(pack.capabilities || []),
    ...(pack.claims || []),
    ...(pack.beliefs || []),
    ...(pack.observations || []),
  ];
}

function overlapCount(prompt, item) {
  const promptSet = new Set(tokens(prompt));
  const itemTokens = tokens([item.title, item.content, item.summary].filter(Boolean).join(' '));
  let n = 0;
  for (const t of itemTokens) if (promptSet.has(t)) n += 1;
  return n;
}

function formatConfidence(item) {
  if (item.confidence != null) return Math.round(Number(item.confidence) * 100);
  if (item.credibility != null) return Math.round(Number(item.credibility) * 100);
  if (item.relevance != null) return Math.min(99, Math.round(Number(item.relevance) * 10));
  return null;
}

function hintText(epistemicHints) {
  if (!epistemicHints) return null;
  if (typeof epistemicHints === 'string') return epistemicHints.trim();
  if (Array.isArray(epistemicHints) && epistemicHints.length) {
    const first = epistemicHints[0];
    if (typeof first === 'string') return first;
    if (first?.text) return first.text;
    if (first?.message) return first.message;
  }
  if (epistemicHints.text) return epistemicHints.text;
  if (epistemicHints.message) return epistemicHints.message;
  return null;
}

function buildSuggestion(prompt, pack, { epistemicHints = null } = {}) {
  const items = packAllItems(pack);
  if (!items.length) return null;

  const hint = hintText(epistemicHints);
  if (hint) {
    const top = items[0];
    return {
      text: hint,
      nodeId: top?.id || null,
      confidence: formatConfidence(top),
      reason: 'Engrammic epistemic hint',
    };
  }

  let best = null;
  for (const item of items) {
    const overlap = overlapCount(prompt, item);
    const relevance = Number(item.relevance ?? item.credibility ?? 0);
    const connectionScore = relevance * (overlap <= 1 ? 2 : overlap <= 2 ? 1 : 0.3);
    if (!best || connectionScore > best.connectionScore) {
      best = { item, overlap, connectionScore };
    }
  }

  if (!best || best.overlap >= 4 || best.connectionScore < 0.5) return null;

  const title = best.item.title || best.item.summary || 'a related memory';
  const confidence = formatConfidence(best.item);

  return {
    text: `Engrammic found "${title}" — related to your task but not in your prompt. Want to use this?`,
    nodeId: best.item.id || null,
    confidence,
    reason:
      best.item.rationale ||
      `Low prompt overlap (${best.overlap} shared terms) · fusion relevance ${best.item.relevance ?? '—'}`,
  };
}

module.exports = { buildSuggestion, formatConfidence, packAllItems };
