const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LOG = path.join(os.homedir(), '.cursor', 'aabw-desktop.log');

function write(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, line);
  } catch {
    // ignore
  }
  if (level === 'ERROR') {
    console.error(msg);
  } else {
    console.log(msg);
  }
}

module.exports = {
  log: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
  logPath: LOG,
};
