#!/usr/bin/env node
/**
 * Build Windows installer (NSIS Setup.exe) for Engrammic Companion.
 * Output: apps/desktop/dist/Engrammic Companion Setup *.exe
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'apps', 'desktop');
const STAGING = path.join(DESKTOP, 'staging', 'aabw');

function log(msg) {
  console.log(msg);
}

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest, { skip = new Set() } = {}) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source: ${src}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) copyDir(from, to, { skip });
    else fs.copyFileSync(from, to);
  }
}

function stageRuntimeScripts() {
  const dest = path.join(STAGING, 'scripts');
  fs.mkdirSync(dest, { recursive: true });
  for (const name of ['start-stack.js', 'mcp-login.js']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', name), path.join(dest, name));
  }
}

function stageRuntime() {
  log('Staging runtime bundle…');
  rimraf(path.join(DESKTOP, 'staging'));
  fs.mkdirSync(STAGING, { recursive: true });

  const dirs = ['services/gateway', 'hooks', 'skills', 'seed'];
  for (const rel of dirs) {
    copyDir(path.join(ROOT, rel), path.join(STAGING, rel), {
      skip: new Set(['__pycache__', '.git']),
    });
  }
  stageRuntimeScripts();

  fs.writeFileSync(
    path.join(STAGING, 'package.json'),
    `${JSON.stringify(
      {
        name: 'aabw-runtime',
        private: true,
        version: '0.2.0',
        dependencies: {
          busboy: '^1.6.0',
          dotenv: '^16.4.7',
          'fast-xml-parser': '^4.5.3',
          jszip: '^3.10.1',
          mammoth: '^1.9.0',
          'pdf-parse': '^1.1.1',
        },
      },
      null,
      2
    )}\n`
  );

  log('Installing production node_modules in staging…');
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: STAGING,
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  });

  const runtimeDir = path.join(STAGING, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(runtimeDir, 'node.exe'));

  fs.writeFileSync(
    path.join(STAGING, 'install.json'),
    `${JSON.stringify({ builtAt: new Date().toISOString(), version: '0.2.0' }, null, 2)}\n`
  );

  fs.copyFileSync(
    path.join(ROOT, '.env.example'),
    path.join(STAGING, '.env.example')
  );
}

function ensureIcon() {
  log('Preparing transparent Engrammic logo…');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'prepare-icon.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-companion-ui.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  return path.join(DESKTOP, 'build', 'icon.png');
}

function runElectronBuilder() {
  log('Running electron-builder (NSIS)…');
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/F', '/IM', 'Engrammic Companion.exe'], { stdio: 'ignore', windowsHide: true });
      execFileSync('taskkill', ['/F', '/IM', 'aabw-companion.exe'], { stdio: 'ignore', windowsHide: true });
    } catch {
      // not running
    }
  }
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['electron-builder', '--win', 'nsis', '--publish', 'never'],
    {
      cwd: DESKTOP,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    }
  );
  if (result.status !== 0) {
    throw new Error(`electron-builder failed (exit ${result.status})`);
  }
}

function listOutput() {
  const dist = path.join(DESKTOP, 'dist');
  if (!fs.existsSync(dist)) return;
  log('\nBuild output:');
  for (const name of fs.readdirSync(dist)) {
    const p = path.join(dist, name);
    const stat = fs.statSync(p);
    if (stat.isFile()) {
      log(`  ${p} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
}

function main() {
  if (process.platform !== 'win32') {
    console.warn('Windows installer build is intended for win32; continuing anyway…');
  }
  stageRuntime();
  ensureIcon();
  runElectronBuilder();
  listOutput();

  log('\nVerifying packaged layout…');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-installer.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });

  log('\nDone. Run the Setup.exe from apps/desktop/dist/');
  log('If no window appears, check %USERPROFILE%\\.cursor\\aabw-desktop.log');
}

main();
