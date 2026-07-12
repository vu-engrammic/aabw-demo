// services/gateway/lib/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { recallMemories } = require('./hindsight');
const {
  buildMetadataFilter,
  filterMemoriesForUser,
  memoryAccessMeta,
} = require('./rbac-filter');
const { loadEnv } = require('./env');

loadEnv();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

const EMPTY_ANSWER = {
  en: "I couldn't find that in our knowledge base. Try rephrasing your question or contact the relevant department directly.",
  vi: 'Không tìm thấy thông tin trong kho tri thức. Hãy diễn đạt lại câu hỏi hoặc liên hệ phòng ban liên quan.',
};

const SYSTEM_PROMPT = `You are My Tasco, the knowledge assistant for Tasco employees.
Your job is to help employees find company policies, procedures, and institutional knowledge.

Rules:
- If sources are provided below, USE THEM to answer. The sources contain relevant information.
- Cite sources inline as [Source: filename] when referencing specific documents.
- Be concise, professional, and helpful.
- If multiple sources agree, synthesize them. If they conflict, note the discrepancy.
- Only say you don't have information if the sources truly don't contain anything relevant to the question.
- Never invent restricted or confidential details that are not in the provided sources.`;

function getSourceFile(m) {
  const docId = m.document_id || '';
  const metaFile = m.metadata?.source_file || m.metadata?.filename;
  if (docId.startsWith('file_') && metaFile) return metaFile;
  return metaFile || docId || null;
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

function asMemoryList(result) {
  return result?.results || result?.facts || result?.memories || [];
}

function resolveLocale(locale, query) {
  const explicit = String(locale || '').toLowerCase().slice(0, 2);
  if (explicit === 'vi' || explicit === 'en') return explicit;
  // Heuristic: Vietnamese question → Vietnamese empty-state copy
  if (/[ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(String(query || ''))) return 'vi';
  return 'en';
}

/**
 * Count only *classified* memories the user cannot see.
 * Untagged/legacy hits are a data-quality gap, not an access denial — do not
 * inflate deniedCount from unfiltered_count - filtered_count.
 */
function countAccessDenied(unfiltered, user) {
  if (!Array.isArray(unfiltered) || !unfiltered.length || !user) return 0;
  return unfiltered.filter((m) => {
    const { classification } = memoryAccessMeta(m);
    if (!classification) return false;
    return filterMemoriesForUser([m], user).length === 0;
  }).length;
}

async function askQuestion({ query, user, topK = 8, locale }) {
  const filter = buildMetadataFilter(user);
  const lang = resolveLocale(locale, query);

  const filteredResult = await recallMemories({
    query,
    tags: filter.canSeeAll ? [] : filter.tags,
    tagsMatch: 'any_strict',
    topK,
  });
  let memories = asMemoryList(filteredResult);

  // Defense in depth — never send unauthorized chunks to Gemini
  const beforePost = memories.length;
  memories = filterMemoriesForUser(memories, user);
  let deniedCount = Math.max(0, beforePost - memories.length);

  if (!filter.canSeeAll) {
    try {
      const unfilteredResult = await recallMemories({ query, tags: [], topK });
      const unfiltered = asMemoryList(unfilteredResult);
      // Only score the top-K hits — weakly related restricted/confidential docs
      // further down the list must not inflate the "hidden by access" banner.
      const topHits = unfiltered.slice(0, topK);
      deniedCount = Math.max(deniedCount, countAccessDenied(topHits, user));
    } catch {
      // Ignore count errors
    }
  }

  if (!memories.length) {
    return {
      answer: EMPTY_ANSWER[lang] || EMPTY_ANSWER.en,
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
