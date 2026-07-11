# My Tasco Knowledge Platform — Design Spec

**Date:** 2026-07-11  
**Hackathon:** 13 hours  
**Stack:** Hindsight 0.8.x (self-hosted Docker) + Node.js Gateway + React + Gemini API + GCP/Pulumi

---

## Problem

Tasco employees struggle to find organizational knowledge. Documents are scattered, search is keyword-based, and sensitive information lacks proper access control. The hackathon challenge: build an AI-native knowledge platform with RBAC.

## Solution

Self-hosted Hindsight for document RAG, thin Node.js gateway for auth/RBAC, React chat UI with citations, deployed to GCP via Pulumi.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  React UI   │────▶│   Gateway   │────▶│  Hindsight (Docker) │
│  (web app)  │     │  (Node.js)  │     │  - pg0 embedded     │
└─────────────┘     └─────────────┘     │  - Gemini LLM       │
       │                   │            └─────────────────────┘
       │                   │
  Persona login       RBAC filter
  Doc upload          generation
  Chat UI             Metadata tags
  Citations           on retain/recall
```

### Flow

1. User logs in as persona (Maya/employee, Sarah/manager, Priya/exec)
2. Upload doc → Gateway adds metadata → Hindsight `retain` (verbatim mode)
3. Search query → Gateway builds tag filter from user role → Hindsight `recall`
4. AI answer → recalled chunks + Gemini → response with citations

### Services

| Service | Tech | Purpose |
|---------|------|---------|
| `apps/web` | React | Chat UI, upload, persona login |
| `services/gateway` | Node.js | Auth, RBAC, Hindsight proxy |
| Hindsight | Docker | Doc storage, chunking, embeddings, search |

---

## RBAC via Hindsight Metadata

### Document Metadata (on ingest)

```json
{
  "classification": "confidential",
  "team": "engineering",
  "role_required": 1,
  "owner_id": "emp_maya",
  "source_file": "engineering-roadmap.pdf"
}
```

### Classification Matrix

| Classification | employee | manager+ | executive |
|----------------|----------|----------|-----------|
| public | ✓ | ✓ | ✓ |
| internal | ✓ | ✓ | ✓ |
| confidential | ✗ | ✓ own team | ✓ |
| restricted | ✗ | ✗ | ✓ |

### Query-Time Filtering

Gateway builds Hindsight tag filter based on user:
- **Employee Maya (Engineering):** `classification IN [public, internal]` AND `team = engineering`
- **Manager Sarah (Finance):** `classification IN [public, internal, confidential]` AND `team = finance`
- **Executive Priya:** no filter (sees all)

### Denied-Count Disclosure

Two recalls: filtered + unfiltered count. Diff shown as "N documents hidden by access level."

---

## Document Ingestion

### Supported Formats

PDF, DOCX, PPTX, XLSX, TXT, MD, images

### Pipeline

```
POST /ingest/file (multipart)
  → Gateway extracts metadata from form
  → Hindsight POST /documents (file upload)
  → Hindsight verbatim mode (chunks preserved as-is)
  → Metadata attached: classification, team, role_required, source_file
```

### Chunking

Hindsight built-in (verbatim mode). No custom chunking — Hindsight handles extraction, chunking, embedding internally.

---

## AI Chat & Citations

### Flow

```
User query → Gateway auth check
           → Build metadata filter from user role
           → Hindsight recall (filtered)
           → Assemble context from chunks
           → Gemini prompt with sources
           → Response with inline citations
```

### Prompt Template

```
You are a knowledge assistant for Tasco employees.
Answer ONLY using the provided sources. If the answer isn't in the sources, say so.
Cite sources inline as [1], [2], etc.

Sources:
[1] {chunk1.text} (from: {chunk1.source_file})
[2] {chunk2.text} (from: {chunk2.source_file})

