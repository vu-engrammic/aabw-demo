# Demo Script — My Tasco Knowledge Platform (5 minutes)

**Goal:** show an AI chat assistant that answers from real company documents *and* correctly
enforces role-based access control — the same query returns different results (or is denied
entirely) depending on who's asking.

**Setup before you start:**
```bash
docker compose up -d
node scripts/seed-docs.js   # ingests the 10 sample docs into Hindsight
cd apps/web && npm run dev  # http://localhost:5173
```
Keep the login screen open in one tab — you'll switch personas several times.

## Cast

| Persona | Role | Department |
|---|---|---|
| Maya Chen | employee | Engineering |
| Sarah Kim | manager | Finance |
| Jonas Patel | manager | Human Resources |
| Elliot Rivera | director | Product |
| Priya Rao | executive | Executive |

## Timeline

### 0:00 – 0:30 — Hook

"Tasco has policy docs, comp bands, and strategy decks scattered across drives, with no consistent
access control. My Tasco Knowledge Platform is a chat assistant that answers from all of it — but
only shows each person what their role allows."

### 0:30 – 1:30 — Baseline: a normal answer with citations

Log in as **Maya (employee, Engineering)**. Ask:

> "What is the probation period policy?"

Expect a cited answer ("3 months [1]") with a source card for `hr-probation-policy.md` and a
**high confidence** badge. Point out the inline citation and the source snippet — this is an
`internal`-classification doc, visible to every role.

### 1:30 – 2:15 — Access denied (wrong classification)

Still as Maya, ask:

> "What are the engineering salary bands?"

`salary-bands.md` is `confidential` / `team: human-resources`. Maya is `employee` rank, so the
tag filter excludes all confidential content — no matter the department. Expect either no answer
or an answer with **no sources**, and (if any HR-adjacent chunks partially matched) a
**"N documents hidden by access level"** banner. Call out: *"The document exists — Maya just isn't
allowed to see it, and the system tells her that without leaking content."*

### 2:15 – 3:00 — Access denied (right rank, wrong team)

Switch to **Sarah (manager, Finance)**. Ask the same question:

> "What are the engineering salary bands?"

Sarah is manager rank (≥1), so she *can* see confidential docs — but only within her own team
(`finance`). `salary-bands.md` is tagged `team: human-resources`, so she's still denied. This is
the key nuance: **role alone isn't enough — team scoping matters too.**

### 3:00 – 3:30 — Access granted (right rank, right team)

Switch to **Jonas (manager, Human Resources)**. Ask the same question again. Jonas is a manager
*and* HR is the owning team, so the confidential tag matches — he gets the full answer with the
salary table cited from `salary-bands.md`.

### 3:30 – 4:15 — Restricted tier + executive override

Ask Maya (or Jonas) about:

> "What's in the M&A pipeline?"

`ma-plans.md` is `restricted` — invisible to everyone except executives, regardless of team.
Denied for Maya/Jonas/Sarah/Elliot. Switch to **Priya (executive)** and ask the same question —
executives have `canSeeAll: true`, no tag filter at all, so she gets the full restricted answer.
Repeat quickly with:

> "What are our strategic priorities for next year?"

(`exec-strategy.md`, also `restricted`) to reinforce the pattern.

### 4:15 – 4:45 — Live ingest

Switch to **Elliot (director, Product)**. Go to **Upload**, drop a short PDF or `.md` file, set
classification to `internal`, submit. Immediately ask a question whose answer is only in that new
file — show the cited answer coming back within seconds, proving ingest → recall is synchronous
and near-instant (no reindex delay, no async job queue).

### 4:45 – 5:00 — Close

"Same assistant, same documents, five different answers depending on who's asking — enforced at
query time through metadata tags on every chunk, not through a separate permissions system bolted
on after the fact."

## Permission test-case cheat sheet

| # | Persona | Query | Expected result |
|---|---|---|---|
| 1 | Maya (employee, Engineering) | "What is the probation period policy?" | Allowed — internal, high confidence |
| 2 | Maya (employee, Engineering) | "What are the engineering salary bands?" | Denied — confidential |
| 3 | Sarah (manager, Finance) | "What are the engineering salary bands?" | Denied — confidential, wrong team (HR) |
| 4 | Jonas (manager, Human Resources) | "What are the engineering salary bands?" | Allowed — confidential, owning team |
| 5 | Maya (employee, Engineering) | "What's in the M&A pipeline?" | Denied — restricted |
| 6 | Priya (executive) | "What's in the M&A pipeline?" | Allowed — executive sees all |

## Backup queries (if something doesn't ingest in time)

| Query | Source doc | Classification |
|---|---|---|
| "How many annual leave days do I get?" | `leave-policy.md` | internal |
| "How do I submit a travel expense claim?" | `expense-policy.md` | internal |
| "How do I request a dev environment?" | `dev-environment.md` | internal |
| "What is the data retention policy?" | `data-retention.md` | internal |
| "What is the product release process?" | `product-release-process.md` | confidential (Product) |
| "Give me a company intro for new hires." | `onboarding.md` | public |
