// services/gateway/lib/hindsight.js
const { loadEnv } = require('./env');
loadEnv();

const HINDSIGHT_URL = process.env.HINDSIGHT_URL || 'http://localhost:8888';
const BANK_ID = process.env.HINDSIGHT_BANK_ID || 'mytasco';

async function hindsightFetch(path, options = {}) {
  const url = `${HINDSIGHT_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hindsight ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function retainDocument({ text, metadata = {}, mode = 'verbatim' }) {
  // ponytail: Hindsight v1 API uses /memories for text retention
  return hindsightFetch(`/v1/default/banks/${BANK_ID}/memories`, {
    method: 'POST',
    body: JSON.stringify({
      content: text,
      metadata,
      type: 'world',
    }),
  });
}

async function retainFile({ buffer, filename, mimeType, metadata = {} }) {
  const formData = new FormData();
  formData.append('files', new Blob([buffer], { type: mimeType }), filename);
  formData.append('request', JSON.stringify({
    document_id: filename,
    tags: metadata.tags || [],
  }));

  const res = await fetch(`${HINDSIGHT_URL}/v1/default/banks/${BANK_ID}/files/retain`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hindsight upload: ${res.status} ${text}`);
  }
  return res.json();
}

async function recallMemories({ query, tags = [], tagsMatch = 'any', topK = 10 }) {
  // ponytail: low budget + fewer tokens = faster recall
  return hindsightFetch(`/v1/default/banks/${BANK_ID}/memories/recall`, {
    method: 'POST',
    body: JSON.stringify({
      query,
      tags: tags.length ? tags : undefined,
      tags_match: tagsMatch,
      max_tokens: 2000,
      budget: 'low',
      types: ['world', 'observation'],
    }),
  });
}

async function healthCheck() {
  try {
    const res = await fetch(`${HINDSIGHT_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBank() {
  // Create bank if it doesn't exist
  try {
    await hindsightFetch(`/v1/default/banks/${BANK_ID}`, { method: 'PUT', body: JSON.stringify({}) });
  } catch {
    // Bank might already exist, that's fine
  }
}

module.exports = {
  retainDocument,
  retainFile,
  recallMemories,
  healthCheck,
  ensureBank,
  HINDSIGHT_URL,
  BANK_ID,
};
