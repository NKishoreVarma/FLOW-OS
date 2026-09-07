# Knowledge Intelligence — Solution Specification
## FLOW OS Solutions Library

> **STATUS: DESIGN ONLY**
> Capability layer: Phase 5.8 (NotionAdapter, ConfluenceAdapter, GoogleDriveAdapter)

---

## Problem Statement

Every company above 20 people has a documentation problem. Not because people don't write things down — they do, everywhere. The problem is retrieval, freshness, and coverage.

The average knowledge worker spends 2.5 hours per day searching for information they can't find. They ask a colleague instead. The colleague becomes the human interface to undocumented knowledge, spending their own time answering questions that a well-maintained knowledge base would answer instantly. When that colleague leaves, the knowledge disappears.

Knowledge tools (Notion, Confluence) solve document creation. They don't solve knowledge health: which documentation is stale, which processes are documented only in one person's head, which critical systems have no runbooks, which documentation is technically accurate but practically useless.

**FLOW's advantage:** It ingests all operational communication alongside the documentation. It knows when documentation was last referenced in a real conversation. It knows when the code changed but the runbook wasn't updated. It knows who actually uses each piece of documentation and who the real expert is — not who wrote it.

---

## Module Scope

```
Knowledge Intelligence
├── Documentation Health Scoring     — freshness, coverage, usage
├── Knowledge Gap Detection          — what should be documented but isn't
├── Expert Finder                    — who actually knows what
├── Institutional Memory             — searchable + queryable knowledge base
├── Documentation Auto-Generation   — AI-drafted docs from operational signals
└── Knowledge Graph Explorer         — visual relationship map of concepts + people
```

---

## Signature Workflows

### 1. Documentation Health Score

