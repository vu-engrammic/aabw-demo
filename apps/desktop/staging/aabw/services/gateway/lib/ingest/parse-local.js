const path = require('node:path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  isArray: (name) => name === 'a',
});

function extOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

function collectAText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectAText(item, out);
    return out;
  }
  if (node.t !== undefined && node.t !== null) {
    const text = String(node.t).trim();
    if (text) out.push(text);
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectAText(value, out);
  }
  return out;
}

async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  return {
    text: String(data.text || '').trim(),
    meta: { pages: data.numpages || null },
  };
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: String(result.value || '').trim(),
    meta: { messages: result.messages?.length || 0 },
  };
}

async function parsePptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return na - nb;
    });

  const slides = [];
  for (const name of slideNames) {
    const xml = await zip.file(name).async('string');
    const parsed = xmlParser.parse(xml);
    const lines = collectAText(parsed);
    if (lines.length) slides.push(lines.join('\n'));
  }

  return {
    text: slides.join('\n\n').trim(),
    meta: { slides: slideNames.length },
  };
}

function parsePlain(buffer) {
  return { text: buffer.toString('utf8').trim(), meta: {} };
}

function supportsLocal(filename, mimeType) {
  const ext = extOf(filename);
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return 'docx';
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    ext === '.pptx'
  ) {
    return 'pptx';
  }
  if (
    mime.startsWith('text/') ||
    ext === '.txt' ||
    ext === '.md' ||
    ext === '.markdown'
  ) {
    return 'plain';
  }
  return null;
}

/**
 * Parse supported office/text formats locally (no sidecar).
 * @returns {Promise<{ ok: boolean, text?: string, meta?: object, error?: string }>}
 */
async function parseLocal(buffer, filename, mimeType) {
  const kind = supportsLocal(filename, mimeType);
  if (!kind) {
    return { ok: false, error: 'Unsupported local format' };
  }

  try {
    let parsed;
    if (kind === 'pdf') parsed = await parsePdf(buffer);
    else if (kind === 'docx') parsed = await parseDocx(buffer);
    else if (kind === 'pptx') parsed = await parsePptx(buffer);
    else parsed = parsePlain(buffer);

    return {
      ok: true,
      text: parsed.text,
      meta: {
        filename,
        mime: mimeType || null,
        parser: kind,
        ...parsed.meta,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Local parse failed' };
  }
}

module.exports = { parseLocal, supportsLocal };
