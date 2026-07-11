# My Tasco Knowledge Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-native enterprise knowledge platform with document RAG, RBAC-aware search, and Gemini-powered chat with citations.

**Architecture:** Self-hosted Hindsight for document storage/retrieval, Node.js gateway for auth/RBAC filter generation, React chat UI. Deploy to GCP VM via Pulumi.

**Tech Stack:** Hindsight 0.8.x (Docker), Node.js 20+, React 18, Gemini API, Pulumi (TypeScript), GitHub Actions

## Global Constraints

- Node.js 20+ required
- No new npm dependencies unless essential — use existing packages
- All API responses JSON, CORS enabled for localhost:5173
- Hindsight verbatim mode for document ingestion
- Gemini API for chat (not OpenAI)
- Session-based auth with existing persona system

---

## File Structure

### New Files
```
services/gateway/lib/hindsight.js      # Hindsight HTTP client
services/gateway/lib/chat.js           # Gemini chat with RAG context
services/gateway/lib/rbac-filter.js    # Build Hindsight filters from user
apps/web/src/Chat.jsx                  # Main chat view component
apps/web/src/Upload.jsx                # Document upload modal
docker-compose.yml                     # Local dev: Hindsight + Gateway
docker-compose.prod.yml                # Production: + Caddy reverse proxy
services/gateway/Dockerfile            # Gateway container
infra/                                 # Pulumi project
infra/index.ts                         # GCP resources
infra/Pulumi.yaml                      # Project config
.github/workflows/deploy.yml           # CI/CD pipeline
seed/documents/                        # Sample enterprise docs
```

### Modified Files
```
services/gateway/server.js             # Add /chat, modify /ingest
services/gateway/lib/access.js         # Export filter builder
services/gateway/package.json          # Add @google/generative-ai
apps/web/src/main.jsx                  # Replace nav with chat-focused UI
apps/web/src/components.jsx            # Simplify, keep Login
apps/web/src/style.css                 # Chat styling
.env.example                           # Add GEMINI_API_KEY, HINDSIGHT_URL
```

---

## Task 1: Docker Compose with Hindsight

**Files:**
- Create: `docker-compose.yml`
- Create: `services/gateway/Dockerfile`
- Modify: `.env.example`

**Interfaces:**
- Produces: Hindsight available at `http://localhost:8888` (API), `http://localhost:9999` (UI)

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: "3.8"

services:
  hindsight:
    image: ghcr.io/vectorize-io/hindsight:latest
    container_name: hindsight
    ports:
      - "8888:8888"
      - "9999:9999"
    environment:
      - HINDSIGHT_API_LLM_PROVIDER=gemini
      - HINDSIGHT_API_LLM_API_KEY=${GEMINI_API_KEY}
    volumes:
      - hindsight-data:/home/hindsight/.pg0
    restart: unless-stopped

  gateway:
    build: ./services/gateway
    container_name: gateway
    ports:
      - "8790:8790"
    environment:
      - GATEWAY_PORT=8790
      - HINDSIGHT_URL=http://hindsight:8888
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET:-dev-secret-change-me}
    depends_on:
      - hindsight
    volumes:
      - ./services/gateway:/app
      - /app/node_modules

volumes:
  hindsight-data:
```

- [ ] **Step 2: Create Gateway Dockerfile**

```dockerfile
# services/gateway/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8790

CMD ["node", "server.js"]
```

- [ ] **Step 3: Update .env.example**

```bash
# .env.example - append these lines
GEMINI_API_KEY=your-gemini-api-key
HINDSIGHT_URL=http://localhost:8888
SESSION_SECRET=change-me-in-production
```

- [ ] **Step 4: Test Docker Compose starts**

Run: `docker compose up -d`
Expected: Both containers running, Hindsight UI at http://localhost:9999

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml services/gateway/Dockerfile .env.example
git commit -m "feat: add Docker Compose with Hindsight and Gateway"
```

---

## Task 2: Hindsight HTTP Client

**Files:**
- Create: `services/gateway/lib/hindsight.js`

**Interfaces:**
- Produces: `retainDocument({ file, metadata })`, `recallMemories({ query, tags, topK })`, `getDocuments()`

- [ ] **Step 1: Create hindsight.js client**

