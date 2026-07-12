// scripts/test-rbac-filter.js — unit checks for ingest tags + post-filter (no network)
const assert = require('node:assert/strict');
const {
  buildIngestTags,
  buildIngestMetadata,
  buildMetadataFilter,
  filterMemoriesForUser,
  teamSlug,
  DEPARTMENTS,
} = require('../services/gateway/lib/rbac-filter');

assert.equal(DEPARTMENTS.length, 8);
assert.equal(teamSlug('Legal & Compliance'), 'legal');
assert.equal(teamSlug('Executive Office'), 'executive');
assert.equal(teamSlug('ENG'), 'engineering');

assert.deepEqual(buildIngestTags({ classification: 'internal', team: 'Engineering' }), [
  'classification:internal',
  'team:engineering',
]);
assert.deepEqual(buildIngestTags({ classification: 'confidential', team: 'Human Resources' }), [
  'classification:confidential,team:human-resources',
]);
assert.deepEqual(buildIngestTags({ classification: 'restricted', team: 'Executive Office' }), [
  'classification:restricted',
  'team:executive',
]);

const meta = buildIngestMetadata({
  user: { userId: 'u1', department: 'Engineering' },
  classification: 'restricted',
  team: 'Executive Office',
  filename: 'exec-strategy.md',
});
assert.ok(meta.tags.includes('classification:restricted'));

const engEmployee = { userId: 'u004', role: 'employee', department: 'Engineering' };
const hrManager = { userId: 'u001', role: 'employee', department: 'Human Resources' };
const hrDirector = { userId: 'u006', role: 'director', department: 'Legal & Compliance' };
const executive = { userId: 'u007', role: 'executive', department: 'Executive Office' };

const engFilter = buildMetadataFilter(engEmployee);
assert.ok(engFilter.tags.includes('classification:internal'));
assert.ok(engFilter.tags.includes('classification:confidential,team:engineering'));
assert.ok(!engFilter.tags.some((t) => t.includes('restricted')));
assert.equal(engFilter.canSeeAll, false);
assert.equal(buildMetadataFilter(executive).canSeeAll, true);

// Employee confidential tag is own-dept (challenge: Own Department for employee/manager/director)
const hrEmpFilter = buildMetadataFilter(hrManager);
assert.ok(hrEmpFilter.tags.includes('classification:confidential,team:human-resources'));

const memories = [
  { id: 1, tags: ['classification:internal', 'team:human-resources'], text: 'probation 3 months' },
  { id: 2, tags: ['classification:confidential,team:engineering'], text: 'eng salary bands' },
  { id: 3, tags: ['classification:confidential,team:human-resources'], text: 'hr salary bands' },
  { id: 4, tags: ['classification:restricted', 'team:executive'], text: 'M&A pipeline' },
  { id: 5, text: 'untagged leak' },
];

assert.deepEqual(
  filterMemoriesForUser(memories, engEmployee).map((m) => m.id).sort(),
  [1, 2],
  'Engineering employee sees internal + own-dept confidential; not other-dept confidential or restricted'
);
assert.deepEqual(
  filterMemoriesForUser(memories, hrManager).map((m) => m.id).sort(),
  [1, 3],
  'HR employee sees internal + HR confidential; not eng confidential or restricted'
);
assert.deepEqual(
  filterMemoriesForUser(memories, hrDirector).map((m) => m.id).sort(),
  [1],
  'Legal director sees internal only (no legal confidential in fixture); not restricted'
);
assert.ok(
  !filterMemoriesForUser(memories, engEmployee).some((m) => m.id === 3),
  'Employee cannot see other-dept confidential'
);
assert.ok(
  !filterMemoriesForUser(memories, engEmployee).some((m) => m.id === 4),
  'Employee cannot see restricted'
);
assert.deepEqual(
  filterMemoriesForUser(memories, executive).map((m) => m.id).sort(),
  [1, 2, 3, 4, 5],
  'Executive sees all'
);

console.log('test-rbac-filter: OK');
