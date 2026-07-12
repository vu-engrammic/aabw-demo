const DEFAULT_TTL_MS = 8_000;

let cache = {
  graph: null,
  fetchedAt: 0,
  version: 0,
};

function getCachedGraph({ maxAgeMs = DEFAULT_TTL_MS } = {}) {
  if (!cache.graph) return null;
  if (Date.now() - cache.fetchedAt > maxAgeMs) return null;
  return { ...cache.graph, cacheVersion: cache.version, cachedAt: cache.fetchedAt };
}

function setCachedGraph(graph) {
  cache.version += 1;
  cache.graph = graph;
  cache.fetchedAt = Date.now();
  return cache.version;
}

function invalidateGraphCache() {
  cache.fetchedAt = 0;
  cache.version += 1;
  return cache.version;
}

function graphCacheVersion() {
  return cache.version;
}

module.exports = {
  getCachedGraph,
  setCachedGraph,
  invalidateGraphCache,
  graphCacheVersion,
};
