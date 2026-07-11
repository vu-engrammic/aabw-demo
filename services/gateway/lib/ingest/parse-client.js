const { parseLocal } = require('./parse-local');

const DOC_PARSER_URL = process.env.DOC_PARSER_URL || 'http://127.0.0.1:8081/parse';
const PARSE_TIMEOUT_MS = Number(process.env.DOC_PARSER_TIMEOUT_MS || 120_000);

function isImage(mimeType, filename) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ext = String(filename || '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', '.bmp'].includes(ext);
}

async function parseViaSidecar(buffer, filename, mimeType) {
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  form.append('file', blob, filename || 'upload');

  const res = await fetch(DOC_PARSER_URL, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: `Doc parser returned non-JSON (${res.status})` };
  }

  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `Doc parser failed (${res.status})` };
  }

  return {
    ok: true,
    text: String(data.text || data.markdown || '').trim(),
    markdown: data.markdown || null,
    meta: data.meta || { filename, mime: mimeType || null },
    source: 'doc-parser',
  };
}

/**
 * Parse a document buffer — local parsers first, sidecar for images/failures.
 * @returns {Promise<{ ok: boolean, text?: string, markdown?: string, meta?: object, source?: string, error?: string }>}
 */
async function parseDocument(buffer, filename, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, error: 'Empty file' };
  }

  if (!isImage(mimeType, filename)) {
    const local = await parseLocal(buffer, filename, mimeType);
    if (local.ok && local.text) {
      return { ...local, source: 'local' };
    }
    if (local.ok && !local.text) {
      const sidecar = await parseViaSidecar(buffer, filename, mimeType);
      if (sidecar.ok) return sidecar;
      return { ok: false, error: sidecar.error || 'No text extracted' };
    }
  }

  return parseViaSidecar(buffer, filename, mimeType);
}

module.exports = { parseDocument, parseViaSidecar, isImage };
