const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const http = require('node:http');
const { getAppRoot, getNodeBin } = require('./paths');
const { createEmbedServer, PORT: EMBED_PORT } = require('./embed-server');
const logger = require('./logger');

let tray = null;
let win = null;
let embedServer = null;
let stackStarted = false;
let ROOT = null;
let deviceSetup = null;

const hiddenStart = process.argv.includes('--hidden');
const UI_URL = `http://127.0.0.1:${EMBED_PORT}/`;

function loadDeviceSetup() {
  if (!deviceSetup) {
    ROOT = getAppRoot();
    process.env.AABW_HOME = ROOT;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    deviceSetup = require(path.join(ROOT, 'services', 'gateway', 'lib', 'device-setup'));
  }
  return deviceSetup;
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startStack() {
  if (stackStarted) return;
  stackStarted = true;
  ROOT = getAppRoot();
  process.env.AABW_HOME = ROOT;
  const script = path.join(ROOT, 'scripts', 'start-stack.js');
  const nodeBin = getNodeBin();
  logger.log(`startStack node=${nodeBin} script=${script} cwd=${ROOT}`);
  if (!fs.existsSync(nodeBin)) {
    logger.error(`bundled node missing: ${nodeBin}`);
    return;
  }
  if (!fs.existsSync(script)) {
    logger.error(`start-stack missing: ${script}`);
    return;
  }
  spawn(nodeBin, [script], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, AABW_HOME: ROOT, AABW_SKIP_COMPANION: '1' },
  }).unref();
}

async function waitForGateway(maxMs = 12000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await ping('http://127.0.0.1:8790/health')) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function ensureEmbedServer() {
  if (embedServer) return;
  const uiDir = path.join(__dirname, 'companion-ui');
  if (!fs.existsSync(path.join(uiDir, 'index.html'))) {
    throw new Error(`Missing embedded UI at ${uiDir}`);
  }
  const started = await createEmbedServer();
  embedServer = started.server;
  logger.log(`embed server on ${UI_URL}`);
}

function trayIcon() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      return img.resize({ width: 16, height: 16 });
    }
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#1a1a1f"/><text x="16" y="22" text-anchor="middle" font-size="16" fill="#f3efe6">E</text></svg>';
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function buildMenu() {
  const ds = loadDeviceSetup();
  return Menu.buildFromTemplate([
    {
      label: 'Show Engrammic',
      click: () => showWindow(),
    },
    {
      label: 'Connect agent (hooks + skill)',
      click: () => {
        ds.connectAgent({ home: ROOT, syncMcp: true });
      },
    },
    {
      label: 'Sign in Engrammic MCP',
      click: () => shell.openExternal('http://127.0.0.1:8790/mcp/login'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
}

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(trayIcon());
    tray.setToolTip('Engrammic Companion');
    tray.setContextMenu(buildMenu());
    tray.on('double-click', () => showWindow());
    logger.log('tray created');
  } catch (err) {
    logger.error(`tray failed: ${err.message}`);
  }
}

function showWindow() {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  logger.log('creating companion window');
  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    autoHideMenuBar: true,
    title: 'Engrammic · Org Memory',
    show: false,
    center: true,
    backgroundColor: '#f3efe6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    logger.log('companion window visible');
  });
  win.loadURL(UI_URL);
  win.on('closed', () => {
    win = null;
  });
}

async function bootstrapBackground() {
  await ensureEmbedServer();
  startStack();
  const gatewayUp = await waitForGateway();
  logger.log(`gateway ready=${gatewayUp}`);

  try {
    const ds = loadDeviceSetup();
    const status = ds.readSetupStatus(ROOT);
    if (!status.ready) {
      ds.runDeviceSetup({ home: ROOT, syncMcp: true, start: false });
      logger.log('device setup applied');
    }
  } catch (err) {
    logger.error(`device setup failed: ${err.message}`);
  }
}

function installCrashHandlers() {
  process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${err.stack || err.message}`);
  });
  process.on('unhandledRejection', (err) => {
    logger.error(`unhandledRejection: ${err?.stack || err?.message || String(err)}`);
  });
}

installCrashHandlers();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.log('second instance — exiting (primary will focus)');
  app.quit();
} else {
  app.on('second-instance', () => {
    logger.log('second-instance — focusing window');
    showWindow();
  });

  app.whenReady().then(async () => {
    const pkg = require('./package.json');
    logger.log(`ready v${pkg.version} packaged=${app.isPackaged} hiddenStart=${hiddenStart} log=${logger.logPath}`);
    ROOT = getAppRoot();
    process.env.AABW_HOME = ROOT;

    createTray();

    try {
      await bootstrapBackground();
    } catch (err) {
      logger.error(`bootstrap failed: ${err.message}`);
    }

    if (!hiddenStart) {
      showWindow();
    } else {
      logger.log('started hidden (login item)');
    }

    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        args: ['--hidden'],
      });
    }
  });

  app.on('window-all-closed', (e) => {
    e.preventDefault();
  });
}
