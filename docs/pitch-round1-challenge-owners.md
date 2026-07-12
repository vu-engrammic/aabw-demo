# Round 1 Pitch — Tasco Challenge Owners

**Format:** 5 min pitch + 2 min Q&A + 1 min transition  
**Rehearse to 4:45.** Keep 15 seconds of safety.  
**Demo open before you start:** `just tunnel` → http://localhost:8080 · personas ready · seed healthy

Maps to Tasco’s stated need: turn enterprise knowledge into an **intelligent, secure, AI-powered assistant** — find accurate answers fast, only for authorized users.

---

## Speakable script (Five-Minute Map)

### 1. IDENTITY — 40s · Team + hook

Tasco asked for an intelligent, secure knowledge assistant. That’s what we built inside My Tasco.

Employees ask in plain language. They get accurate answers from policies, procedures, and ops docs — with citations. Sensitive content stays locked to the people who are allowed to see it.

One line to remember us by: **instant answers, authorized access.**

---

### 2. PROBLEM — 40s · Insight, not repetition

Organizations like Tasco generate huge volumes of documents — policies, procedures, reports, presentations, operational knowledge. Employees still struggle to find the *right* answer quickly. At the same time, the organization must keep sensitive information only in authorized hands.

What that costs in practice:

- People spend significant time searching  
- Knowledge is scattered across multiple systems and mini-apps  
- Important information sits underutilized  
- Onboarding and day-to-day decisions slow down  
- Keyword search fails to deliver relevant answers  
- Access control can’t be an afterthought — payroll, HR, strategy cannot leak

At Tasco scale — **150+ subsidiaries** sharing My Tasco — the same leave question can have different policy answers, and the same salary question must never reach the wrong team. Traditional search doesn’t solve either side of that.

*(Optional one-beat proof, only if you have seconds: when AI dumps noisy context into the prompt, accuracy drops ~30% — so “more search results” without judgment makes answers worse, not better. Deck p.3.)*

---

### 3. SOLUTION — 60s · Agentic workflow

We turn that document pile into an agent employees already know how to use — a chat inside My Tasco — that **plans clearance before it answers**.

Visible loop:

1. **GOAL** — Understand the employee’s question  
2. **PLAN** — Decide what knowledge is needed and what clearance applies  
3. **TOOLS** — Retrieve only documents tagged for their role and team  
4. **ACT** — Answer with source cards — or withhold and say content was hidden by access  
5. **VERIFY** — Show confidence + citations so the answer is auditable

If judges only see a chatbot, we failed. They should see the agent **decide, filter, act, and prove**.

That’s the opportunity you described: intelligent *and* secure — not intelligent *or* secure.

---

### 4. CREDIBILITY — 45s · Why it works

Not a mockup — live for judging:

- Deployed on GCP; we demo through a real tunnel  
- Four classification tiers matching enterprise needs: `public` → `internal` → `confidential` (team-scoped) → `restricted` (exec)  
- Query-time filter — access enforced *before* generation, not after  
- Every allowed answer cites the document  
- Denied path is honest: *“N documents hidden by access level”* — no silent leaks, no invented bands  
- Upload a policy → ask about it in seconds — knowledge stops sitting unused

---

### 5. IMPACT — 45s · What becomes measurably better

| Tasco pain | What we change |
|------------|----------------|
| Time spent searching | One ask in My Tasco → answer + source |
| Scattered systems | One assistant over the knowledge corpus |
| Underutilized docs | Ingest → immediately searchable |
| Slow onboarding / decisions | New hires get policy answers with citations |
| Keyword search fails | Semantic + grounded answers, not file-name hunt |
| Strict access control | Same question, different clearance, different truth |

Measure it: **time-to-answer**, **% answers with citation**, **unauthorized asks blocked**, **onboarding questions resolved without HR ticket**.

---

### 6. DEMO — 60s · Outcome in action

*(Screen share · talk while clicking)*

1. **Maya** (employee): “What is the probation period?” → accurate answer + citation  
2. **Maya**: “Engineering salary bands?” → blocked — sensitive, not authorized  
3. **Sarah** (Finance manager): same question → still blocked — right rank, wrong team  
4. **Jonas** (HR manager): same question → full answer — authorized  
5. **Priya** (exec): “What’s in the M&A pipeline?” → restricted knowledge, authorized only at the top  

Find information instantly. Keep sensitive information safe. That’s the brief.

---

### 7. CLOSE — 10s

Tasco’s opportunity was clear: an intelligent, secure, AI-powered assistant for enterprise knowledge.  
We shipped it — live, permission-aware, and ready to live inside My Tasco.

Happy to take questions.

---

## Rubric checklist (six questions)

| Question | Your one-liner |
|----------|----------------|
| **Agentic AI** | Plans clearance → tools → answers or withholds → verifies with sources |
| **Track fit** | Directly answers Tasco’s knowledge + access-control problem statement |
| **Execution** | Live GCP demo; persona matrix proves authorized vs denied |
| **Impact** | Faster find, better utilization, safer sensitive data, faster onboarding |
| **Creativity** | Team-scoped confidential + denied-count disclosure, not keyword search 2.0 |
| **Clarity** | “Instant answers, authorized access” |

---

## Challenge-statement map

| Their words | Where we show it |
|-------------|------------------|
| Large volumes of docs / policies / procedures | Seeded corpus + live ingest |
| Struggle to find accurate information | Semantic ask + citations |
| Sensitive only to authorized users | Persona demo (Maya → Jonas → Priya) |
| Time spent searching | One-ask flow in My Tasco |
| Scattered across systems | Single assistant entry point |
| Underutilized knowledge | Upload → immediate Q&A |
| Slower onboarding / decisions | Probation / policy answers for employees |
| Keyword search fails | Grounded AI answers vs file hunt |
| Intelligent, secure assistant | Agent loop + query-time RBAC |

---

## Numbers cheat-sheet

**Lead with Tasco language.** Deck numbers are optional support only.

| Claim | Number | Use |
|-------|--------|-----|
| Tasco group scale | **150+** subsidiaries | Why one-size keyword search fails |
| Accuracy when context is noisy | **~30% drop** | Optional: why dump-all retrieval fails (deck p.3) |
| Market (only if asked “why agents?”) | **~$10B TAM**, **39% CAGR** | Keep out of main problem beat |

Do **not** use court/mem0 lines (~98% junk, 80–120K tokens, 68% evidence ignored).

---

## Q&A bank (2 min)

**"How is this different from search?"**  
Search returns files. We return answers with sources — and we refuse when the user isn’t authorized. Keyword search can’t do the second part.

**"How do you protect sensitive information?"**  
Classification + team tags on every chunk. Filter runs at query time before the model sees context. Same salary question: employee denied, wrong-team manager denied, HR allowed, exec sees restricted.

**"Where do employees use it?"**  
Inside My Tasco — the app they already open. Not a second portal.

**"What about 150 subsidiaries with different policies?"**  
Team / ownership scoping today; subsidiary silos are the natural next step on the same model.
