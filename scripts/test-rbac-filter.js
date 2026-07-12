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

const maya = { userId: 'emp_maya', role: 'employee', department: 'Engineering' };
const jonas = { userId: 'mgr_jonas', role: 'manager', department: 'Human Resources' };
const priya = { userId: 'exec_priya', role: 'executive', department: 'Executive Office' };

const mayaFilter = buildMetadataFilter(maya);
assert.ok(mayaFilter.tags.includes('classification:internal'));
assert.ok(!mayaFilter.tags.some((t) => t.includes('restricted')));
assert.equal(mayaFilter.canSeeAll, false);
assert.equal(buildMetadataFilter(priya).canSeeAll, true);

const memories = [
  { id: 1, tags: ['classification:internal', 'team:human-resources'], text: 'probation 3 months' },
  { id: 2, tags: ['classification:confidential,team:human-resources'], text: 'salary bands' },
  { id: 3, tags: ['classification:restricted', 'team:executive'], text: 'M&A pipeline' },
  { id: 4, text: 'untagged leak' },
];

assert.deepEqual(
  filterMemoriesForUser(memories, maya).map((m) => m.id),
  [1],
  'Maya sees only internal'
);
assert.deepEqual(
  filterMemoriesForUser(memories, jonas).map((m) => m.id).sort(),
  [1, 2],
  'Jonas sees internal + HR confidential'
);
assert.deepEqual(
  filterMemoriesForUser(memories, priya).map((m) => m.id).sort(),
  [1, 2, 3, 4],
  'Priya sees all'
);

console.log('test-rbac-filter: OK');
