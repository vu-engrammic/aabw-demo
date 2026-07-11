const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function configPath() {
  return path.join(os.homedir(), '.cursor', 'aabw.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  const dir = path.dirname(configPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function syncHookPersona(userId) {
  if (!userId) return;
  const cfg = readConfig();
  cfg.livePersona = userId;
  cfg.defaultPersona = userId;
  writeConfig(cfg);
}

function clearHookPersona() {
  const cfg = readConfig();
  delete cfg.livePersona;
  writeConfig(cfg);
}

module.exports = { syncHookPersona, clearHookPersona, configPath };
