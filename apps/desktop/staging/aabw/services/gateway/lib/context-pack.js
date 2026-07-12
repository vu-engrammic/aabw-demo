function rationaleForHit(hit) {
  const reasons = [];
  if (hit.relevance != null) reasons.push(`query match (${hit.relevance})`);
  if (hit.confidence != null) reasons.push(`confidence ${Math.round(Number(hit.confidence) * 100)}%`);
  else if (hit.credibility != null) reasons.push(`credibility ${Math.round(Number(hit.credibility) * 100)}%`);
  if (hit.type === 'capability') reasons.push('org capability');
  if (hit.whyItWorked) reasons.push('documented why-it-worked');
  if (hit.sourceTier === 'authoritative') reasons.push('authoritative tier');
  else if (hit.sourceTier === 'validated') reasons.push('validated tier');
  else if (hit.sourceTier === 'user-captured') reasons.push('captured in companion');
  if (hit.heat >= 3) reasons.push(`high reuse (${hit.heat}×)`);
  if (hit.tags?.includes('adjudicated')) reasons.push('adjudicated winner');
  if (hit.tags?.includes('captured')) reasons.push('recently captured');
  if (hit.mcpRationale) reasons.push(hit.mcpRationale);
  return reasons.length ? reasons.join(' · ') : 'matched your Cursor prompt';
}

function rationaleForExcluded(ex) {
  const winner = ex.winnerTitle || ex.supersededBy;
  return `superseded — org adopted “${winner}”`;
}

function withRationale(items) {
  return items.map((h) => ({ ...h, rationale: rationaleForHit(h) }));
}

function buildContextPack(query, recallResult) {
  const { hits, conflicts, deniedCount, excluded = [] } = recallResult;
  const capabilities = withRationale(hits.filter((h) => h.type === 'capability'));
  const claims = withRationale(hits.filter((h) => h.layer === 'knowledge' && h.type !== 'capability'));
  const beliefs = withRationale(hits.filter((h) => h.layer === 'wisdom'));
  const observations = withRationale(hits.filter((h) => h.layer === 'memory'));

  const cautions = conflicts.map((c) => ({
    conflictId: c.id,
    topic: c.topic,
    summary: c.summary,
    rationale: 'open contradiction — needs adjudication before trust',
  }));

  const excludedNodes = excluded.map((ex) => ({
    ...ex,
    rationale: rationaleForExcluded(ex),
  }));

  return {
    query,
    capabilities,
    claims,
    beliefs,
    observations,
    cautions,
    excluded: excludedNodes,
    deniedCount,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildContextPack, rationaleForHit, rationaleForExcluded };
