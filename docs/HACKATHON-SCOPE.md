# Hackathon MVP — Document Ingestor

## In scope (ship today)
- Upload: PDF, DOCX, PPTX, TXT, MD, PNG, JPG
- Parse → markdown/text → `extractKnowledge` → Engrammic `remember`/`learn`
- `POST /ingest/file` (multipart, session auth)
- Companion Ingest: drag-drop + file picker + status
- Node parsers: PDF (pdf-parse), DOCX (mammoth), PPTX (jszip+xml), TXT/MD
- Python sidecar optional: OCR for images/scanned pages (pytesseract)
- Dedup: `file://{sha256}`

## Out of scope
- Paperless-ngx integration
- Full PaddleOCR GPU pipeline
- Document search/DMS UI
- Async job queue (sync only, 120s timeout)
- Gmail attachments

## Contract: doc-parser `POST /parse`
```json
// Response
{ "ok": true, "text": "...", "markdown": "...", "meta": { "filename", "mime", "sha256", "pages", "ocrUsed" } }
```