```javascript
// services/gateway/lib/hindsight.js
const { loadEnv } = require('./env');
loadEnv();

const HINDSIGHT_URL = process.env.HINDSIGHT_URL || 'http://localhost:8888';

async function hindsightFetch(path, options = {}) {
  const url = `${HINDSIGHT_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hindsight ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function retainDocument({ text, metadata = {}, mode = 'verbatim' }) {
  return hindsightFetch('/api/retain', {
    method: 'POST',
    body: JSON.stringify({
      content: text,
      metadata,
      extraction_mode: mode,
    }),
  });
}

async function retainFile({ buffer, filename, mimeType, metadata = {} }) {
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), filename);
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('extraction_mode', 'verbatim');

  const res = await fetch(`${HINDSIGHT_URL}/api/documents`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hindsight upload: ${res.status} ${text}`);
  }
  return res.json();
}

async function recallMemories({ query, tags = [], tagsMatch = 'any', topK = 10 }) {
  return hindsightFetch('/api/recall', {
    method: 'POST',
    body: JSON.stringify({
      query,
      tags: tags.length ? tags : undefined,
      tags_match: tagsMatch,
      max_tokens: 4096,
      budget: 'mid',
    }),
  });
}

async function healthCheck() {
  try {
    const res = await fetch(`${HINDSIGHT_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = {
  retainDocument,
  retainFile,
  recallMemories,
  healthCheck,
  HINDSIGHT_URL,
};
```

- [ ] **Step 2: Test health check works**

Run: `node -e "require('./services/gateway/lib/hindsight').healthCheck().then(console.log)"`
Expected: `true` (with Hindsight running)

- [ ] **Step 3: Commit**

```bash
git add services/gateway/lib/hindsight.js
git commit -m "feat: add Hindsight HTTP client"
```

---

## Task 3: RBAC Filter Builder

**Files:**
- Create: `services/gateway/lib/rbac-filter.js`

**Interfaces:**
- Consumes: User object `{ userId, role, department }`
- Produces: `buildMetadataFilter(user)` → `{ tags: string[], canSeeAll: boolean }`

- [ ] **Step 1: Create rbac-filter.js**

```javascript
// services/gateway/lib/rbac-filter.js

const ROLE_RANK = { employee: 0, manager: 1, director: 2, executive: 3 };

function getRoleRank(role) {
  return ROLE_RANK[String(role || '').toLowerCase()] ?? 0;
}

function buildMetadataFilter(user) {
  if (!user) {
    return { tags: [], canSeeAll: false, denied: true };
  }

  const rank = getRoleRank(user.role);
  const team = String(user.department || '').toLowerCase().replace(/\s+/g, '-');

  // Executive sees all
  if (rank >= 3) {
    return { tags: [], canSeeAll: true };
  }

  const tags = [];

  // Classification filter
  tags.push('classification:public');
  tags.push('classification:internal');

  // Manager+ can see confidential in own team
  if (rank >= 1) {
    tags.push(`classification:confidential,team:${team}`);
  }

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
      return 0;
    case 'confidential':
      return 1;
    case 'restricted':
      return 3;
    default:
      return 0;
  }
}

function buildIngestMetadata({ user, classification, team, filename }) {
  const userTeam = String(team || user.department || 'company').toLowerCase().replace(/\s+/g, '-');
  const cls = String(classification || 'internal').toLowerCase();

  return {
    classification: cls,
    team: userTeam,
    role_required: classificationToRoleRequired(cls),
    owner_id: user.userId,
    source_file: filename,
  };
}

module.exports = {
  ROLE_RANK,
  getRoleRank,
  buildMetadataFilter,
  buildIngestMetadata,
  classificationToRoleRequired,
};
```

- [ ] **Step 2: Add simple test**

```javascript
// Test inline
const { buildMetadataFilter, buildIngestMetadata } = require('./services/gateway/lib/rbac-filter');

// Employee should not see confidential/restricted
const maya = { userId: 'emp_maya', role: 'employee', department: 'Engineering' };
console.log('Maya filter:', buildMetadataFilter(maya));
// Expected: tags with public, internal only

// Executive sees all
const priya = { userId: 'exec_priya', role: 'executive', department: 'Executive' };
console.log('Priya filter:', buildMetadataFilter(priya));
// Expected: canSeeAll: true
```

Run: `node -e "...test code above..."`

- [ ] **Step 3: Commit**

```bash
git add services/gateway/lib/rbac-filter.js
git commit -m "feat: add RBAC filter builder for Hindsight metadata"
```

---

## Task 4: Gemini Chat Service

**Files:**
- Modify: `services/gateway/package.json`
- Create: `services/gateway/lib/chat.js`

**Interfaces:**
- Consumes: `recallMemories()` from hindsight.js
- Produces: `askQuestion({ query, user })` → `{ answer, sources, confidence, deniedCount }`

- [ ] **Step 1: Add Gemini dependency**

```bash
cd services/gateway && npm install @google/generative-ai
```

- [ ] **Step 2: Create chat.js**

```javascript
// services/gateway/lib/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { recallMemories } = require('./hindsight');
const { buildMetadataFilter } = require('./rbac-filter');
const { loadEnv } = require('./env');

loadEnv();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SYSTEM_PROMPT = `You are a knowledge assistant for Tasco employees.
Answer ONLY using the provided sources. If the answer isn't in the sources, say "I don't have information about that in the available documents."
Cite sources inline as [1], [2], etc. Be concise and helpful.`;

function buildSourcesContext(memories) {
  if (!memories?.length) return '';
  return memories
    .map((m, i) => {
      const file = m.metadata?.source_file || 'unknown';
      const text = m.text || m.content || '';
      return `[${i + 1}] (from: ${file})\n${text.slice(0, 500)}`;
    })
    .join('\n\n');
}

function extractSources(memories) {
  return memories.map((m, i) => ({
    id: i + 1,
    file: m.metadata?.source_file || 'unknown',
    chunk: (m.text || m.content || '').slice(0, 200),
    score: m.score || m.relevance || null,
  }));
}

function computeConfidence(memories) {
  if (!memories?.length) return 'none';
  const topScore = memories[0]?.score || memories[0]?.relevance || 0;
  if (topScore > 0.8) return 'high';
  if (topScore > 0.5) return 'medium';
  return 'low';
}

async function askQuestion({ query, user, topK = 8 }) {
  const filter = buildMetadataFilter(user);

  // Filtered recall
  const filteredResult = await recallMemories({
    query,
    tags: filter.tags,
    topK,
  });
  const memories = filteredResult.facts || filteredResult.memories || [];

  // Count denied (unfiltered minus filtered)
  let deniedCount = 0;
  if (!filter.canSeeAll && memories.length > 0) {
    try {
      const unfilteredResult = await recallMemories({ query, topK });
      const unfilteredCount = (unfilteredResult.facts || unfilteredResult.memories || []).length;
      deniedCount = Math.max(0, unfilteredCount - memories.length);
    } catch {
      // Ignore count errors
    }
  }

  if (!memories.length) {
    return {
      answer: "I don't have information about that in the available documents.",
      sources: [],
      confidence: 'none',
      deniedCount,
    };
  }

  const sourcesContext = buildSourcesContext(memories);
  const prompt = `${SYSTEM_PROMPT}

Sources:
${sourcesContext}

Question: ${query}`;

  const result = await model.generateContent(prompt);
  const answer = result.response.text();

  return {
    answer,
    sources: extractSources(memories),
    confidence: computeConfidence(memories),
    deniedCount,
  };
}

module.exports = { askQuestion };
```

- [ ] **Step 3: Commit**

```bash
git add services/gateway/package.json services/gateway/lib/chat.js
git commit -m "feat: add Gemini chat service with RAG context"
```

---

## Task 5: Gateway Chat Endpoint

**Files:**
- Modify: `services/gateway/server.js`

**Interfaces:**
- Consumes: `askQuestion()` from chat.js
- Produces: `POST /chat` endpoint

- [ ] **Step 1: Add imports to server.js**

Add after existing imports (around line 20):

```javascript
const { askQuestion } = require('./lib/chat');
const { buildIngestMetadata } = require('./lib/rbac-filter');
const { retainFile, healthCheck: hindsightHealth } = require('./lib/hindsight');
```

- [ ] **Step 2: Add /chat endpoint**

Add before the final 404 handler (around line 630):

```javascript
    if (req.method === 'POST' && url.pathname === '/chat') {
      const body = await readBody(req);
      const query = String(body.query || '').trim();
      if (!query) return send(req, res, 400, { error: 'Missing query' });

      try {
        const result = await askQuestion({ query, user });
        return send(req, res, 200, {
          ...result,
          user: auth.publicUser(user),
        });
      } catch (err) {
        return send(req, res, 502, { error: 'Chat service error: ' + err.message });
      }
    }
```

- [ ] **Step 3: Add Hindsight health to /health endpoint**

Modify the existing `/health` handler to include Hindsight status:

```javascript
    if (req.method === 'GET' && url.pathname === '/health') {
      const a = store.analytics();
      const mcp = mcpConfig();
      const hindsightOk = await hindsightHealth();
      return send(req, res, 200, {
        ok: true,
        service: 'mytasco-knowledge',
        hindsight: hindsightOk ? 'connected' : 'disconnected',
        engrammic: mcp.token ? 'mcp-authenticated' : 'mcp-token-missing',
        totals: a.totals,
        workos: auth.workosConfigured(),
        requestId: crypto.randomUUID(),
      });
    }
```

- [ ] **Step 4: Test chat endpoint**

Run: `curl -X POST http://localhost:8790/chat -H "Content-Type: application/json" -H "Cookie: session=..." -d '{"query":"test"}'`
Expected: JSON response with answer, sources, confidence

- [ ] **Step 5: Commit**

```bash
git add services/gateway/server.js
git commit -m "feat: add /chat endpoint with Gemini RAG"
```

---

## Task 6: Hindsight Document Ingest

**Files:**
- Modify: `services/gateway/server.js`

**Interfaces:**
- Consumes: `retainFile()` from hindsight.js, `buildIngestMetadata()` from rbac-filter.js
- Modifies: `POST /ingest/file` to use Hindsight

- [ ] **Step 1: Modify /ingest/file handler**

Replace the existing `/ingest/file` handler with:

```javascript
    if (req.method === 'POST' && url.pathname === '/ingest/file') {
      let multipart;
      try {
        multipart = await parseMultipart(req, { limit: INGEST_FILE_LIMIT });
      } catch (err) {
        const code = /too large/i.test(err.message || '') ? 413 : 400;
        return send(req, res, code, { error: err.message || 'Invalid multipart upload' });
      }

      const file = multipart.file;
      if (!file?.buffer?.length) return send(req, res, 400, { error: 'Missing file field' });

      const classification = multipart.fields?.classification || 'internal';
      const team = multipart.fields?.team || user.department;

      const metadata = buildIngestMetadata({
        user,
        classification,
        team,
        filename: file.filename,
      });

      try {
        const result = await retainFile({
          buffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimeType,
          metadata,
        });
        return send(req, res, 200, {
          ok: true,
          documentId: result.id || result.document_id,
          metadata,
          user: auth.publicUser(user),
        });
      } catch (err) {
        return send(req, res, 502, { error: 'Hindsight ingest failed: ' + err.message });
      }
    }
```

- [ ] **Step 2: Test file upload**

Run: `curl -X POST http://localhost:8790/ingest/file -H "Cookie: session=..." -F "file=@test.pdf" -F "classification=internal"`
Expected: JSON with documentId and metadata

- [ ] **Step 3: Commit**

```bash
git add services/gateway/server.js
git commit -m "feat: route document ingest through Hindsight"
```

---

## Task 7: React Chat UI

**Files:**
- Create: `apps/web/src/Chat.jsx`
- Modify: `apps/web/src/main.jsx`
- Modify: `apps/web/src/style.css`

**Interfaces:**
- Consumes: `POST /chat` API endpoint
- Produces: Chat view with query input, answer display, source cards, denied count

- [ ] **Step 1: Create Chat.jsx component**

```jsx
// apps/web/src/Chat.jsx
import React from "react";
import { api } from "./api";

export function Chat({ user }) {
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to get answer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-container">
      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question about company policies, procedures..."
          disabled={loading}
        />
        <button type="submit" className="primary" disabled={loading || !query.trim()}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="chat-result">
          <div className="answer-card">
            <div className="confidence-badge" data-level={result.confidence}>
              {result.confidence} confidence
            </div>
            <div className="answer-text">{result.answer}</div>
          </div>

          {result.sources?.length > 0 && (
            <div className="sources-section">
              <h3>Sources</h3>
              {result.sources.map((src) => (
                <div key={src.id} className="source-card">
                  <span className="source-id">[{src.id}]</span>
                  <span className="source-file">{src.file}</span>
                  <p className="source-chunk">{src.chunk}...</p>
                </div>
              ))}
            </div>
          )}

          {result.deniedCount > 0 && (
            <div className="denied-banner">
              {result.deniedCount} document{result.deniedCount > 1 ? "s" : ""} hidden by access level
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update main.jsx to use Chat as primary view**

Replace the NAV array and Shell component:

```jsx
// In main.jsx, replace NAV array with:
const NAV = [
  { id: "chat", label: "Ask", component: Chat },
  { id: "upload", label: "Upload", component: Upload },
];

// Update Shell to pass user to components:
function Shell({ user, onLogout }) {
  const [page, setPage] = React.useState("chat");
  const Active = NAV.find((n) => n.id === page).component;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>My Tasco</h1>
          <p className="eyebrow">Knowledge Assistant</p>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={page === n.id ? "nav-item active" : "nav-item"}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-line">
            <span>{user.fullName}</span>
            <span className="muted">{user.role} · {user.department}</span>
          </div>
          <button type="button" className="ghost" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Active user={user} />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Add Chat styles to style.css**

```css
/* Append to apps/web/src/style.css */

.chat-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.chat-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.chat-form input {
  flex: 1;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.answer-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.confidence-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-bottom: 0.75rem;
}

.confidence-badge[data-level="high"] { background: #22c55e; color: white; }
.confidence-badge[data-level="medium"] { background: #eab308; color: black; }
.confidence-badge[data-level="low"] { background: #ef4444; color: white; }
.confidence-badge[data-level="none"] { background: #6b7280; color: white; }

.answer-text {
  line-height: 1.6;
  white-space: pre-wrap;
}

.sources-section {
  margin-top: 1.5rem;
}

.sources-section h3 {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.source-card {
  background: var(--bg-tertiary);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.source-id {
  font-weight: 600;
  margin-right: 0.5rem;
}

.source-file {
  color: var(--text-muted);
}

.source-chunk {
  margin-top: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.denied-banner {
  background: #fef3c7;
  color: #92400e;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  margin-top: 1rem;
}

.error-banner {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}
```

- [ ] **Step 4: Test chat UI**

Run: `cd apps/web && npm run dev`
Open: http://localhost:5173, login, ask a question
Expected: Chat interface loads, queries work

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/Chat.jsx apps/web/src/main.jsx apps/web/src/style.css
git commit -m "feat: add Chat UI with sources and denied count"
```

---

## Task 8: Upload Component

**Files:**
- Create: `apps/web/src/Upload.jsx`
- Modify: `apps/web/src/main.jsx` (import)

**Interfaces:**
- Consumes: `POST /ingest/file` API
- Produces: Upload modal with classification dropdown

- [ ] **Step 1: Create Upload.jsx**

```jsx
// apps/web/src/Upload.jsx
import React from "react";
import { api } from "./api";

const CLASSIFICATIONS = [
  { value: "public", label: "Public - All employees" },
  { value: "internal", label: "Internal - All employees" },
  { value: "confidential", label: "Confidential - Manager+ in department" },
  { value: "restricted", label: "Restricted - Executive only" },
];

export function Upload({ user }) {
  const [file, setFile] = React.useState(null);
  const [classification, setClassification] = React.useState("internal");
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("classification", classification);
    formData.append("team", user.department);

    try {
      const res = await fetch("/api/ingest/file", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  return (
    <div className="upload-container">
      <h2>Upload Document</h2>
      <p className="muted">Add documents to the knowledge base for your team.</p>

      <form onSubmit={handleUpload}>
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input").click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.docx,.pptx,.xlsx,.txt,.md"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ display: "none" }}
          />
          {file ? (
            <p><strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)</p>
          ) : (
            <p>Drop a file here or click to select</p>
          )}
        </div>

        <label className="field">
          <span>Classification</span>
          <select value={classification} onChange={(e) => setClassification(e.target.value)}>
            {CLASSIFICATIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Team</span>
          <input type="text" value={user.department} disabled />
        </label>

        <button type="submit" className="primary" disabled={!file || uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="success-banner">
          Document uploaded successfully. ID: {result.documentId}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add import to main.jsx**

```jsx
// Add to imports in main.jsx
import { Chat } from "./Chat.jsx";
import { Upload } from "./Upload.jsx";
```

- [ ] **Step 3: Add upload styles**

```css
/* Append to style.css */

.upload-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
}

.drop-zone {
  border: 2px dashed var(--border);
  border-radius: 8px;
  padding: 3rem 2rem;
  text-align: center;
  cursor: pointer;
  margin-bottom: 1.5rem;
  transition: border-color 0.2s;
}

.drop-zone:hover {
  border-color: var(--primary);
}

.field {
  display: block;
  margin-bottom: 1rem;
}

.field span {
  display: block;
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.field select,
.field input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
}

.success-banner {
  background: #d1fae5;
  color: #065f46;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-top: 1rem;
}
```

- [ ] **Step 4: Test upload**

Run: Upload a PDF, verify it appears in Hindsight
Expected: Success message, document searchable

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/Upload.jsx apps/web/src/main.jsx apps/web/src/style.css
git commit -m "feat: add document upload UI with classification"
```

---

## Task 9: Sample Documents

**Files:**
- Create: `seed/documents/*.md`
- Create: `scripts/seed-docs.js`

**Interfaces:**
- Produces: 10 sample documents for demo scenarios

- [ ] **Step 1: Create sample documents**

```bash
mkdir -p seed/documents
```

Create each document:

```markdown
<!-- seed/documents/hr-probation-policy.md -->
# Probation Period Policy

All new employees undergo a probation period of 3 months from their start date. During this period:

- Performance will be reviewed monthly
- Either party may terminate employment with 1 week notice
- Full benefits begin after successful completion
- Manager approval required to extend probation

Contact HR for questions about probation status.
```

```markdown
<!-- seed/documents/leave-policy.md -->
# Annual Leave Policy

Employees are entitled to annual leave as follows:

- Standard employees: 20 days per year
- After 5 years: 25 days per year
- After 10 years: 30 days per year

Leave must be requested 2 weeks in advance for periods over 5 days.
Unused leave may be carried over (max 5 days).
```

```markdown
<!-- seed/documents/expense-policy.md -->
# Travel Expense Claims

To submit a travel expense claim:

1. Complete the expense form within 30 days of travel
2. Attach all receipts (required for amounts over $25)
3. Submit via the Finance portal
4. Manager approval required for claims over $500
5. Reimbursement within 14 business days

Per diem rates: Domestic $75/day, International $120/day.
```

```markdown
<!-- seed/documents/product-release-process.md -->
# Product Release Process

CONFIDENTIAL - Product Team Only

Release cycle:
1. Feature freeze: 2 weeks before release
2. QA testing: 1 week
3. Staging deployment: 3 days before
4. Production release: Tuesday/Thursday only
5. Post-release monitoring: 48 hours

All releases require Product Lead sign-off.
```

```markdown
<!-- seed/documents/dev-environment.md -->
# Development Environment Setup

To request a new development environment:

1. Submit request via IT Service Desk
2. Select environment type (local VM, cloud sandbox)
3. Specify required services (database, cache, etc.)
4. Allow 2 business days for provisioning

Standard dev environments include: Node.js 20, Python 3.11, PostgreSQL 15.
```

```markdown
<!-- seed/documents/data-retention.md -->
# Data Retention Policy

Customer data retention requirements:

- Active customer data: Retained indefinitely
- Inactive accounts (>2 years): Archived
- Deleted accounts: Purged after 90 days
- Logs and analytics: 1 year retention
- Backups: 30-day rolling window

GDPR deletion requests must be processed within 30 days.
```

```markdown
<!-- seed/documents/exec-strategy.md -->
# Strategic Priorities 2027

RESTRICTED - Executive Only

Key strategic initiatives:
1. APAC market expansion (Q1-Q2)
2. Enterprise tier launch (Q2)
3. AI integration roadmap (ongoing)
4. Potential Series C (Q3)

Revenue target: 150% YoY growth
Headcount plan: +40 engineering, +15 sales
```

```markdown
<!-- seed/documents/salary-bands.md -->
# Engineering Compensation Bands

CONFIDENTIAL - HR Only

2026 Salary Bands (USD):
- Junior Engineer (L1): $85,000 - $110,000
- Engineer (L2): $110,000 - $140,000
- Senior Engineer (L3): $140,000 - $180,000
- Staff Engineer (L4): $180,000 - $230,000
- Principal Engineer (L5): $230,000 - $300,000

Equity grants vary by level and performance.
```

```markdown
<!-- seed/documents/ma-plans.md -->
# M&A Pipeline

RESTRICTED - Executive Only

Active acquisition targets:
1. DataSync Inc - Due diligence in progress
2. CloudMetrics - Initial discussions
3. AI startup (stealth) - Term sheet pending

Budget allocation: $50M authorized for strategic acquisitions.
Board approval required for deals >$20M.
```

```markdown
<!-- seed/documents/onboarding.md -->
# Welcome to Tasco

PUBLIC

Tasco is a leading enterprise software company helping businesses streamline operations through AI-powered solutions.

Founded: 2019
Headquarters: San Francisco, CA
Employees: 500+
Mission: Make enterprise knowledge accessible to everyone

Your first week:
- Day 1: IT setup, team introductions
- Day 2-3: Product overview, codebase tour
- Day 4-5: First tasks, buddy pairing
```

- [ ] **Step 2: Create seed script**

```javascript
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
```

- [ ] **Step 3: Run seed script**

Run: `node scripts/seed-docs.js`
Expected: All 10 documents ingested

- [ ] **Step 4: Commit**

```bash
git add seed/documents/ scripts/seed-docs.js
git commit -m "feat: add sample documents and seed script"
```

---

## Task 10: Pulumi Infrastructure

**Files:**
- Create: `infra/Pulumi.yaml`
- Create: `infra/index.ts`
- Create: `infra/package.json`

**Interfaces:**
- Produces: GCP VM, firewall, storage bucket via `pulumi up`

- [ ] **Step 1: Initialize Pulumi project**

```bash
mkdir -p infra && cd infra
npm init -y
npm install @pulumi/pulumi @pulumi/gcp @pulumi/command
```

- [ ] **Step 2: Create Pulumi.yaml**

```yaml
# infra/Pulumi.yaml
name: mytasco-infra
runtime: nodejs
description: My Tasco Knowledge Platform infrastructure
config:
  gcp:project: ${GCP_PROJECT_ID}
  gcp:region: us-central1
  gcp:zone: us-central1-a
```

- [ ] **Step 3: Create index.ts**

```typescript
// infra/index.ts
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as command from "@pulumi/command";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");

const project = gcpConfig.require("project");
const zone = gcpConfig.get("zone") || "us-central1-a";

// Firewall rule for HTTP/HTTPS
const firewall = new gcp.compute.Firewall("mytasco-firewall", {
  network: "default",
  allows: [
    { protocol: "tcp", ports: ["80", "443", "8790"] },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["mytasco"],
});

// Startup script to install Docker
const startupScript = `#!/bin/bash
apt-get update
apt-get install -y docker.io docker-compose
systemctl enable docker
systemctl start docker
usermod -aG docker $USER
`;

// VM instance
const instance = new gcp.compute.Instance("mytasco-vm", {
  machineType: "e2-medium",
  zone,
  tags: ["mytasco"],
  bootDisk: {
    initializeParams: {
      image: "ubuntu-os-cloud/ubuntu-2204-lts",
      size: 50,
    },
  },
  networkInterfaces: [{
    network: "default",
    accessConfigs: [{}], // Ephemeral public IP
  }],
  metadataStartupScript: startupScript,
  serviceAccount: {
    scopes: ["cloud-platform"],
  },
});

// Storage bucket for static assets
const bucket = new gcp.storage.Bucket("mytasco-static", {
  location: "US",
  uniformBucketLevelAccess: true,
  website: {
    mainPageSuffix: "index.html",
    notFoundPage: "index.html",
  },
});

// Make bucket public
const bucketIam = new gcp.storage.BucketIAMBinding("mytasco-static-public", {
  bucket: bucket.name,
  role: "roles/storage.objectViewer",
  members: ["allUsers"],
});

export const vmIp = instance.networkInterfaces[0].accessConfigs![0].natIp;
export const vmName = instance.name;
export const staticBucketUrl = pulumi.interpolate`https://storage.googleapis.com/${bucket.name}`;
```

- [ ] **Step 4: Test Pulumi preview**

Run: `cd infra && pulumi preview`
Expected: Shows resources to be created

- [ ] **Step 5: Commit**

```bash
git add infra/
git commit -m "feat: add Pulumi GCP infrastructure"
```

---

## Task 11: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: Docker build, Pulumi, SSH deploy
- Produces: Automated deployment on push to main

- [ ] **Step 1: Create deploy workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  GCP_REGION: us-central1

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm ci
          cd services/gateway && npm ci
          cd ../../apps/web && npm ci

      - name: Build web app
        run: cd apps/web && npm run build

      - name: Build Gateway Docker image
        run: |
          docker build -t mytasco-gateway:${{ github.sha }} ./services/gateway

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Pulumi
        uses: pulumi/actions@v5

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Setup gcloud
        uses: google-github-actions/setup-gcloud@v2

      - name: Pulumi up
        run: |
          cd infra
          npm ci
          pulumi stack select prod --create
          pulumi up --yes
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}

      - name: Deploy to VM
        run: |
          echo "${{ secrets.VM_SSH_KEY }}" > /tmp/ssh_key
          chmod 600 /tmp/ssh_key
          VM_IP=$(cd infra && pulumi stack output vmIp)
          ssh -o StrictHostKeyChecking=no -i /tmp/ssh_key ubuntu@$VM_IP << 'EOF'
            cd /opt/mytasco
            docker compose pull
            docker compose up -d
          EOF

      - name: Upload static assets
        run: |
          BUCKET=$(cd infra && pulumi stack output staticBucketUrl | sed 's|https://storage.googleapis.com/||')
          gsutil -m rsync -r apps/web/dist gs://$BUCKET
```

- [ ] **Step 2: Document required secrets**

Add to README:
```
Required GitHub Secrets:
- GCP_PROJECT_ID: Your GCP project ID
- GCP_SA_KEY: Service account JSON key
- PULUMI_ACCESS_TOKEN: Pulumi access token
- VM_SSH_KEY: SSH private key for VM access
- GEMINI_API_KEY: Gemini API key
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions CI/CD pipeline"
```

---

## Task 12: Production Docker Compose

**Files:**
- Create: `docker-compose.prod.yml`

**Interfaces:**
- Produces: Production-ready compose with Caddy reverse proxy

- [ ] **Step 1: Create production compose file**

```yaml
# docker-compose.prod.yml
version: "3.8"

services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - gateway
    restart: unless-stopped

  hindsight:
    image: ghcr.io/vectorize-io/hindsight:latest
    container_name: hindsight
    environment:
      - HINDSIGHT_API_LLM_PROVIDER=gemini
      - HINDSIGHT_API_LLM_API_KEY=${GEMINI_API_KEY}
    volumes:
      - hindsight-data:/home/hindsight/.pg0
    restart: unless-stopped

  gateway:
    image: mytasco-gateway:latest
    container_name: gateway
    environment:
      - GATEWAY_PORT=8790
      - HINDSIGHT_URL=http://hindsight:8888
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      - hindsight
    restart: unless-stopped

volumes:
  hindsight-data:
  caddy-data:
  caddy-config:
```

- [ ] **Step 2: Create Caddyfile**

```
# Caddyfile
{$DOMAIN:localhost} {
  reverse_proxy /api/* gateway:8790
  reverse_proxy /* {
    to gateway:8790
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.prod.yml Caddyfile
git commit -m "feat: add production Docker Compose with Caddy"
```

---

## Task 13: Final Integration Test & README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: Setup instructions, demo script

- [ ] **Step 1: Update README**

```markdown
# My Tasco Knowledge Platform

AI-powered enterprise knowledge assistant with role-based access control.

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

- **Hindsight**: Document storage, chunking, vector search
- **Gateway**: Auth, RBAC filtering, Gemini chat
- **React**: Chat UI with citations

## Deployment

See `infra/` for Pulumi GCP setup.

Required secrets:
- `GEMINI_API_KEY`
- `SESSION_SECRET`
- `GCP_PROJECT_ID` (for deployment)
```

- [ ] **Step 2: Run full integration test**

```bash
# Start everything
docker compose up -d
sleep 30  # Wait for Hindsight

# Seed docs
node scripts/seed-docs.js

# Start web
cd apps/web && npm run dev &

# Test chat endpoint
curl -X POST http://localhost:8790/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{"query":"What is the probation period?"}'
```

Expected: Answer with citation to hr-probation-policy.md

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add setup instructions and demo flow"
```

---

## Summary

| Task | Est. Time | Deliverable |
|------|-----------|-------------|
| 1. Docker Compose | 30 min | Local dev environment |
| 2. Hindsight Client | 30 min | API client module |
| 3. RBAC Filter | 30 min | Metadata filter builder |
| 4. Gemini Chat | 45 min | RAG chat service |
| 5. Chat Endpoint | 30 min | /chat API |
| 6. Document Ingest | 30 min | Hindsight upload |
| 7. Chat UI | 60 min | React chat view |
| 8. Upload UI | 45 min | Document upload modal |
| 9. Sample Docs | 30 min | 10 demo documents |
| 10. Pulumi Infra | 45 min | GCP resources |
| 11. CI/CD | 30 min | GitHub Actions |
| 12. Prod Compose | 20 min | Production setup |
| 13. README & Test | 30 min | Documentation |

**Total: ~8 hours** — leaves buffer for debugging and demo polish.