Question: {user_query}
```

### Response Format

```json
{
  "answer": "The probation period is 3 months [1]. During this time...",
  "sources": [
    { "id": 1, "file": "hr-policy.pdf", "chunk": "...", "page": 12 }
  ],
  "confidence": "high",
  "denied_count": 2
}
```

### Confidence Bands

- **High:** top chunk score > 0.8
- **Medium:** 0.5–0.8
- **Low:** < 0.5 or few matches

---

## Frontend UI

### Views

**1. Login** — Persona picker (Maya, Sarah, Jonas, Elliot, Priya) with role/department shown

**2. Chat** (main view)
```
┌─────────────────────────────────────────┐
│ [Search/Ask...]                    [Ask]│
├─────────────────────────────────────────┤
│ Answer with citations                   │
│ "The probation period is 3 months [1]"  │
│                                         │
│ Sources:                                │
│ ┌─[1] hr-policy.pdf (p.12)────────────┐ │
│ │ "All new employees undergo a 3..."  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ⚠ 2 documents hidden by access level   │
└─────────────────────────────────────────┘
```

**3. Upload** — Modal with drag-drop, classification dropdown, team selector

### Removed (not needed for hackathon)

Graph view, Inbox, Conflicts, Analytics, Sources pages

---

## Demo Scenarios

### 10 Example Q&A

| # | Question | Source | Classification |
|---|----------|--------|----------------|
| 1 | What is the probation period policy? | HR Policy | Internal |
| 2 | How many annual leave days? | Leave Policy | Internal |
| 3 | How do I submit a travel expense? | Expense Policy | Internal |
| 4 | What is the product release process? | Product Docs | Confidential |
| 5 | How do I request a dev environment? | Engineering Docs | Internal |
| 6 | What is the data retention policy? | Compliance Docs | Internal |
| 7 | Strategic priorities for next year? | Exec Strategy | Restricted |
| 8 | Salary bands for engineers? | HR Compensation | Confidential |
| 9 | What's in the M&A pipeline? | Exec Finance | Restricted |
| 10 | Company intro for new hires? | Onboarding | Public |

### 5 Permission Test Cases

| # | User | Query | Expected |
|---|------|-------|----------|
| 1 | Maya (employee, Eng) | "salary bands" | Denied — confidential HR |
| 2 | Sarah (manager, Finance) | "salary bands" | Denied — wrong dept |
| 3 | Jonas (manager, HR) | "salary bands" | Allowed |
| 4 | Maya (employee) | "M&A plans" | Denied — restricted |
| 5 | Priya (exec) | "M&A plans" | Allowed |

### Demo Flow (5 min)

1. Login as Maya → ask about leave policy → ✓ answer with citation
2. Ask about salary bands → ✗ "restricted by access level"
3. Switch to Priya (exec) → same query → ✓ full answer
4. Upload a new doc → search finds it immediately
5. Show denied count disclosure

---

## Infrastructure (GCP + Pulumi)

### Architecture

```
┌─────────────────────────────────────────────┐
│              Google Cloud Run               │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │   Gateway   │  │  Hindsight (Docker)  │  │
│  │  (Node.js)  │  │  - pg0 embedded      │  │
│  └─────────────┘  │  - Gemini API        │  │
│         │         └──────────────────────┘  │
│         │                    │              │
│  ┌──────┴────────────────────┘              │
│  │  Cloud Storage (doc uploads)             │
│  └──────────────────────────────────────────┤
│              Cloud CDN (React app)          │
└─────────────────────────────────────────────┘
```

### Pulumi Resources

- `gcp.cloudrun.Service` × 2 (gateway, hindsight)
- `gcp.storage.Bucket` (uploaded docs)
- `gcp.artifactregistry.Repository` (Docker images)

### CI/CD (GitHub Actions)

```
push to main → build Docker images
             → push to Artifact Registry
             → pulumi up (preview on PR, deploy on merge)
```

### Dockerfiles

- `services/gateway/Dockerfile` — Node.js app
- `docker-compose.yml` — local dev with Hindsight

### Secrets (Pulumi config)

- `GEMINI_API_KEY`
- `SESSION_SECRET`
- `HINDSIGHT_URL` (internal Cloud Run URL)

---

## Out of Scope

- WorkOS SSO integration (use demo personas)
- Connector integrations (Gmail, Drive, Slack)
- Async job queue (sync ingest, 120s timeout)
- Document versioning
- Full DMS UI (folders, search facets)
- Custom chunking pipeline

---

## Deliverables Checklist

- [ ] Hindsight Docker setup (local + GCP)
- [ ] Gateway Hindsight integration (retain/recall)
- [ ] RBAC metadata filtering
- [ ] Gemini chat endpoint with citations
- [ ] React chat UI with sources
- [ ] Document upload flow
- [ ] Pulumi GCP infrastructure
- [ ] GitHub Actions CI/CD
- [ ] 10 sample documents ingested
- [ ] Demo script with permission test cases
- [ ] README with setup instructions
