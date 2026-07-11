const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('engrammic', {
  getStatus: () => ipcRenderer.invoke('setup:status'),
  connectCursor: () => ipcRenderer.invoke('setup:connect-cursor'),
  runFullSetup: () => ipcRenderer.invoke('setup:run-full'),
  openMcpLogin: () => ipcRenderer.invoke('setup:open-mcp-login'),
  openCompanion: () => ipcRenderer.invoke('setup:open-companion'),
  getOnboardingPrompt: () => ipcRenderer.invoke('setup:onboarding-prompt'),
});
