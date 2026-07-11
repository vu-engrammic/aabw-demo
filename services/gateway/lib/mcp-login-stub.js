// Stub for production - MCP login not needed when using Hindsight
module.exports = {
  loginInteractive: async () => ({ ok: false, error: 'MCP login disabled in production' }),
  ensureValidToken: async () => {},
};
