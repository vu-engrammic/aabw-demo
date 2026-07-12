const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONFIG_PATH = path.join(os.homedir(), '.cursor', 'aabw.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function resolveHome() {
  if (process.env.AABW_HOME) return process.env.AABW_HOME;
  const cfg = readConfig();
  if (cfg?.home && fs.existsSync(cfg.home)) return cfg.home;
  // Dev fallback when hooks run from inside the repo.
  const devRoot = path.resolve(__dirname, '..', '..');
  if (fs.existsSync(path.join(devRoot, 'services', 'gateway', 'server.js'))) return devRoot;
  return null;
}

function workspaceLabel(workspace) {
  if (!workspace) return 'unknown workspace';
  const parts = String(workspace).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || workspace;
}

module.exports = { CONFIG_PATH, resolveHome, workspaceLabel, readConfig };
