const logEl = document.getElementById('log');
const promptEl = document.getElementById('prompt-text');
const api = window.engrammic;

function log(msg) {
  logEl.textContent = `${new Date().toLocaleTimeString()} ${msg}\n${logEl.textContent}`.trim();
}

function setDone(id, done) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('done', done);
}

async function getStatus() {
  if (api) return api.getStatus();
  const res = await fetch('http://127.0.0.1:8793/api/status');
  return res.json();
}

async function refresh() {
  let status;
  try {
    status = await getStatus();
  } catch {
    try {
      status = await fetch('http://127.0.0.1:8790/setup/status').then((r) => r.json());
    } catch {
      log('Waiting for gateway…');
      return;
    }
  }
  setDone('step-stack', true);
  setDone('step-device', status.ready || status.skillInstalled);
  setDone('step-mcp', status.mcpAuthenticated);
  setDone('step-cursor', status.cursorConnected || status.ready);
  setDone('step-prompt', status.ready && status.mcpAuthenticated);
  log(`status ready=${status.ready} mcp=${status.mcpAuthenticated}`);
}

document.getElementById('btn-setup').addEventListener('click', async () => {
  log('Running full device setup…');
  if (api) {
    await api.runFullSetup();
  } else {
    await fetch('http://127.0.0.1:8793/api/run-setup', { method: 'POST' });
  }
  await refresh();
});

document.getElementById('btn-mcp').addEventListener('click', async () => {
  log('Opening MCP login…');
  if (api) {
    await api.openMcpLogin();
  } else {
    window.open('http://127.0.0.1:8790/mcp/login', '_blank');
  }
});

document.getElementById('btn-cursor').addEventListener('click', async () => {
  log('Connecting Cursor…');
  if (api) {
    await api.connectCursor();
  } else {
    await fetch('http://127.0.0.1:8793/api/connect-cursor', { method: 'POST' });
  }
  await refresh();
});

document.getElementById('btn-companion').addEventListener('click', async () => {
  if (api) {
    await api.openCompanion();
  } else {
    window.open('http://127.0.0.1:8792/', '_blank');
  }
});

document.getElementById('btn-copy').addEventListener('click', async () => {
  const prompt = api
    ? await api.getOnboardingPrompt()
    : (await fetch('http://127.0.0.1:8793/api/prompt').then((r) => r.json())).prompt;
  await navigator.clipboard.writeText(prompt);
  log('Copied onboarding prompt');
});

(async () => {
  try {
    const prompt = api
      ? await api.getOnboardingPrompt()
      : (await fetch('http://127.0.0.1:8793/api/prompt').then((r) => r.json())).prompt;
    promptEl.textContent = prompt;
  } catch {
    promptEl.textContent = 'Start Engrammic onboarding';
  }
  await refresh();
  setInterval(refresh, 5000);
})();
