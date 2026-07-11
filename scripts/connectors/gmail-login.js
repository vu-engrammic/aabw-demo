#!/usr/bin/env node
/**
 * Gmail OAuth — offline refresh token for vu.le@engrammic.ai (or --email).
 * Requires GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in .env, or
 * ~/.cursor/aabw/gmail-oauth-client.json (Google "Download JSON" format).
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const { upsertEnvMany } = require('./env');

const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'http://127.0.0.1:8788/callback';
const PORT = Number(process.env.GMAIL_OAUTH_PORT || 8788);
const TOKEN_DIR = path.join(os.homedir(), '.cursor', 'aabw');
const CLIENT_JSON = path.join(TOKEN_DIR, 'gmail-oauth-client.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

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

function parseCliCredentials() {
  const args = process.argv.slice(2);
  const out = {};
  for (const arg of args) {
    if (arg.startsWith('--client-id=')) out.clientId = arg.slice('--client-id='.length);
    if (arg.startsWith('--client-secret=')) out.clientSecret = arg.slice('--client-secret='.length);
  }
  return out;
}

function loadGoogleClient() {
  const cli = parseCliCredentials();
  if (cli.clientId && cli.clientSecret) return cli;

  const fromEnv = {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
  };
  if (fromEnv.clientId && fromEnv.clientSecret) return fromEnv;

  try {
    const raw = JSON.parse(fs.readFileSync(CLIENT_JSON, 'utf8'));
    const web = raw.installed || raw.web;
    if (web?.client_id && web?.client_secret) {
      return { clientId: web.client_id, clientSecret: web.client_secret };
    }
  } catch {
    // fall through
  }
  return null;
}

function printSetupHelp() {
  console.log(`
Gmail OAuth client not found.

1. Open https://console.cloud.google.com/apis/credentials
2. Create project (or pick Engrammic) → Enable Gmail API
3. OAuth consent screen → Internal (Workspace) or External + test user vu.le@engrammic.ai
4. Create OAuth client → Desktop app (or Web, redirect ${REDIRECT_URI})
5. Download JSON → save as:
   ${CLIENT_JSON}
   OR set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env

Then re-run: npm run gmail:login
`);
}

async function exchangeCode(code, client) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  return data;
}

async function probeGmail(accessToken) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.error?.message || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res.json();
}

async function loginInteractive(email) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  const client = loadGoogleClient();
  if (!client) {
    printSetupHelp();
    process.exit(1);
  }

  upsertEnvMany({
    GMAIL_CLIENT_ID: client.clientId,
    GMAIL_CLIENT_SECRET: client.clientSecret,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', client.clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  if (email) authUrl.searchParams.set('login_hint', email);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          return res.end('Not found');
        }

        const err = url.searchParams.get('error');
        if (err) {
          res.writeHead(400, { 'content-type': 'text/html' });
          res.end(`<h1>Gmail login failed</h1><p>${err}</p>`);
          server.close();
          return reject(new Error(err));
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          return res.end('Missing code');
        }

        const tokens = await exchangeCode(code, client);
        if (!tokens.refresh_token) {
          console.warn('No refresh_token — revoke app access at https://myaccount.google.com/permissions and retry with prompt=consent');
        }

        upsertEnvMany({
          GMAIL_REFRESH_TOKEN: tokens.refresh_token || process.env.GMAIL_REFRESH_TOKEN || '',
          GMAIL_QUERY: process.env.GMAIL_QUERY || 'newer_than:30d',
        });

        fs.writeFileSync(
          path.join(TOKEN_DIR, 'gmail-token.json'),
          `${JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }, null, 2)}\n`,
        );

        const profile = await probeGmail(tokens.access_token);
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<h1>Gmail connected</h1><p>${profile.emailAddress}</p><p>Close this tab.</p>`);
        server.close();
        resolve({ email: profile.emailAddress, refreshToken: tokens.refresh_token });
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/html' });
        res.end(`<h1>Login error</h1><pre>${error.message}</pre>`);
        server.close();
        reject(error);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Gmail OAuth — sign in as ${email || 'your account'}`);
      console.log(authUrl.toString());
      openBrowser(authUrl.toString());
    });

    server.setTimeout(10 * 60 * 1000, () => {
      server.close();
      reject(new Error('Gmail OAuth timed out (10 min)'));
    });
  });
}

module.exports = { loginInteractive, loadGoogleClient, probeGmail, REDIRECT_URI, CLIENT_JSON };

if (require.main === module) {
  const email = process.argv.find((a) => a.includes('@')) || process.env.GMAIL_LOGIN_EMAIL || 'vu.le@engrammic.ai';
  loginInteractive(email)
    .then((r) => {
      console.log('Gmail connected:', r.email);
      console.log('Refresh token saved to .env (GMAIL_REFRESH_TOKEN)');
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
