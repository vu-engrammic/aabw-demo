const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const GLOBAL_MCP_JSON = path.join(os.homedir(), '.cursor', 'mcp.json');

const INSTALL_NAME = 'engrammic';
const FIRST_ONBOARDING_PROMPT = 'Start Engrammic onboarding';
const RULE_MARKERS = {
  START: '<!-- engrammic:start -->',
  END: '<!-- engrammic:end -->',
};
const SHARED_SKILL_DIR = ['.agents', 'skills', INSTALL_NAME];
const INSTALL_MARKER = '.engrammic-install.json';
const PORTABLE_ROOT = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Engrammic',
  'Companion'
);

function repoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function cursorDir() {
  return path.join(os.homedir(), '.cursor');
}

function sharedSkillPath() {
  return path.join(os.homedir(), ...SHARED_SKILL_DIR);
}

function copyDir(src, dest, { skip = new Set() } = {}) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) copyDir(from, to, { skip });
    else fs.copyFileSync(from, to);
  }
  return true;
}

function agentRuleContent() {
  return `---
description: Engrammic org memory — live recall and governed context
alwaysApply: true
---

${RULE_MARKERS.START}

You are connected to **Engrammic Org Memory**.

- **Live recall** runs automatically through agent hooks (Cursor, Claude Code, etc.).
- **Engrammic MCP** provides recall, learn, trace, and graph at \`https://beta.engrammic.ai/mcp/\`.
- **Web UI**: http://127.0.0.1:5173/
- On first run or when the user asks to onboard, follow the \`engrammic\` skill onboarding flow (\`${FIRST_ONBOARDING_PROMPT}\`).

${RULE_MARKERS.END}
`;
}

function mergeHooks(existing, hookDir) {
  const ours = {
    workspaceOpen: [{ command: `node ${path.join(hookDir, 'workspace-open.js').replace(/\\/g, '/')}` }],
    beforeSubmitPrompt: [{ command: `node ${path.join(hookDir, 'before-submit-prompt.js').replace(/\\/g, '/')}` }],
  };
  const base = existing && typeof existing === 'object' ? existing : { version: 1, hooks: {} };
  base.version = base.version || 1;
  base.hooks = base.hooks || {};
  for (const [event, entries] of Object.entries(ours)) {
    const current = Array.isArray(base.hooks[event]) ? base.hooks[event] : [];
    const filtered = current.filter((e) => !String(e.command || '').includes('aabw'));
    base.hooks[event] = [...filtered, ...entries];
  }
  return base;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function syncGlobalCursorMcp() {
  return null;
}

function readMcpTokenFromAny(home) {
  const candidates = [
    path.join(home, '.cursor', 'aabw', 'mcp-token.json'),
    path.join(home, '.cursor', 'aabw', 'mcp-token'),
    path.join(os.homedir(), '.cursor', 'aabw', 'mcp-token.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8').trim();
      if (!raw) continue;
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        if (parsed.access_token) return parsed.access_token;
      } else if (!raw.includes('{')) {
        return raw;
      }
    } catch {
      // continue
    }
  }
  try {
    const cfg = readJson(GLOBAL_MCP_JSON);
    const auth = cfg?.mcpServers?.engrammic?.headers?.Authorization;
    if (auth) return auth.replace(/^Bearer\s+/i, '');
  } catch {
    // ignore
  }
  return null;
}

function installSkill(home = repoRoot()) {
  const src = path.join(home, 'skills', INSTALL_NAME);
  const dest = sharedSkillPath();
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
    throw new Error(`Skill source missing: ${src}`);
  }
  copyDir(src, dest);
  fs.writeFileSync(
    path.join(dest, INSTALL_MARKER),
    `${JSON.stringify(
      {
        name: INSTALL_NAME,
        installedBy: 'engrammic',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        home,
      },
      null,
      2
    )}\n`
  );
  return dest;
}

function installHooks(home = repoRoot()) {
  const cDir = cursorDir();
  const hookDir = path.join(cDir, 'hooks', 'aabw');
  fs.mkdirSync(hookDir, { recursive: true });
  fs.mkdirSync(path.join(cDir, 'aabw'), { recursive: true });

  fs.writeFileSync(
    path.join(cDir, 'aabw.json'),
    `${JSON.stringify(
      {
        home,
        gateway: process.env.AABW_GATEWAY || 'http://127.0.0.1:8790',
        web: process.env.WEB_ORIGIN || 'http://127.0.0.1:5173',
        installedAt: new Date().toISOString(),
        onboardingPrompt: FIRST_ONBOARDING_PROMPT,
      },
      null,
      2
    )}\n`
  );

  for (const name of ['before-submit-prompt.js', 'workspace-open.js']) {
    fs.copyFileSync(path.join(home, 'hooks', 'global', name), path.join(hookDir, name));
  }

  const hooksPath = path.join(cDir, 'hooks.json');
  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch {
    existing = null;
  }
  fs.writeFileSync(hooksPath, `${JSON.stringify(mergeHooks(existing, hookDir), null, 2)}\n`);
  return { configPath: path.join(cDir, 'aabw.json'), hooksPath, hookDir };
}

function installAgentRule(projectRoot) {
  const rulePath = path.join(projectRoot, '.cursor', 'rules', 'engrammic-context.mdc');
  fs.mkdirSync(path.dirname(rulePath), { recursive: true });
  fs.writeFileSync(rulePath, agentRuleContent());
  return rulePath;
}

