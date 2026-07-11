// services/gateway/lib/rbac-filter.js
//
// RBAC filter builder: translates a user's role/department into Hindsight
// metadata filters (for recall) and ingest metadata (for storage).

const ROLE_RANK = { employee: 0, manager: 1, director: 2, executive: 3 };

function getRoleRank(role) {
  return ROLE_RANK[String(role || '').toLowerCase()] ?? 0;
}

function buildMetadataFilter(user) {
  if (!user) {
    return { tags: [], canSeeAll: false, denied: true };
  }

  const rank = getRoleRank(user.role);
  const team = String(user.department || '').toLowerCase().replace(/\s+/g, '-');

  // Executive sees all
  if (rank >= 3) {
    return { tags: [], canSeeAll: true };
  }

  const tags = [];

  // Classification filter
  tags.push('classification:public');
  tags.push('classification:internal');

  // Manager+ can see confidential in own team
  if (rank >= 1) {
    tags.push(`classification:confidential,team:${team}`);
  }

  return {
    tags,
    canSeeAll: false,
    team,
    rank,
  };
}

function classificationToRoleRequired(classification) {
  switch (String(classification).toLowerCase()) {
    case 'public':
    case 'internal':
      return 0;
    case 'confidential':
      return 1;
    case 'restricted':
      return 3;
    default:
      return 0;
  }
}

function buildIngestMetadata({ user, classification, team, filename }) {
  const userTeam = String(team || user.department || 'company').toLowerCase().replace(/\s+/g, '-');
  const cls = String(classification || 'internal').toLowerCase();

  return {
    classification: cls,
    team: userTeam,
    role_required: classificationToRoleRequired(cls),
    owner_id: user.userId,
    source_file: filename,
  };
}

module.exports = {
  ROLE_RANK,
  getRoleRank,
  buildMetadataFilter,
  buildIngestMetadata,
  classificationToRoleRequired,
};
