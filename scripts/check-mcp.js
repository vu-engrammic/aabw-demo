#!/usr/bin/env node
const { mcpConfig } = require('../services/gateway/lib/mcp-config');
const { callMcpTool } = require('../services/gateway/lib/mcp-session');
const { ensureValidToken, TOKEN_PATH } = require('./mcp-login');

async function main() {
  await ensureValidToken().catch(() => {});
  const cfg = mcpConfig();
  console.log('Engrammic MCP URL:', cfg.url);
  console.log('Token configured:', cfg.token ? 'yes' : 'no');
  if (cfg.source) console.log('Token source:', cfg.source);

  if (!cfg.token) {
    console.log('\nConnect Engrammic for live graph + recall:');
    console.log('  npm run mcp:login');
    console.log('  or open http://127.0.0.1:8790/mcp/login');
    console.log(`\nToken will be saved to ${TOKEN_PATH}`);
    process.exit(1);
  }

  const recall = await callMcpTool('recall', {
    query: 'memory knowledge wisdom organization',
    top_k: 5,
    depth: 0,
    min_threshold: 0,
  });
  if (!recall.ok) {
    console.error('Recall probe failed:', recall.error);
    console.log('Try: npm run mcp:login');
    process.exit(2);
  }

  console.log('Recall probe OK — nodes:', recall.data?.results?.length || 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(3);
});
