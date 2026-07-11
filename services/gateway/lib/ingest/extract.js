/** Heuristic knowledge extraction from connector payloads (no LLM — engineer-focused patterns). */

const ENGINEERING_TAGS = [
  'api', 'deploy', 'ocr', 'auth', 'postgres', 'redis', 'ci', 'incident', 'bug', 'fix',
  'refactor', 'architecture', 'security', 'performance', 'migration', 'docker', 'k8s',
  'terraform', 'github', 'pr', 'review', 'oncall', 'postmortem', 'runbook', 'adr',
];

const CLAIM_SIGNALS = [
  /\bdecided to\b/i,
  /\bwe should\b/i,
  /\bwe must\b/i,
  /\balways use\b/i,
  /\bnever use\b/i,
  /\bfixed by\b/i,
  /\broot cause\b/i,
  /\bworkaround\b/i,
  /\bblocked on\b/i,
  /\bship(ped|ping)?\b/i,
  /\bdeploy(ed|ing)?\b/i,
  /\bincident\b/i,
  /\bpostmortem\b/i,
  /\bRFC\b/,
  /\bADR\b/i,
];

function cleanLine(line) {
  return String(line || '')
    .replace(/^[\s>*#\-•]+/, '')
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/<https?:[^>|]+(?:\|([^>]+))?>/g, (_, label) => label || '')
    .trim();
}

function inferTags(text, extra = []) {
  const lower = text.toLowerCase();
  const tags = new Set(['engineering', ...extra].filter(Boolean));
  for (const kw of ENGINEERING_TAGS) {
    if (lower.includes(kw)) tags.add(kw);
  }
  return [...tags].slice(0, 8);
}

function extractClaim(text, lines) {
  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (cleaned.length < 28) continue;
    if (CLAIM_SIGNALS.some((re) => re.test(cleaned))) {
      return cleaned.length > 280 ? `${cleaned.slice(0, 277)}…` : cleaned;
    }
  }
  const sentence = text.match(/[^.!?\n]{36,220}[.!?]/)?.[0]?.trim();
  if (sentence && sentence.length >= 36) {
    return sentence.length > 280 ? `${sentence.slice(0, 277)}…` : sentence;
  }
  const joined = lines.slice(0, 3).map(cleanLine).filter(Boolean).join(' ');
  if (joined.length >= 24) {
    return joined.length > 280 ? `${joined.slice(0, 277)}…` : joined;
  }
  return null;
}

function extractTitle(text, meta = {}) {
  if (meta.subject) return String(meta.subject).slice(0, 120);
  if (meta.title) return String(meta.title).slice(0, 120);
  const lines = text.split(/\n/).map(cleanLine).filter(Boolean);
  const first = lines[0] || 'Engineering note';
  if (first.length <= 100) return first;
  return `${first.slice(0, 97)}…`;
}

/**
 * Extract structured ingest payload from raw connector text.
 * @returns {{ title, claim, observation, tags }}
 */
function extractKnowledge(text, meta = {}) {
  const body = String(text || '').trim();
  if (!body) return null;

  const lines = body.split(/\n/).map(cleanLine).filter(Boolean);
  const title = extractTitle(body, meta);
  const claim = extractClaim(body, lines) || title;
  const tags = inferTags(body, [meta.source, meta.channel, meta.from].filter(Boolean));

  return {
    title,
    claim,
    observation: body,
    tags,
  };
}

module.exports = { extractKnowledge, inferTags, cleanLine };
