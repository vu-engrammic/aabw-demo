// services/gateway/lib/rbac-filter.js
//
// RBAC filter builder: translates a user's role/department into Hindsight
// tags (for recall) and ingest metadata/tags (for storage).

const ROLE_RANK = { employee: 0, manager: 1, director: 2, executive: 3 };

/** Canonical demo departments (codes match challenge dataset). */
const DEPARTMENTS = [
  { code: 'COMP', slug: 'company', en: 'Company', vi: 'Công ty', knowledge: 'company' },
  { code: 'HR', slug: 'human-resources', en: 'Human Resources', vi: 'Nhân sự', knowledge: 'department' },
  { code: 'FIN', slug: 'finance', en: 'Finance', vi: 'Tài chính', knowledge: 'department' },
  { code: 'PROD', slug: 'product', en: 'Product', vi: 'Sản phẩm', knowledge: 'department' },
  { code: 'ENG', slug: 'engineering', en: 'Engineering', vi: 'Kỹ thuật', knowledge: 'department' },
  { code: 'OPS', slug: 'operations', en: 'Operations', vi: 'Vận hành', knowledge: 'department' },
  { code: 'LEGAL', slug: 'legal', en: 'Legal & Compliance', vi: 'Pháp chế & Tuân thủ', knowledge: 'department' },
  { code: 'EXEC', slug: 'executive', en: 'Executive Office', vi: 'Ban Điều hành', knowledge: 'executive' },
];

function getRoleRank(role) {
  return ROLE_RANK[String(role || '').toLowerCase()] ?? 0;
}

function teamSlug(team) {
  const raw = String(team || '').trim().toLowerCase();
  if (!raw) return 'company';
  const byEn = DEPARTMENTS.find((d) => d.en.toLowerCase() === raw || d.slug === raw || d.code.toLowerCase() === raw);
  if (byEn) return byEn.slug;
  return raw
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'company';
}

function buildMetadataFilter(user) {
  if (!user) {
    return { tags: [], canSeeAll: false, denied: true };
  }

  const rank = getRoleRank(user.role);
  const team = teamSlug(user.department);

  // Executive sees all (including restricted / executive knowledge)
  if (rank >= 3) {
    return { tags: [], canSeeAll: true, team, rank };
  }

  // Company knowledge (public + internal) for everyone
  const tags = [
    'classification:public',
    'classification:internal',
    // Department knowledge — own team confidential for employee/manager/director
    `classification:confidential,team:${team}`,
  ];

  // restricted / executive knowledge intentionally omitted for non-executives

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
    case 'confidential':
      // Confidential is own-department for any non-exec role (employee+)
      return 0;
    case 'restricted':
      return 3;
    default:
      return 0;
  }
}

/**
 * Hindsight visibility tags for a document.
 * Confidential uses a compound tag so non-execs only see their own team.
 */
function buildIngestTags({ classification, team }) {
  const cls = String(classification || 'internal').toLowerCase();
  const slug = teamSlug(team);

  if (cls === 'confidential') {
    return [`classification:confidential,team:${slug}`];
  }
  if (cls === 'restricted') {
    return ['classification:restricted', `team:${slug}`];
  }
  return [`classification:${cls}`, `team:${slug}`];
}

function buildIngestMetadata({ user, classification, team, filename }) {
  const userTeam = teamSlug(team || user?.department || 'company');
  const cls = String(classification || 'internal').toLowerCase();
  const tags = buildIngestTags({ classification: cls, team: userTeam });

  return {
    classification: cls,
    team: userTeam,
    role_required: classificationToRoleRequired(cls),
    owner_id: user?.userId || 'system',
    source_file: filename,
    tags,
  };
}

/** Extract classification / team from a Hindsight memory for post-filter. */
function memoryAccessMeta(memory) {
  const meta = memory?.metadata || {};
  let classification = String(meta.classification || '').toLowerCase() || null;
  let team = meta.team ? teamSlug(meta.team) : null;

  const tags = memory?.tags || meta.tags || [];
  for (const tag of tags) {
    const t = String(tag);
    const compound = t.match(/^classification:(\w+),team:(.+)$/i);
    if (compound) {
      classification = compound[1].toLowerCase();
      team = teamSlug(compound[2]);
      continue;
    }
    const clsOnly = t.match(/^classification:(\w+)$/i);
    if (clsOnly && !classification) classification = clsOnly[1].toLowerCase();
    const teamOnly = t.match(/^team:(.+)$/i);
    if (teamOnly && !team) team = teamSlug(teamOnly[1]);
  }

  return { classification, team, tags };
}

/**
 * Defense-in-depth: drop memories the caller must not see even if Hindsight
 * returned them (e.g. untagged legacy docs, wrong tags_match).
 */
function filterMemoriesForUser(memories, user) {
  if (!Array.isArray(memories) || !memories.length) return [];
  if (!user) return [];
  if (getRoleRank(user.role) >= 3) return memories;

  const userTeam = teamSlug(user.department);

  return memories.filter((m) => {
    const { classification, team } = memoryAccessMeta(m);

    // Untagged / unknown → deny (fail closed)
    if (!classification) return false;

    if (classification === 'public' || classification === 'internal') return true;
    if (classification === 'restricted') return false;
    if (classification === 'confidential') {
      // Own department for employee / manager / director; executive handled above
      return Boolean(team && team === userTeam);
    }
    return false;
  });
}

module.exports = {
  ROLE_RANK,
  DEPARTMENTS,
  getRoleRank,
  teamSlug,
  buildMetadataFilter,
  buildIngestMetadata,
  buildIngestTags,
  classificationToRoleRequired,
  memoryAccessMeta,
  filterMemoriesForUser,
};