**Trigger:** Weekly scheduled pass; on-demand audit  
**FLOW action:**
- For each document in Notion/Confluence/Drive:
  - **Freshness score:** days since last edit vs. referenced topic activity (code changed but doc didn't = stale)
  - **Usage score:** how often is this document linked in communication, meetings, RAG results?
  - **Coverage score:** are all referenced systems/processes in this doc documented?
  - **Accuracy signal:** does this doc contradict recent decisions or code state?
- Aggregate: per-space/team Documentation Health Score (0–100)
- Surface: "Engineering docs health: 67/100. 12 runbooks reference services that have changed in the last 30 days but haven't been updated. auth-service runbook last updated 8 months ago."

### 2. Knowledge Gap Detection

**Trigger:** Weekly intelligence pass  
**FLOW action:**
- Scan Operational Graph: all SYSTEM, SERVICE, PROJECT nodes
- For each node: does a documentation node exist? Is it fresh?
- Cross-reference: communication about this topic (Slack, email) — how often do people ask questions about it vs. have documentation available?
- Surface gaps: "No runbook exists for payment-gateway-v2. 7 Slack threads in the last 30 days asked questions about how it works. This is a HIGH priority gap."
- Rank by: communication volume × system criticality × time-since-last-doc

**What no other tool does:** Gap detection is not just "no Notion page" — it's "people are asking questions in Slack that a document would answer, but no document exists."

### 3. Expert Finder

**Trigger:** Copilot query ("Who knows about X?") or employee search  
**FLOW action:**
- For any topic/system/codebase area: find the real expert (not the person with the most senior title)
- Score: GitHub commits to related files + Jira issues worked + meetings attended on this topic + Slack activity + documentation authored
- Return: ranked list of experts with evidence
  - "auth-service expert: Sarah C. (47 commits, 12 meetings, 3 runbooks authored, most active in auth-related Slack threads)"
  - "second expert: David O. (8 commits, co-reviewed Sarah's last 4 PRs on auth)"

**Copilot query:** "Who should I ask about the Stripe integration?"  
FLOW: graph traversal → finds all contributors to Stripe-related code, meetings, docs → returns ranked list.

### 4. Institutional Memory

**Trigger:** Any knowledge query via Copilot, Universal Search, or RAG pipeline  
**FLOW action (current — already built):**
- RAG pipeline over all ingested intelligence: Slack, email, meetings, documents, code comments
- Returns: evidence-backed answer with source citations
- Supports: "What was decided about the auth rewrite?", "How does the payment reconciliation process work?", "What happened during the July 2025 outage?"

**FLOW action (extension — Knowledge Intelligence layer):**
- Auto-tag retrieved chunks with: document health status, expert owner, freshness warning
- Surface: "This answer is based on documentation last updated 8 months ago. The expert (Sarah C.) may have more current knowledge. Would you like to ask her directly?"

### 5. Documentation Auto-Generation

**Trigger:** New service deployed, new process established, new decision made  
**FLOW action:**
- Detect: "payment-gateway-v2 repository has no documentation in any connected knowledge base"
- Prompt: "FLOW detected a new service with no documentation. Would you like me to draft a runbook?"
- Generate: Gemini 2.5 Flash over README + code structure + related Jira issues + Slack discussions about the service
- Draft runbook sections: Overview, Architecture, Dependencies, Deployment, Monitoring, Troubleshooting, Owner
- Post to Notion: creates draft page for human review before publishing

**Post-meeting auto-generation (already in Meeting Intelligence spec):**  
Decision made in meeting → FLOW drafts ADR (Architecture Decision Record) in Notion for review.

---

## Reused FLOW Components

| Component | Role |
|---|---|
| NotionAdapter | Primary knowledge source + doc write-back |
| ConfluenceAdapter | Secondary knowledge source |
| GoogleDriveAdapter | Drive documents source |
| GitHubAdapter | Code-to-docs correlation |
| Operational Graph | Knowledge node relationships |
| Vector Store | Semantic knowledge search (already powers RAG) |
| Org Memory | Historical decisions + incidents |
| KnowledgeExplorer (`/knowledge`) | Visual graph UI — already built |
| Operational Brain | Copilot for knowledge queries |
| SearchOrchestrator | Cross-connector knowledge fan-out |

---

## New Services Required

| Service | Purpose |
|---|---|
| `documentHealthService.js` | Score freshness + coverage + accuracy per document |
| `knowledgeGapService.js` | Detect undocumented systems from graph + communication |
| `expertFinderService.js` | Multi-signal expert ranking per topic |
| `docGenerationService.js` | AI-drafted documentation from operational signals |

---

## Data Architecture Additions

```prisma
model DocumentHealthRecord {
  id              String   @id @default(cuid())
  orgId           String
  workspaceId     String
  documentId      String                         // provider document ID
  provider        String                         // notion | confluence | drive
  title           String
  freshnessScore  Int      @default(50)          // 0-100
  usageScore      Int      @default(50)          // 0-100
  coverageScore   Int      @default(50)          // 0-100
  overallHealth   Int      @default(50)
  staleSince      DateTime?
  gaps            Json     @default("[]")         // [{ topic, severity }]
  owners          Json     @default("[]")         // [{ userId, expertScore }]
  lastCheckedAt   DateTime @default(now())
}
```

---

## API Additions

```
GET  /api/knowledge/health                    — Documentation health scores for workspace
GET  /api/knowledge/gaps                      — Detected knowledge gaps ranked by priority
GET  /api/knowledge/experts/:topic            — Expert ranking for a topic
POST /api/knowledge/generate                  — AI-draft documentation for a system/process
GET  /api/knowledge/documents/:id/health      — Single document health score
```

---

## Competitive Differentiation

**vs. Notion AI / Confluence Intelligence:** They summarize what's in the tool. FLOW evaluates documentation against the real world: code state, recent communication, operational graph. They can't tell you that a runbook is stale because the architecture it describes changed 3 months ago.

**vs. Guru / Tettra (knowledge management):** They help teams organize and verify knowledge manually. FLOW detects gaps and staleness automatically from operational signals — no manual curation required.

**vs. Glean (enterprise search):** Glean finds documents. FLOW understands them: which are accurate, which are stale, who actually knows the topic, and what's missing entirely.

**FLOW's moat:** Knowledge quality signals from operational context. No knowledge tool knows that a document is stale because of a GitHub commit that changed the system it describes. FLOW does.

---

## Roadmap Stage

**Phase 5.8** (Current): Notion/Confluence/Drive adapters, KnowledgeExplorer UI — partial  
**Phase 8.0** (Beta): Institutional Memory hardened; Expert Finder  
**Phase 11.7** (Post-Beta): Documentation Health + Gap Detection + Auto-Generation

---

*Last updated: 2026-07-01 · Status: DESIGN ONLY*
