// services/gateway/lib/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { recallMemories } = require('./hindsight');
const { buildMetadataFilter } = require('./rbac-filter');
const { loadEnv } = require('./env');

loadEnv();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

const SYSTEM_PROMPT = `You are My Tasco, the knowledge assistant for Tasco employees.
Your job is to help employees find company policies, procedures, and institutional knowledge.

Rules:
- Answer ONLY using the provided sources. Never make up information.
- If the answer isn't in the sources, say "I couldn't find that in our knowledge base. Try rephrasing or contact the relevant department."
- Cite sources inline as [Source: filename] when referencing specific documents.
- Be concise, professional, and helpful.
- If multiple sources agree, synthesize them. If they conflict, note the discrepancy.`;

function getSourceFile(m) {
  // Hindsight returns document_id directly, not in metadata
  return m.document_id || m.metadata?.source_file || m.metadata?.filename || null;
}

function buildSourcesContext(memories) {
  if (!memories?.length) return '';
  return memories
    .map((m, i) => {
      const file = getSourceFile(m);
      const text = m.text || m.content || '';
      const label = file ? `[${i + 1}] From "${file}"` : `[${i + 1}]`;
      return `${label}:\n${text.slice(0, 600)}`;
    })
    .join('\n\n');
}

function extractSources(memories) {
  // Dedupe by document_id, keep highest scoring
  const seen = new Map();
  for (const m of memories) {
    const file = getSourceFile(m);
    const score = m.scores?.final || m.score || 0;
    if (!seen.has(file) || score > seen.get(file).score) {
      seen.set(file, { m, score });
    }
  }
  return Array.from(seen.values()).map(({ m }, i) => ({
    id: i + 1,
    file: getSourceFile(m) || 'internal knowledge',
    chunk: (m.text || m.content || '').slice(0, 200),
    score: m.scores?.final || null,
  }));
}

function computeConfidence(memories) {
  if (!memories?.length) return 'none';
  const topScore = memories[0]?.scores?.final || memories[0]?.score || 0;
  if (topScore > 0.7) return 'high';
  if (topScore > 0.4) return 'medium';
  return 'low';
}

async function askQuestion({ query, user, topK = 8 }) {
  const filter = buildMetadataFilter(user);

  const filteredResult = await recallMemories({
    query,
    tags: filter.tags,
    topK,
  });
  const memories = filteredResult.results || filteredResult.facts || filteredResult.memories || [];

  let deniedCount = 0;
  if (!filter.canSeeAll && memories.length > 0) {
    try {
      const unfilteredResult = await recallMemories({ query, topK });
      const unfilteredCount = (unfilteredResult.results || unfilteredResult.facts || unfilteredResult.memories || []).length;
      deniedCount = Math.max(0, unfilteredCount - memories.length);
    } catch {
      // Ignore count errors
    }
  }

  if (!memories.length) {
    return {
      answer: "I couldn't find that in our knowledge base. Try rephrasing your question or contact the relevant department directly.",
      sources: [],
      confidence: 'none',
      deniedCount,
    };
  }

  const sourcesContext = buildSourcesContext(memories);
  const prompt = `${SYSTEM_PROMPT}

Available Sources:
${sourcesContext}

Employee Question: ${query}`;

  const result = await model.generateContent(prompt);
  const answer = result.response.text();

  return {
    answer,
    sources: extractSources(memories),
    confidence: computeConfidence(memories),
    deniedCount,
  };
}

module.exports = { askQuestion };
