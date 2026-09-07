# FLOW OS — Memory
**Document:** 14 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

Memory is what separates FLOW from every other enterprise tool: it remembers.

FLOW maintains four distinct memory layers, each with different scope, persistence, and retrieval characteristics. Together, they give FLOW the ability to reason about a company's history, decisions, and patterns in ways no human could achieve by manually reading historical records.

---

## Memory Architecture

```
Workspace Memory       ← operational intel from the ingestion pipeline
  Storage: PostgreSQL (workspace_intel_chunks) + pgvector
  Scope: workspace
  Retention: per Memory Brain policy
  Retrieved by: RAG pipeline (semantic search)

Conversation Memory    ← every user conversation with the Brain
  Storage: PostgreSQL (CopilotConversation, CopilotMessage)
  Scope: workspace + user
  Retention: workspace data retention period
  Retrieved by: /brain/history + context loading on session start

Decision Memory        ← structured decisions made in FLOW
  Storage: PostgreSQL (OrgMemoryRecord)
  Scope: workspace
  Retention: permanent
  Retrieved by: /api/brain/memory + reasoning pipeline context injection

AI Preferences         ← learned behavior patterns
  Storage: PostgreSQL (derived from execution_records) + Redis cache
  Scope: workspace
  Retention: rolling 90 days
  Retrieved by: memoryPersonalizer.js before chief-of-staff generation
```

---

## Workspace Memory (Operational Intel)

### Ingestion

Every message, commit, email, meeting note, and document that enters FLOW is processed by the 9-stage ingestion pipeline. Only content that:
1. Passes the Trust Center permission gate
2. Passes the Privacy Gate (not PRIVATE_PERSONAL)
3. Scores above DISCARD threshold in the Memory Brain

...enters the workspace memory store.

### Memory Brain Retention Policy

```
composite = (importance × 0.45) + (authority × 0.35) + (urgency × 0.20)

urgency ≥ 0.7 AND importance ≥ 0.6 AND authority ≥ 0.6  → PERMANENT
urgency ≥ 0.7 (otherwise)                               → 24_HOURS
composite ≥ 0.70                                         → PERMANENT
composite ≥ 0.50                                         → 90_DAYS
composite ≥ 0.30                                         → 30_DAYS
composite ≥ 0.15                                         → 24_HOURS
otherwise                                                → DISCARD
```

### Storage Format

Each chunk stored in `workspace_intel_chunks`:

```sql
CREATE TABLE workspace_intel_chunks (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  source        TEXT,           -- 'slack', 'gmail', 'github', etc.
  channel       TEXT,
  sender        TEXT,
  content       TEXT,
  embedding     VECTOR(768),    -- Gemini gemini-embedding-2
  authority_score FLOAT,
  importance_score FLOAT,
  urgency_score   FLOAT,
  composite_score FLOAT,
  retention_policy TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  expires_at    TIMESTAMP       -- NULL for PERMANENT
);

CREATE INDEX ON workspace_intel_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Authority Weights (affects retrieval ranking)

| Source | Coefficient |
|---|---|
| `github`, `obsidian`, `vault`, `git` | 1.5 (HIGH) |
| `slack`, `gmail`, `chat`, `discord` | 0.8 (LOW) |
| all other sources | 1.0 (MEDIUM) |

Higher authority = chunks surface earlier in retrieval results.

### Retrieval (RAG)

Retrieval happens at query time:

```
1. Parse structural flags (from:, channel:, priority:) → vault metadata scan
2. Generate embedding for query text → Gemini gemini-embedding-2
3. pgvector ANN search: SELECT ... ORDER BY embedding <=> $query_embedding LIMIT 20
4. Vault fallback scan (Markdown files)
5. RRF merge (Reciprocal Rank Fusion, k=60) of both result sets
6. Knowledge Graph 2-hop expansion (injects entity context)
7. Authority-weight scoring: finalScore = similarity × authorityCoeff
8. Memory boost: if authorityCoeff ≥ 1.5 → +0.15 to finalScore
9. Top 5 chunks returned to Synthesis Agent
```

---

## Conversation Memory

### What Is Stored

Every message in a brain conversation:
- User messages
- FLOW responses (full text, not summary)
- Context chips active at message time
- Streaming metadata (tokens, latency)
- Actions taken from the conversation

### Persistence

Stored in PostgreSQL via Prisma models:
- `CopilotConversation` — a conversation session (workspace, user, startedAt, title)
- `CopilotMessage` — individual message (conversationId, role, content, createdAt)

Conversations persist across:
- Browser refreshes
- Device changes
- Session expiry (the conversation remains; the user must re-auth to view it)

### Loading on Session Start

When BrainHome loads:
1. Fetch the last active conversation from `/api/brain/conversations/latest`
2. Load the last 30 messages (session cache limit)
3. Extract context chips from message content (regex patterns: PR #N, Release N, Sprint N)
4. Display without auto-sending any message — FLOW waits for the user

### History Page

Route: `/brain/history`

```
CONVERSATION HISTORY
──────────────────────────────────────────────────────────
July 18, 2026
  Postgres migration status and blockers            09:42
  What's at risk in Release 2.5?                    10:15
  Draft email to Acme about renewal                 14:30

July 17, 2026
  Engineering velocity this sprint                  08:55
  Who knows the most about the auth service?        11:20
  ...
