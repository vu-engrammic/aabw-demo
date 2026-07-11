const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const UI_ROOT = path.join(__dirname, 'companion-ui');
const GATEWAY = process.env.AABW_GATEWAY || 'http://127.0.0.1:8790';
const PORT = Number(process.env.AABW_EMBED_PORT || 8793);

function contentType(filePath) {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html; charset=utf-8';
}

function proxyRequest(req, res, targetPath, { stream = false } = {}) {
  const target = new URL(targetPath, GATEWAY);
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;

  const up = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const outHeaders = { ...proxyRes.headers };
      if (stream) {
        outHeaders['access-control-allow-origin'] = `http://127.0.0.1:${PORT}`;
        outHeaders['access-control-allow-credentials'] = 'true';
      }
      res.writeHead(proxyRes.statusCode || 502, outHeaders);
      proxyRes.pipe(res);
    }
  );

  up.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    } else {
      res.end();
    }
  });

  req.pipe(up);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let filePath = path.join(UI_ROOT, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
  if (!filePath.startsWith(UI_ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(UI_ROOT, 'index.html');
  }
  res.writeHead(200, { 'content-type': contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function createEmbedServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (url.pathname === '/stream') {
      return proxyRequest(req, res, '/live/stream', { stream: true });
    }

    if (url.pathname.startsWith('/api/')) {
      const gatewayPath = url.pathname.replace(/^\/api/, '') + url.search;
      return proxyRequest(req, res, gatewayPath);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }

    serveStatic(req, res);
  });

  return new Promise((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', () => resolve({ server, port: PORT }));
    server.on('error', reject);
  });
}

module.exports = { createEmbedServer, UI_ROOT, PORT };

if (require.main === module) {
  createEmbedServer()
    .then(({ port }) => {
      console.log(`Companion UI embedded at http://127.0.0.1:${port}/`);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
