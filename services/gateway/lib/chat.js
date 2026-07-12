// services/gateway/lib/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { recallMemories } = require('./hindsight');
const { buildMetadataFilter } = require('./rbac-filter');
const { loadEnv } = require('./env');

loadEnv();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// ponytail: gemini-2.0-flash is current stable, 1.5 deprecated
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const SYSTEM_PROMPT = `You are a knowledge assistant for Tasco employees.
Answer ONLY using the provided sources. If the answer isn't in the sources, say "I don't have information about that in the available documents."
Cite sources inline as [1], [2], etc. Be concise and helpful.`;

function buildSourcesContext(memories) {
  if (!memories?.length) return '';
  return memories
    .map((m, i) => {
      const file = m.metadata?.source_file || 'unknown';
      const text = m.text || m.content || '';
      return `[${i + 1}] (from: ${file})\n${text.slice(0, 500)}`;
    })
    .join('\n\n');
}

function extractSources(memories) {
  return memories.map((m, i) => ({
    id: i + 1,
    file: m.metadata?.source_file || 'unknown',
    chunk: (m.text || m.content || '').slice(0, 200),
    score: m.score || m.relevance || null,
  }));
}

function computeConfidence(memories) {
  if (!memories?.length) return 'none';
  const topScore = memories[0]?.score || memories[0]?.relevance || 0;
  if (topScore > 0.8) return 'high';
  if (topScore > 0.5) return 'medium';
  return 'low';
}

async function askQuestion({ query, user, topK = 8 }) {
  const filter = buildMetadataFilter(user);

  // Filtered recall
  const filteredResult = await recallMemories({
    query,
    tags: filter.tags,
    topK,
  });
  // ponytail: Hindsight returns 'results' not 'facts'
  const memories = filteredResult.results || filteredResult.facts || filteredResult.memories || [];

  // Count denied (unfiltered minus filtered)
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
      answer: "I don't have information about that in the available documents.",
      sources: [],
      confidence: 'none',
      deniedCount,
    };
  }

  const sourcesContext = buildSourcesContext(memories);
  const prompt = `${SYSTEM_PROMPT}

Sources:
${sourcesContext}

Question: ${query}`;

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
