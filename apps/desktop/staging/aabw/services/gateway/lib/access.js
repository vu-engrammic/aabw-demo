/**
 * Silo selection, scope filtering, and permission-aware pack/graph trimming.
 *
 * Default behavior (no silo param or team department) matches pre-silo MVP:
 * team silo filters by department; recall without silo skips team filter.
 */

const SILO_PRIVATE = '__private__';
const SILO_DENIED = '__denied__';

const ROLE_RANK = { employee: 0, manager: 1, director: 2, executive: 3 };

function normTeam(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function userSilo(user) {
  return user?.department || 'Company';
}

function nodeScope(node) {
  return String(node?.scope || 'team').toLowerCase();
}

function nodeOwnerId(node) {
  return node?.ownerId || node?.owner || null;
}

function ownsNode(user, node) {
  if (!user || !node) return false;
  const oid = nodeOwnerId(node);
  if (!oid) return false;
  return oid === user.userId || oid === user.fullName;
}

function canSee(user, node) {
  if (!user) return false;
  const rank = ROLE_RANK[String(user.role || '').toLowerCase()] ?? 0;
  if (rank === 3) return true;
  const cls = String(node.classification || 'internal').toLowerCase();
  if (cls === 'restricted') return false;
  if (cls === 'confidential') {
    if (rank < 1) return false;
    return node.team === 'Company' || normTeam(node.team) === normTeam(user.department);
  }
  return true;
}

function selectedSilo(url, user) {
  const team = userSilo(user);
  const requested = String(url.searchParams.get('silo') || '').trim();
  if (!requested || requested === team || requested === 'all') return team;
  if (requested === 'private' || requested === SILO_PRIVATE) return SILO_PRIVATE;
  return SILO_DENIED;
}

function inSilo(node, silo, user) {
  if (!node || silo === SILO_DENIED) return false;
  if (!user) return false;

  const scope = nodeScope(node);

  if (silo === SILO_PRIVATE) {
    return scope === 'private' && ownsNode(user, node);
  }

  if (scope === 'private') return false;

  return normTeam(node.team) === normTeam(silo);
}

function filterBySilo(nodes, { user, silo } = {}) {
  const requested = String(silo || '').trim();
  if (!requested || requested === 'all') return nodes;
  if (requested === SILO_DENIED) return [];
  return nodes.filter((n) => inSilo(n, requested, user));
}

function resolveWriteTarget(silo, user) {
  const team = userSilo(user);
  if (silo === SILO_PRIVATE) {
    return { team, scope: 'private', ownerId: user.userId };
  }
  if (silo === SILO_DENIED) {
    return { team, scope: 'team', ownerId: user.userId };
  }
  return { team: silo || team, scope: 'team', ownerId: user.userId };
}

function listSilos({ user } = {}) {
  const dept = userSilo(user);
  return [
    { id: SILO_PRIVATE, label: 'Personal', scope: 'private', locked: false },
    { id: dept, label: dept, scope: 'team', locked: true },
  ];
}

function scopeTags(scope, ownerId) {
  const tags = [];
  if (scope === 'private') {
    tags.push('scope-private');
    if (ownerId) tags.push(`owner:${ownerId}`);
  } else {
    tags.push('scope-team');
  }
  return tags;
}

function itemInPrivateSilo(item, user) {
  const tags = (item.tags || []).map((t) => String(t).toLowerCase());
  if (!tags.includes('scope-private') && !tags.includes('private')) return false;
  const ownerTag = tags.find((t) => t.startsWith('owner:'));
  if (ownerTag) return ownerTag === `owner:${user.userId}`;
  return true;
}

function filterContextPack(pack, user, silo) {
  if (!pack || !user || !silo || silo === userSilo(user)) return pack;
  if (silo !== SILO_PRIVATE) return pack;

  const filterItems = (items) => (items || []).filter((item) => itemInPrivateSilo(item, user));

  return {
    ...pack,
    capabilities: filterItems(pack.capabilities),
    claims: filterItems(pack.claims),
    beliefs: filterItems(pack.beliefs),
    observations: filterItems(pack.observations),
  };
}

function filterGraph(graph, user, silo) {
  if (!graph?.nodes || !user || !silo || silo === userSilo(user)) return graph;
  if (silo !== SILO_PRIVATE) return graph;

  const visibleIds = new Set(
    graph.nodes.filter((n) => itemInPrivateSilo(n, user)).map((n) => n.id)
  );

  return {
    ...graph,
    nodes: graph.nodes.filter((n) => visibleIds.has(n.id)),
    edges: (graph.edges || []).filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
  };
}

module.exports = {
  SILO_PRIVATE,
  SILO_DENIED,
  ROLE_RANK,
  normTeam,
  userSilo,
  nodeScope,
  nodeOwnerId,
  ownsNode,
  canSee,
  selectedSilo,
  inSilo,
  filterBySilo,
  resolveWriteTarget,
  listSilos,
  scopeTags,
  filterContextPack,
  filterGraph,
};
