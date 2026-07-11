const { syncGmail, probeGmail } = require('./gmail');
const { publicStatus } = require('./state');

let syncTimer = null;

async function probeAll() {
  const gmail = await probeGmail();
  return { gmail };
}

async function syncAll(user, opts = {}) {
  if (opts.gmail === false) return {};
  return { gmail: await syncGmail(user, opts) };
}

function startAutoSync(userResolver, intervalMs = 15 * 60 * 1000) {
  if (syncTimer) return;
  const tick = async () => {
    if (!process.env.GMAIL_REFRESH_TOKEN) return;
    try {
      const user = userResolver?.() || { userId: 'system', department: 'Engineering', fullName: 'AABW Sync' };
      await syncAll(user, { limit: 30 });
    } catch {
      // background sync — never crash gateway
    }
  };
  syncTimer = setInterval(tick, intervalMs);
  if (syncTimer.unref) syncTimer.unref();
  setTimeout(tick, 5000);
}

module.exports = {
  syncGmail,
  syncAll,
  probeAll,
  probeGmail,
  publicStatus,
  startAutoSync,
};
