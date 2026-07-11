const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

function readEnvFile() {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    return '';
  }
}

function upsertEnv(key, value) {
  let env = readEnvFile();
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(env)) {
    env = env.replace(re, line);
  } else {
    env = `${env.trim()}\n${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, env);
}

function upsertEnvMany(entries) {
  for (const [key, value] of Object.entries(entries)) {
    if (value != null && value !== '') upsertEnv(key, value);
  }
}

module.exports = { ENV_PATH, upsertEnv, upsertEnvMany, readEnvFile };
