// scripts/seed-docs.js
const fs = require('node:fs');
const path = require('node:path');
const { retainDocument } = require('../services/gateway/lib/hindsight');
const { buildIngestMetadata } = require('../services/gateway/lib/rbac-filter');

const DOCS = [
  { file: 'hr-probation-policy.md', classification: 'internal', team: 'human-resources' },
  { file: 'leave-policy.md', classification: 'internal', team: 'human-resources' },
  { file: 'expense-policy.md', classification: 'internal', team: 'finance' },
  { file: 'product-release-process.md', classification: 'confidential', team: 'product' },
  { file: 'dev-environment.md', classification: 'internal', team: 'engineering' },
  { file: 'data-retention.md', classification: 'internal', team: 'engineering' },
  { file: 'exec-strategy.md', classification: 'restricted', team: 'executive' },
  { file: 'salary-bands.md', classification: 'confidential', team: 'human-resources' },
  { file: 'ma-plans.md', classification: 'restricted', team: 'executive' },
  { file: 'onboarding.md', classification: 'public', team: 'company' },
];

async function seedDocuments() {
  const docsDir = path.join(__dirname, '..', 'seed', 'documents');
  const systemUser = { userId: 'system', role: 'executive', department: 'System' };

  for (const doc of DOCS) {
    const filePath = path.join(docsDir, doc.file);
    const text = fs.readFileSync(filePath, 'utf8');

    const metadata = buildIngestMetadata({
      user: systemUser,
      classification: doc.classification,
      team: doc.team,
      filename: doc.file,
    });

    console.log(`Ingesting ${doc.file} (${doc.classification})...`);
    await retainDocument({ text, metadata });
  }

  console.log('Done seeding documents.');
}

seedDocuments().catch(console.error);
