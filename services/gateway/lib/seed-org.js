/**
 * Seed the demo-corp org memory: sources, observations, claims, capabilities,
 * beliefs, one planted contradiction (leave 15 vs 20), and query history.
 */
const store = require('./store');

const SOURCES = [
  { id: 'slack', name: 'Slack', category: 'chat', itemCount: 1240, status: 'synced' },
  { id: 'gdrive', name: 'Google Drive', category: 'docs', itemCount: 312, status: 'synced' },
  { id: 'confluence', name: 'Confluence', category: 'wiki', itemCount: 148, status: 'synced' },
  { id: 'jira', name: 'Jira', category: 'tickets', itemCount: 890, status: 'synced' },
  { id: 'github', name: 'GitHub', category: 'code', itemCount: 64, status: 'synced' },
  { id: 'notion', name: 'Notion', category: 'wiki', itemCount: 0, status: 'not_connected' },
];

function seedIfEmpty() {
  if (store.load().nodes.length > 0) return false;

  for (const s of SOURCES) {
    store.upsertSource({ ...s, lastSync: s.status === 'synced' ? new Date().toISOString() : null });
  }

  // ---- Memory: raw observations ----
  const memDriveLeave = store.addNode({
    layer: 'memory',
    title: 'Leave Policy (Drive)',
    content:
      'Effective January 1, 2026, full-time employees receive 15 days annual leave per calendar year. Leave accrues monthly; up to five unused days carry over with manager approval.',
    team: 'Human Resources',
    sourceUri: 'gdrive://demo-corp/policies/leave-policy.md',
    sourceTier: 'authoritative',
    tags: ['hr', 'leave', 'policy'],
    heat: 6,
  });

  const memSlackLeave = store.addNode({
    layer: 'memory',
    title: '#general — Maya on leave allowance',
    content:
      'Maya Chen: Can someone confirm the annual leave allowance for 2026? I heard during onboarding that full-time employees now get 20 days leave.',
    team: 'Human Resources',
    sourceUri: 'slack://demo-corp/general/2026-01-08',
    sourceTier: 'community',
    tags: ['hr', 'leave', 'rumor'],
    heat: 3,
  });

  const memDriveExpense = store.addNode({
    layer: 'memory',
    title: 'Expense Policy (Drive)',
    content:
      'Expenses over USD 250 require an itemized receipt and manager approval before reimbursement. Submit within 30 days of purchase.',
    team: 'Finance',
    sourceUri: 'gdrive://demo-corp/policies/expense-policy.md',
    sourceTier: 'authoritative',
    tags: ['finance', 'expense', 'policy'],
    heat: 4,
  });

  const memGhOcr = store.addNode({
    layer: 'memory',
    title: 'invoice-ocr pipeline README',
    content:
      "Sarah Kim's invoice OCR pipeline: preprocess (deskew + rescale to 300 DPI), extract vendor/tax-id/date/total, validate against expense policy, emit draft journal entry for review.",
    team: 'Finance',
    sourceUri: 'github://demo-corp/invoice-ocr/README.md',
    sourceTier: 'validated',
    tags: ['finance', 'ocr', 'workflow'],
    heat: 5,
  });

  const memSlackOcr = store.addNode({
    layer: 'memory',
    title: '#finance — Sarah on OCR accuracy',
    content:
      'Sarah Kim: the big unlock was rescaling every invoice to 300 DPI before extraction — accuracy went from ~81% to ~97%. Low-res photos from phones were the main failure mode.',
    team: 'Finance',
    sourceUri: 'slack://demo-corp/finance/2026-03-14',
    sourceTier: 'community',
    tags: ['finance', 'ocr', 'gotcha'],
    heat: 5,
  });

  const memConfRelease = store.addNode({
    layer: 'memory',
    title: 'Release process (Confluence)',
    content:
      'Every production release requires QA sign-off, a documented go/no-go decision with named owner, and rollback steps recorded before deploy.',
    team: 'Product',
    sourceUri: 'confluence://demo-corp/eng/release-process',
    sourceTier: 'validated',
    tags: ['product', 'release', 'process'],
    heat: 3,
  });

  const memJiraIncident = store.addNode({
    layer: 'memory',
    title: 'ENG-142 postmortem (Jira)',
    content:
      'Payment webhook outage postmortem: root cause was an unbounded retry loop. Action items: add circuit breaker, alert on retry saturation, document in runbook.',
    team: 'Engineering',
    sourceUri: 'jira://demo-corp/ENG-142',
    sourceTier: 'validated',
    tags: ['engineering', 'incident', 'postmortem'],
    heat: 2,
  });

  // ---- Knowledge: extracted claims ----
  const knLeave15 = store.addNode({
    layer: 'knowledge',
    title: 'Annual leave is 15 days',
    content: 'Full-time employees receive 15 days of annual leave per calendar year.',
    team: 'Human Resources',
    sourceTier: 'authoritative',
    tags: ['hr', 'leave', 'policy'],
    confidence: 0.92,
    heat: 4,
  });
  store.addEdge('DERIVED_FROM', knLeave15.id, memDriveLeave.id);

  const knLeave20 = store.addNode({
    layer: 'knowledge',
    title: 'Annual leave is 20 days (Slack claim)',
    content: 'Employees get 20 days of annual leave, per onboarding hearsay in Slack.',
    team: 'Human Resources',
    sourceTier: 'community',
    tags: ['hr', 'leave', 'rumor'],
    confidence: 0.55,
    heat: 2,
  });
  store.addEdge('DERIVED_FROM', knLeave20.id, memSlackLeave.id);

  const knExpense = store.addNode({
    layer: 'knowledge',
    title: 'Expense claims need receipts + manager approval over $250',
    content: 'Expenses over USD 250 require an itemized receipt and manager approval before reimbursement.',
    team: 'Finance',
    sourceTier: 'authoritative',
    tags: ['finance', 'expense'],
    confidence: 0.88,
    heat: 3,
  });
  store.addEdge('DERIVED_FROM', knExpense.id, memDriveExpense.id);

  const knOcrDpi = store.addNode({
    layer: 'knowledge',
    title: '300 DPI preprocessing is the OCR accuracy unlock',
    content:
      'Rescaling invoices to 300 DPI before extraction raises OCR accuracy from ~81% to ~97%; low-resolution phone photos are the dominant failure mode.',
    team: 'Finance',
    sourceTier: 'validated',
    tags: ['finance', 'ocr', 'gotcha'],
    confidence: 0.9,
    heat: 5,
  });
  store.addEdge('DERIVED_FROM', knOcrDpi.id, memSlackOcr.id);
  store.addEdge('DERIVED_FROM', knOcrDpi.id, memGhOcr.id);

  const knRelease = store.addNode({
    layer: 'knowledge',
    title: 'Releases require QA sign-off and documented go/no-go',
    content: 'Production releases require QA sign-off, a documented go/no-go decision, and recorded rollback steps.',
    team: 'Product',
    sourceTier: 'validated',
    tags: ['product', 'release'],
    confidence: 0.86,
    heat: 2,
  });
  store.addEdge('DERIVED_FROM', knRelease.id, memConfRelease.id);

  // ---- Knowledge: capabilities (prompts / workflows people reuse) ----
  const capOcr = store.addNode({
    layer: 'knowledge',
    type: 'capability',
    title: 'Invoice OCR workflow',
    content:
      'End-to-end invoice automation: deskew + rescale to 300 DPI, extract vendor / tax ID / date / total, validate against expense policy, emit a draft journal entry for human review.',
    whyItWorked:
      'Separates recognition, validation, and approval into distinct steps, and the 300 DPI preprocessing eliminated the dominant failure mode (low-res phone photos).',
    owner: 'Sarah Kim',
    team: 'Finance',
    sourceUri: 'github://demo-corp/invoice-ocr',
    sourceTier: 'validated',
    tags: ['finance', 'ocr', 'expense', 'workflow'],
    confidence: 0.9,
    heat: 9,
  });
  store.addEdge('DERIVED_FROM', capOcr.id, memGhOcr.id);
  store.addEdge('DERIVED_FROM', capOcr.id, memSlackOcr.id);

  const capPostmortem = store.addNode({
    layer: 'knowledge',
    type: 'capability',
    title: 'Incident postmortem prompt',
    content:
      'Prompt that turns raw incident notes into a structured postmortem: timeline, impact, root cause, mitigation, follow-up actions with owners.',
    whyItWorked: 'Forces a consistent structure so action items never get lost in prose.',
    owner: 'Elliot Rivera',
    team: 'Engineering',
    sourceTier: 'validated',
    tags: ['engineering', 'incident', 'prompt'],
    confidence: 0.85,
    heat: 4,
  });
  store.addEdge('DERIVED_FROM', capPostmortem.id, memJiraIncident.id);

  const capGoNoGo = store.addNode({
    layer: 'knowledge',
    type: 'capability',
    title: 'Release go/no-go assistant',
    content:
      'Assistant that assembles release scope, risk register, QA status, comms draft, and the go/no-go checklist into one review doc.',
    whyItWorked: 'Turns the release ritual into structured questions so no gate is skipped under deadline pressure.',
    owner: 'Priya Rao',
    team: 'Product',
    sourceTier: 'validated',
    tags: ['product', 'release', 'assistant'],
    confidence: 0.84,
    heat: 3,
  });
  store.addEdge('DERIVED_FROM', capGoNoGo.id, memConfRelease.id);

  const capOnboard = store.addNode({
    layer: 'knowledge',
    type: 'capability',
    title: 'Onboarding buddy prompt',
    content:
      'Prompt that personalizes a 30-day onboarding checklist by role and department, covering security training and internal tools.',
    whyItWorked: 'Personalizes by role while staying anchored to HR policy, so answers cite the handbook.',
    owner: 'Jonas Patel',
    team: 'Human Resources',
    classification: 'public',
    sourceTier: 'validated',
    tags: ['hr', 'onboarding', 'prompt'],
    confidence: 0.82,
    heat: 2,
  });

  const capExpenseCheck = store.addNode({
    layer: 'knowledge',
    type: 'capability',
    title: 'Expense receipt checker prompt',
    content:
      'Prompt that checks a submitted expense against policy: receipt present, itemized, under approval threshold, correct cost center.',
    whyItWorked: 'Catches policy violations before they reach a human approver.',
    owner: 'Sarah Kim',
    team: 'Finance',
    sourceTier: 'validated',
    tags: ['finance', 'expense', 'prompt'],
    confidence: 0.83,
    heat: 3,
  });
  store.addEdge('DERIVED_FROM', capExpenseCheck.id, memDriveExpense.id);

  // Deliberate near-duplicate in another team — feeds the duplication analytic.
  store.addNode({
    layer: 'knowledge',
    type: 'capability',
    title: 'Receipt validation prompt',
    content:
      'Prompt that validates a submitted expense receipt against policy: receipt attached, itemized, within approval threshold, right cost center.',
    whyItWorked: 'Blocks non-compliant receipts before manager review.',
    owner: 'Ops team',
    team: 'Operations',
    sourceTier: 'community',
    tags: ['operations', 'expense', 'prompt'],
    confidence: 0.7,
    heat: 1,
  });

  store.addNode({
    layer: 'knowledge',
    type: 'capability',
    title: 'Board reporting pack builder',
    content:
      'Workflow that assembles quarterly board pack: financial summary, KPI deltas, risk items, hiring plan.',
    whyItWorked: 'Standardizes the board narrative and pulls numbers from one vetted source.',
    owner: 'Priya Rao',
    team: 'Executive',
    classification: 'restricted',
    sourceTier: 'validated',
    tags: ['executive', 'reporting', 'workflow'],
    confidence: 0.88,
    heat: 2,
  });

  // ---- Wisdom: adopted beliefs ----
  const wisOcr = store.addNode({
    layer: 'wisdom',
    title: 'Adopted: invoice OCR with 300 DPI preprocessing',
    content:
      'The invoice OCR workflow with 300 DPI preprocessing is the adopted finance practice for invoice automation.',
    team: 'Finance',
    tags: ['finance', 'ocr', 'adopted'],
    confidence: 0.92,
    heat: 4,
  });
  store.addEdge('ABOUT', wisOcr.id, capOcr.id);
  store.addEdge('ABOUT', wisOcr.id, knOcrDpi.id);

  // ---- Planted contradiction ----
  store.addConflict({
    nodeA: knLeave15.id,
    nodeB: knLeave20.id,
    topic: 'Annual leave allowance',
    summary:
      'The authoritative Drive policy says 15 days annual leave; a Slack onboarding rumor says 20. One of these should supersede the other.',
    preferred: knLeave15.id,
  });

  // ---- Query history (heat + gaps) ----
  const seedQueries = [
    ['invoice ocr expense automation', 6],
    ['annual leave days', 4],
    ['release checklist', 3],
    ['postmortem template', 2],
    ['SOC2 evidence collection checklist', 0],
    ['customer refund policy', 0],
  ];
  for (const [q, hits] of seedQueries) store.recordQuery(q, hits, 'seed');

  return true;
}

module.exports = { seedIfEmpty, SOURCES };
