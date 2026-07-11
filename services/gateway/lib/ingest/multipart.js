const busboy = require('busboy');

/**
 * Parse multipart/form-data from a raw Node HTTP request.
 * @returns {Promise<{ fields: Record<string, string>, file: { buffer: Buffer, filename: string, mimeType: string, fieldname: string } | null }>}
 */
function parseMultipart(req, { limit = 25 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let file = null;
    let settled = false;

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };

    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: limit, files: 1, fields: 20 },
    });

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (fieldname, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        stream.resume();
        finish(new Error('File too large'));
      });
      stream.on('end', () => {
        file = {
          buffer: Buffer.concat(chunks),
          filename: info.filename || 'upload',
          mimeType: info.mimeType || 'application/octet-stream',
          fieldname,
        };
      });
    });

    bb.on('error', (err) => finish(err));
    bb.on('close', () => finish(null, { fields, file }));
    req.on('error', (err) => finish(err));
    req.pipe(bb);
  });
}

module.exports = { parseMultipart };
