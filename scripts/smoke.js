#!/usr/bin/env node
/**
 * Smoke test the org-memory store: seed, recall with ACL, conflict resolve, trace.
 */
const store = require('../services/gateway/lib/store');
const { seedIfEmpty } = require('../services/gateway/lib/seed-org');

store.reset();
seedIfEmpty();

const employee = { userId: 'emp_maya', role: 'employee', department: 'Engineering' };
const executive = { userId: 'exec_priya', role: 'executive', department: 'Executive' };

const empRecall = store.recall({ query: 'expense automation invoice ocr', user: employee });
const execRecall = store.recall({ query: 'board reporting pack', user: executive });
const empBoard = store.recall({ query: 'board reporting pack', user: employee });

console.log('employee "expense automation" hits:', empRecall.hits.length);
console.log('  top hit:', empRecall.hits[0]?.title);
console.log('executive "board pack" hits:', execRecall.hits.length);
console.log('employee "board pack" hits:', empBoard.hits.length, '(denied:', empBoard.deniedCount + ')');

const open = store.listConflicts('open');
console.log('open conflicts:', open.length);
const { belief } = store.resolveConflict(open[0].id, { winnerId: open[0].preferred, resolvedBy: 'smoke' });
console.log('resolved → belief:', belief.title);

const contested = store.recall({ query: 'annual leave days', user: employee });
const has20 = contested.hits.some((h) => h.layer === 'knowledge' && /20 days/.test(h.content));
console.log('superseded claim hidden after resolve (raw observation may remain):', !has20);

const trace = store.trace(empRecall.hits[0].id);
console.log('provenance depth for top capability:', trace.chain.length);

const a = store.analytics();
console.log('analytics:', JSON.stringify(a.totals));
console.log('duplication candidates:', a.duplication.length);

const pass =
  empRecall.hits.length > 0 &&
  execRecall.hits.length > 0 &&
  empBoard.hits.length === 0 &&
  !has20 &&
  trace.chain.length >= 2 &&
  a.duplication.length >= 1;

console.log(pass ? '\nSmoke test PASSED' : '\nSmoke test FAILED');
process.exit(pass ? 0 : 1);
