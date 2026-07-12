#!/usr/bin/env node
// Delete a Hindsight document (and its memories) by document_id.
// Usage: node scripts/delete-hindsight-doc.js file_3e120df1-d4cb-4932-97f3-6a28bd82d2bb
const { deleteDocument, BANK_ID, HINDSIGHT_URL } = require('../services/gateway/lib/hindsight');

async function main() {
  const documentId = process.argv[2];
  if (!documentId) {
    console.error('Usage: node scripts/delete-hindsight-doc.js <document_id>');
    process.exit(1);
  }
  console.log(`Deleting ${documentId} from bank ${BANK_ID} at ${HINDSIGHT_URL}...`);
  const result = await deleteDocument(documentId);
  console.log('Deleted:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
