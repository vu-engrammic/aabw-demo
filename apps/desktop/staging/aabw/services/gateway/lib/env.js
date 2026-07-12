const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');

function repoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function envCandidates() {
  const list = [];
  if (process.env.AABW_ENV_FILE) list.push(process.env.AABW_ENV_FILE);
  if (process.env.AABW_HOME) list.push(path.join(process.env.AABW_HOME, '.env'));
  list.push(path.join(os.homedir(), '.cursor', 'aabw', '.env'));
  list.push(path.join(repoRoot(), '.env'));
  return list;
}

function loadEnv() {
  for (const filePath of envCandidates()) {
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath });
      return filePath;
    }
  }
  dotenv.config();
  return null;
}

module.exports = { loadEnv, envCandidates, repoRoot };