──────────────────────────────────────────────────────────
```

Clicking a conversation opens it in BrainHome with full message history loaded.

Conversations can be:
- Renamed (user can edit title)
- Deleted (with confirmation)
- Shared (within same workspace — link generates a read-only view)

---

## Decision Memory

### What Is Stored

FLOW captures structured decisions:
- Decisions extracted from ingested text (decision extraction engine)
- Decisions explicitly created via `/api/brain/decisions` (from recommendations)
- Decisions resolved from approvals (when an approval is executed, the action becomes a decision record)

### Decision Structure

```js
{
  id: string,
  workspaceId: string,
  orgId: string,
  type: 'STRATEGY' | 'TECHNICAL' | 'RESOURCE' | 'PROCESS' | 'RISK',
  title: string,
  description: string,
  outcome: 'DECIDED' | 'PENDING' | 'DEFERRED' | 'REVERSED',
  decidedBy: string[],         // list of people involved
  decisionDate: Date,
  rationale: string,
  evidenceChunks: string[],    // references to workspace_intel_chunks
  tags: string[],
  impact: 'LOW' | 'MEDIUM' | 'HIGH',
  source: string,              // 'brain' | 'approval' | 'extraction'
}
```

### Decision Memory in Reasoning

When the reasoning pipeline processes a query, it checks decision memory for context:
- "What did we decide about the database schema?" → searches decision memory by keyword
- "Has this been discussed before?" → semantic search over decision records
- Relevant decisions are injected as high-authority context chunks (coefficient: 1.5)

### Decision History

Accessible at `/api/brain/decisions`. Displayed in:
- Brain responses that reference past decisions
- Entity Workspace panels (decisions made about or involving a specific entity)
- Executive Council strategic analysis

---

## AI Memory (Preferences and Patterns)

### What Is Learned

`memoryPersonalizer.js` reads execution history to identify patterns:

```js
// Patterns detected from execution_records:
{
  commonlyApprovedActions: ['APPROVE_PULL_REQUEST', 'CREATE_JIRA_ISSUE'],
  commonlyModifiedRecommendations: ['SEND_EMAIL'],   // user edits before sending
  peakActivityHours: [9, 10, 14, 15],
  preferredDelegatees: { 'alice@co': 12 },           // delegated to 12× in 90 days
  averageDecisionTime: { APPROVE_PULL_REQUEST: 120 }, // seconds
}
```

### How Preferences Affect FLOW

- Chief of Staff ranks item types the user typically handles first in their work pattern
- ActionCard primary buttons surface the user's most common action choice
- Suggested prompts in Command Center skew toward question types the user frequently asks
- Delegate suggestions pre-fill the most frequent delegatee

### Preferences Page

Route: `/brain/preferences`

User-configurable preferences:
- Briefing cadence (daily / weekly / on-demand)
- Tone preference (formal / balanced / concise)
- Working hours (for time-aware recommendations)
- Notification preferences (per event type)
- Pinned prompts (up to 5)
- Memory retention consent (allow FLOW to learn from my actions: yes/no)

---

## Memory Transparency

**Route:** `/brain/memory`

Shows the user exactly what FLOW has learned and stored about their workspace:

```
WHAT FLOW KNOWS

Operational Intel
  4,247 intelligence chunks stored
  Oldest: March 15, 2026
  Source breakdown: GitHub (1,842) · Slack (1,103) · Gmail (891) · Jira (411)

Decisions
  87 decisions recorded
  Strategic: 12 · Technical: 34 · Resource: 28 · Process: 13

Conversations
  142 conversations · 1,891 messages
  Earliest: May 1, 2026

Predictions Run
  23 prediction runs stored

Simulations
  8 simulations stored

──────────────────────────────────────────────────────────

MEMORY RETENTION POLICY
  Engineering sources: 90 days
  Slack (high importance): PERMANENT
  Slack (routine): 30 days
  Email: 30 days
  Decisions: PERMANENT

[Clear conversation history]
[Export my data]
[Delete all workspace memory]  ← OWNER only, requires confirmation
```

All counts are live from the database. The user can see exactly what FLOW holds.

---

## Privacy Gate

The privacy gate is the pre-memory filter. It classifies every ingested message into one of three categories using Gemini 2.5 Flash (with keyword heuristic fallback):

| Classification | Description | Action |
|---|---|---|
| `OPERATIONAL_INTEL` | Business-relevant, safe to store | Proceeds to vector store + vault |
| `SOCIAL_COORDINATION` | Team coordination, low value, safe | Stored in Redis with 3600s TTL, not vectorized |
| `PRIVATE_PERSONAL` | Personal content, health, relationships | **Hard discarded** — text set to null, never stored anywhere |

`PRIVATE_PERSONAL` content:
- Is never stored in any database
- Is never logged
- Is never referenced in any response
- Triggers `PRIVACY_SHIELD_TRIGGERED` WebSocket event (with no payload text — just the event)

The privacy gate cannot be disabled by configuration. It is not behind a feature flag. It is a core architectural invariant.

---

## Synapse Engine (Cross-Channel Clustering)

Runs inside `vectorStoreService.storeKnowledge` for every stored chunk.

For each new chunk:
1. Generate 768-dim embedding
2. Compare cosine similarity against all existing topic clusters for this workspace
3. If best match ≥ 0.82 → join cluster, update rolling centroid
4. Otherwise → spawn new cluster (UUID, derived title, seed centroid)

Topic clusters enable:
- Grouping related knowledge across different source channels
- Knowledge Graph entity inference (entities that appear in the same cluster are likely related)
- Briefing engine topic organization ("these 3 items are all about the Postgres migration")

Clusters are in-memory per process. They survive for the lifetime of the server process but not across restarts (TD-01 — known limitation).
