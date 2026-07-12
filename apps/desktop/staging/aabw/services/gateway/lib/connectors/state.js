const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STATE_PATH = path.join(os.homedir(), '.cursor', 'aabw-connectors.json');
const MAX_URI_INDEX = 4000;

const DEFAULT = {
  gmail: { lastSync: null, historyId: null, ingested: 0, lastError: null },
  uris: {},
};

function readState() {
  try {
    return { ...DEFAULT, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT, uris: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function hasIngested(uri) {
  return Boolean(readState().uris?.[uri]);
}

function markIngested(uri, nodeId) {
  const state = readState();
  if (!state.uris) state.uris = {};
  state.uris[uri] = { nodeId, at: new Date().toISOString() };
  const keys = Object.keys(state.uris);
  if (keys.length > MAX_URI_INDEX) {
    const drop = keys.slice(0, keys.length - MAX_URI_INDEX);
    for (const k of drop) delete state.uris[k];
  }
  writeState(state);
}

function updateConnector(name, patch) {
  const state = readState();
  state[name] = { ...(state[name] || {}), ...patch };
  writeState(state);
  return state[name];
}

function publicStatus() {
  const state = readState();
  return {
    gmail: {
      configured: Boolean(process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_CLIENT_ID),
      query: process.env.GMAIL_QUERY || 'newer_than:7d',
      ...state.gmail,
    },
    ingestedTotal: Object.keys(state.uris || {}).length,
  };
}

module.exports = {
  readState,
  writeState,
  hasIngested,
  markIngested,
  updateConnector,
  publicStatus,
  STATE_PATH,
};
