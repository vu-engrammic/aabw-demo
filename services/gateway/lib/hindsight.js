// services/gateway/lib/hindsight.js
const { loadEnv } = require('./env');
loadEnv();

const HINDSIGHT_URL = process.env.HINDSIGHT_URL || 'http://localhost:8888';

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
  return hindsightFetch('/api/retain', {
    method: 'POST',
    body: JSON.stringify({
      content: text,
      metadata,
      extraction_mode: mode,
    }),
  });
}

async function retainFile({ buffer, filename, mimeType, metadata = {} }) {
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), filename);
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('extraction_mode', 'verbatim');

  const res = await fetch(`${HINDSIGHT_URL}/api/documents`, {
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
  return hindsightFetch('/api/recall', {
    method: 'POST',
    body: JSON.stringify({
      query,
      tags: tags.length ? tags : undefined,
      tags_match: tagsMatch,
      max_tokens: 4096,
      budget: 'mid',
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

module.exports = {
  retainDocument,
  retainFile,
  recallMemories,
  healthCheck,
  HINDSIGHT_URL,
};
