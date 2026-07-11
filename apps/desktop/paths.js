const { app } = require('electron');
const path = require('node:path');

function getAppRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'aabw');
  }
  return path.resolve(__dirname, '..', '..');
}

function getNodeBin() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'aabw', 'runtime', 'node.exe');
  }
  return process.env.AABW_NODE || 'node';
}

module.exports = { getAppRoot, getNodeBin };