function installUserAgentRule() {
  const rulePath = path.join(cursorDir(), 'rules', 'engrammic-context.mdc');
  fs.mkdirSync(path.dirname(rulePath), { recursive: true });
  fs.writeFileSync(rulePath, agentRuleContent());
  return rulePath;
}

const PORTABLE_MANIFEST = [
  'services/gateway',
  'scripts',
  'hooks',
  'skills',
  'package.json',
  'package-lock.json',
  'node_modules',
];

function installPortable(home = repoRoot()) {
  const dest = PORTABLE_ROOT;
  fs.mkdirSync(dest, { recursive: true });
  for (const rel of PORTABLE_MANIFEST) {
    const src = path.join(home, rel);
    const target = path.join(dest, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const stat = fs.statSync(src);
    if (stat.isDirectory()) copyDir(src, target, { skip: new Set(['.git']) });
    else fs.copyFileSync(src, target);
  }
  fs.writeFileSync(
    path.join(dest, 'install.json'),
    `${JSON.stringify({ installedAt: new Date().toISOString(), source: home }, null, 2)}\n`
  );
  return dest;
}

function resolveHome() {
  if (process.env.AABW_HOME) return process.env.AABW_HOME;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(cursorDir(), 'aabw.json'), 'utf8'));
    if (cfg?.home && fs.existsSync(cfg.home)) return cfg.home;
  } catch {
    // ignore
  }
  if (fs.existsSync(path.join(PORTABLE_ROOT, 'services', 'gateway', 'server.js'))) return PORTABLE_ROOT;
  const resourcesAabw = process.env.AABW_RESOURCES;
  if (resourcesAabw && fs.existsSync(path.join(resourcesAabw, 'services', 'gateway', 'server.js'))) {
    return resourcesAabw;
  }
  return repoRoot();
}

function readSetupStatus(home = resolveHome()) {
  const skillDir = sharedSkillPath();
  const skillOk = fs.existsSync(path.join(skillDir, 'SKILL.md'));
  const markerOk = fs.existsSync(path.join(skillDir, INSTALL_MARKER));
  const hooksOk = fs.existsSync(path.join(cursorDir(), 'hooks', 'aabw', 'workspace-open.js'));
  const configOk = fs.existsSync(path.join(cursorDir(), 'aabw.json'));
  const userRuleOk = fs.existsSync(path.join(cursorDir(), 'rules', 'engrammic-context.mdc'));
  const globalMcpOk = Boolean(readMcpTokenFromAny(home));
  const portableOk = fs.existsSync(path.join(PORTABLE_ROOT, 'install.json'));

  return {
    home,
    portableRoot: PORTABLE_ROOT,
    portableInstalled: portableOk,
    skillInstalled: skillOk,
    skillMarker: markerOk,
    hooksInstalled: hooksOk,
    configInstalled: configOk,
    userRuleInstalled: userRuleOk,
    globalMcpSynced: globalMcpOk,
    onboardingPrompt: FIRST_ONBOARDING_PROMPT,
    ready: skillOk && hooksOk && configOk,
    agentConnected: skillOk && hooksOk && userRuleOk,
    cursorConnected: skillOk && hooksOk && userRuleOk,
  };
}

function connectAgent({ home = repoRoot(), projectRoot = null, syncMcp = true } = {}) {
  const skillDir = installSkill(home);
  const hooks = installHooks(home);
  const userRule = installUserAgentRule();
  let projectRule = null;
  if (projectRoot) projectRule = installAgentRule(projectRoot);

  let mcpPath = null;
  if (syncMcp) {
    const token = readMcpTokenFromAny(home);
    if (token) mcpPath = path.join(home, '.cursor', 'aabw', 'mcp-token.json');
  }

  return {
    skillDir,
    ...hooks,
    userRule,
    projectRule,
    mcpPath,
    onboardingPrompt: FIRST_ONBOARDING_PROMPT,
    nextSteps: [
      'Sign in via Integrations → Connect MCP',
      'Restart your agent (Cursor, Claude Code, Codex, …) so hooks + skill load',
      `In agent chat, send: ${FIRST_ONBOARDING_PROMPT}`,
      'Open http://127.0.0.1:5173/ in your browser',
    ],
  };
}

function connectCursor(options = {}) {
  return connectAgent(options);
}

function runDeviceSetup(options = {}) {
  const home = options.home || repoRoot();
  let installHome = home;

  if (options.portable) {
    installHome = installPortable(home);
  }

  const result = connectCursor({
    home: installHome,
    projectRoot: options.project || null,
    syncMcp: options.syncMcp !== false,
  });

  return { ...result, home: installHome, status: readSetupStatus(installHome) };
}

module.exports = {
  INSTALL_NAME,
  FIRST_ONBOARDING_PROMPT,
  RULE_MARKERS,
  PORTABLE_ROOT,
  repoRoot,
  sharedSkillPath,
  installSkill,
  installHooks,
  installAgentRule,
  installUserAgentRule,
  installPortable,
  connectAgent,
  connectCursor,
  runDeviceSetup,
  readSetupStatus,
  syncGlobalCursorMcp,
  agentRuleContent,
};
