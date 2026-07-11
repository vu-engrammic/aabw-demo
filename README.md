# My Tasco Knowledge Platform

AI-powered enterprise knowledge assistant with role-based access control.

Built with Hindsight for document RAG, Gemini for AI chat, and RBAC for secure access.

## Quick Start (Local)

1. Copy environment file:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY
   ```

2. Start services:
   ```bash
   docker compose up -d
   ```

3. Seed sample documents:
   ```bash
   node scripts/seed-docs.js
   ```

4. Start web app:
   ```bash
   cd apps/web && npm run dev
   ```

5. Open http://localhost:5173

## Demo Flow

1. **Login as Maya (employee, Engineering)**
   - Ask: "What is the probation period?" → Gets answer with citation
   - Ask: "What are the salary bands?" → Denied (confidential HR)

2. **Login as Priya (executive)**
   - Ask: "What are the salary bands?" → Gets full answer
   - Ask: "What's in the M&A pipeline?" → Gets restricted info

3. **Upload a document**
   - Upload any PDF/DOCX
   - Set classification
   - Search for content immediately

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  React UI   │────▶│   Gateway   │────▶│  Hindsight (Docker) │
│  (web app)  │     │  (Node.js)  │     │  - Vector search    │
└─────────────┘     └─────────────┘     │  - Gemini LLM       │
       │                   │            └─────────────────────┘
       │                   │
  Persona login       RBAC filter
  Doc upload          generation
  Chat UI             Metadata tags
  Citations           on retain/recall
```

- **Hindsight**: Document storage, chunking, vector search
- **Gateway**: Auth, RBAC filtering, Gemini chat
- **React**: Chat UI with citations

## RBAC Classification

| Classification | employee | manager+ | executive |
|----------------|----------|----------|-----------|
| public | ✓ | ✓ | ✓ |
| internal | ✓ | ✓ | ✓ |
| confidential | ✗ | ✓ own team | ✓ |
| restricted | ✗ | ✗ | ✓ |

## Deployment

See `infra/` for Pulumi GCP setup.

### CI/CD

`.github/workflows/deploy.yml` builds the web app and Gateway Docker image on every push/PR to
`main`, then (on `main` only) runs `pulumi up` and deploys to the GCP VM via SSH.

### Required Secrets

- `GEMINI_API_KEY`: Gemini API key
- `SESSION_SECRET`: Session encryption secret
- `GCP_PROJECT_ID`: Your GCP project ID (for deployment)
- `GCP_SA_KEY`: Service account JSON key (for deployment)
- `PULUMI_ACCESS_TOKEN`: Pulumi access token (for deployment)
- `VM_SSH_KEY`: SSH private key for VM access (for deployment)

## Development

```bash
npm install
npm --prefix apps/web install
npm --prefix services/gateway install

# Run gateway
node services/gateway/server.js

# Run web (separate terminal)
cd apps/web && npm run dev
```
