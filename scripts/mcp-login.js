const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');

const DEFAULT_URL = 'https://beta.engrammic.ai/mcp/';
const OAUTH_BASE = process.env.ENGRAMMIC_OAUTH_ISSUER || 'https://beta.engrammic.ai';
const REDIRECT_URI = process.env.ENGRAMMIC_OAUTH_REDIRECT || 'http://localhost:8787/callback';
const TOKEN_DIR = path.join(os.homedir(), '.cursor', 'aabw');
const TOKEN_PATH = path.join(TOKEN_DIR, 'mcp-token.json');
const CLIENT_PATH = path.join(TOKEN_DIR, 'mcp-oauth-client.json');

function ensureDir() {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function pkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data.error || data.error_description || data.raw || `HTTP ${res.status}`);
  }
  return data;
}

async function registerClient() {
  const existing = readJson(CLIENT_PATH);
  if (existing?.client_id) return existing;

  const client = await fetchJson(`${OAUTH_BASE}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'aabw-local',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  writeJson(CLIENT_PATH, {
    client_id: client.client_id,
    client_secret: client.client_secret || null,
    registeredAt: new Date().toISOString(),
  });
  return client;
}

function saveToken(tokenResponse) {
  const payload = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || null,
    token_type: tokenResponse.token_type || 'Bearer',
    expires_at: tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null,
    savedAt: new Date().toISOString(),
    mcp_url: process.env.ENGRAMMIC_MCP_URL || DEFAULT_URL,
  };
  writeJson(TOKEN_PATH, payload);

  const plainPath = path.join(TOKEN_DIR, 'mcp-token');
  fs.writeFileSync(plainPath, payload.access_token, 'utf8');

  const envPath = path.join(path.resolve(__dirname, '..'), '.env');
  let env = '';
  try {
    env = fs.readFileSync(envPath, 'utf8');
  } catch {
    env = '';
  }
  const line = `ENGRAMMIC_MCP_TOKEN=${payload.access_token}`;
  if (/^ENGRAMMIC_MCP_TOKEN=/m.test(env)) {
    env = env.replace(/^ENGRAMMIC_MCP_TOKEN=.*$/m, line);
  } else {
    env = `${env.trim()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, env);
  return payload;
}

async function exchangeCode(code, verifier, clientId) {
  return fetchJson(`${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
}

async function refreshToken(refreshToken, clientId) {
  return fetchJson(`${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
}

function loadStoredToken() {
  const json = readJson(TOKEN_PATH);
  if (!json?.access_token) return null;
  if (json.expires_at && new Date(json.expires_at).getTime() < Date.now() + 60_000) {
    return { ...json, expired: true };
  }
  return json;
}

async function ensureValidToken() {
  const stored = loadStoredToken();
  if (stored && !stored.expired) return stored;

  if (stored?.refresh_token) {
    const client = readJson(CLIENT_PATH);
    if (client?.client_id) {
      try {
        const refreshed = await refreshToken(stored.refresh_token, client.client_id);
        return saveToken(refreshed);
      } catch {
        // fall through to interactive login
      }
    }
  }
  return null;
}

function authorizeUrl(clientId, challenge, state) {
  const url = new URL(`${OAUTH_BASE}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', 'read write');
  url.searchParams.set('state', state);
  return url.toString();
}

function openBrowser(url) {
  const { execFile } = require('node:child_process');
  if (process.platform === 'win32') {
    execFile('rundll32', ['url.dll,FileProtocolHandler', url]);
  } else if (process.platform === 'darwin') {
    execFile('open', [url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

async function loginInteractive() {
  ensureDir();
  const client = await registerClient();
  const { verifier, challenge } = pkcePair();
  const state = base64url(crypto.randomBytes(16));

  const authUrl = authorizeUrl(client.client_id, challenge, state);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          return res.end('Not found');
        }

        if (url.searchParams.get('state') !== state) {
          res.writeHead(400);
          return res.end('Invalid OAuth state');
        }

        const err = url.searchParams.get('error');
        if (err) {
          res.writeHead(400, { 'content-type': 'text/html' });
          res.end(`<h1>Engrammic login failed</h1><p>${err}</p>`);
          server.close();
          return reject(new Error(err));
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          return res.end('Missing code');
        }

        const tokenResponse = await exchangeCode(code, verifier, client.client_id);
        const saved = saveToken(tokenResponse);

        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<h1>Engrammic connected</h1><p>You can close this tab.</p>');
        server.close();
        resolve(saved);
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/html' });
        res.end(`<h1>Login error</h1><pre>${error.message}</pre>`);
        server.close();
        reject(error);
      }
    });

    server.listen(8787, '127.0.0.1', () => {
      console.log('Opening Engrammic login…');
      console.log(authUrl);
      openBrowser(authUrl);
    });

    server.setTimeout(5 * 60 * 1000, () => {
      server.close();
      reject(new Error('OAuth login timed out'));
    });
  });
}

module.exports = {
  TOKEN_PATH,
  TOKEN_DIR,
  loadStoredToken,
  ensureValidToken,
  loginInteractive,
  saveToken,
};

if (require.main === module) {
  loginInteractive()
    .then((token) => {
      console.log('Saved Engrammic MCP token to', TOKEN_PATH);
      console.log('Expires:', token.expires_at || 'unknown');
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
