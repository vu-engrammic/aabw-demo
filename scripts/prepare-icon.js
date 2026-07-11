#!/usr/bin/env node
/**
 * Prepare Engrammic logo assets: transparent background + app icon sizes.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'apps', 'desktop', 'build');

const SOURCES = [
  path.join(
    ROOT,
    '.cursor',
    'projects',
    'c-Users-namel-Documents-aabw',
    'assets',
    'c__Users_namel_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_8-783f56f2-9db1-4975-a207-e9a26d39f62a.png'
  ),
  path.join(
    process.env.USERPROFILE || '',
    '.cursor',
    'projects',
    'c-Users-namel-Documents-aabw',
    'assets',
    'c__Users_namel_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_8-783f56f2-9db1-4975-a207-e9a26d39f62a.png'
  ),
  path.join(BUILD, 'logo-source.png'),
];

function findSource() {
  for (const p of SOURCES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('Engrammic logo source not found — place symbol PNG at apps/desktop/build/logo-source.png');
}

async function main() {
  let sharp;
  try {
    sharp = require(path.join(ROOT, 'apps', 'desktop', 'node_modules', 'sharp'));
  } catch {
    sharp = require('sharp');
  }

  fs.mkdirSync(BUILD, { recursive: true });
  const src = findSource();
  if (src !== path.join(BUILD, 'logo-source.png')) {
    fs.copyFileSync(src, path.join(BUILD, 'logo-source.png'));
  }

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Key out near-black background → transparent
    if (r < 40 && g < 40 && b < 40) {
      data[i + 3] = 0;
    }
  }

  const transparent = sharp(data, { raw: info });
  const pad = Math.round(Math.min(info.width, info.height) * 0.12);

  await transparent
    .clone()
    .png()
    .toFile(path.join(BUILD, 'logo-transparent.png'));

  for (const size of [256, 512]) {
    await transparent
      .clone()
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(BUILD, size === 256 ? 'icon.png' : 'icon-512.png'));
  }

  // Copy for companion UI
  const uiDir = path.join(ROOT, 'apps', 'companion', 'ui');
  fs.mkdirSync(uiDir, { recursive: true });
  fs.copyFileSync(path.join(BUILD, 'logo-transparent.png'), path.join(uiDir, 'logo.png'));

  console.log('Prepared transparent logo → apps/desktop/build/icon.png (256×256)');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
