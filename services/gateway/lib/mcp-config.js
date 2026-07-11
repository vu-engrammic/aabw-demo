const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_URL = 'https://beta.engrammic.ai/mcp/';
const AABW_DIR = path.join(os.homedir(), '.cursor', 'aabw');

function readTokenFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return null;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      if (parsed.expires_at && new Date(parsed.expires_at).getTime() < Date.now() + 60_000) {
        return parsed.refresh_token ? parsed : null;
      }
      return parsed.access_token || parsed.token || null;
    }
    return raw;
  } catch {
    return null;
  }
}

function readAabwConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(AABW_DIR, 'aabw.json'), 'utf8'));
    return raw.mcpToken || raw.engrammicToken || null;
  } catch {
    return null;
  }
}

function mcpConfig() {
  const url = process.env.ENGRAMMIC_MCP_URL || DEFAULT_URL;

  if (process.env.ENGRAMMIC_MCP_TOKEN) {
    return { url, token: process.env.ENGRAMMIC_MCP_TOKEN, source: 'env' };
  }

  if (process.env.ENGRAMMIC_MCP_API_KEY) {
    return { url, token: process.env.ENGRAMMIC_MCP_API_KEY, source: 'env-api-key' };
  }

  const tokenPaths = [
    path.join(AABW_DIR, 'mcp-token'),
    path.join(AABW_DIR, 'mcp-token.json'),
    path.join(os.homedir(), '.engrammic', 'mcp-token'),
  ];
  for (const tokenPath of tokenPaths) {
    const token = readTokenFile(tokenPath);
    if (typeof token === 'string' && token) {
      return { url, token, source: tokenPath };
    }
    if (token && typeof token === 'object' && token.access_token) {
      return { url, token: token.access_token, source: tokenPath };
    }
  }

  const fromAabw = readAabwConfig();
  if (fromAabw) return { url, token: fromAabw, source: 'aabw.json' };

  try {
    const cfgPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const srv = raw.mcpServers?.engrammic || raw.mcpServers?.['user-engrammic'];
    if (srv?.url) {
      const headerToken =
        srv.headers?.Authorization?.replace(/^Bearer\s+/i, '') ||
        srv.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
        srv.headers?.['x-api-key'] ||
        null;
      return { url: srv.url, token: headerToken || null, source: headerToken ? 'mcp.json' : null };
    }
  } catch {
    // ignore
  }

  return { url, token: null, source: null };
}

module.exports = { mcpConfig, DEFAULT_URL, AABW_DIR };
