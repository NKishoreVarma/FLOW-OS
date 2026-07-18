# FLOW OS — Capability-Aware Operational Brain
## Phase 9.2: FLOW Always Looks First

> FLOW never says "I don't have access." It already looked.

---

## The Problem Phase 9.2 Solves

Before Phase 9.2, the Brain sent questions directly to an LLM before querying FLOW's data systems. This produced generic, hedged responses:

```
User: "What are my pull requests?"
Old Brain: "I don't have access to your GitHub repository..."

User: "What incidents are active?"
Old Brain: "As an AI, I cannot access your incident tracking system..."
```

These responses are unacceptable. FLOW owns Engineering Intelligence, Meeting Intelligence, Incident Engine, Customer Intelligence, and 9 other data systems. It must use them.

---

## The New Contract

```
FLOW always queries its data systems first.
The LLM synthesises the retrieved data into language.
The LLM never speculates about data it was not given.
```

If FLOW finds no data: `"No incidents are currently recorded in this workspace."`
Not: `"I don't have access to your incident tracking system."`

---

## Architecture

```
User Question
    │
    ▼
┌──────────────────┐
│  CapabilityPlanner│  "Which FLOW systems own this question?"
│                  │
│  PRs?    → Engineering
│  Meetings? → Meetings
│  At risk?  → Customers
│  Today?   → Timeline + Memory
│  Brief?   → Health + Memory + Recommendations
└────────┬─────────┘
         │  CapabilityPlan: [{capability, priority, limit}]
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  CapabilityDispatcher (parallel queries)             │
│                                                     │
│  engineering   → GraphNode[PR, COMMIT, ISSUE]        │
│  meetings      → GraphNode[MEETING, EVENT]           │
│  customers     → GraphNode[CUSTOMER] + OrgMemory     │
│  incidents     → GraphNode[INCIDENT] + OrgMemory     │
│  knowledge     → GraphNode[DOCUMENT] + OrgMemory     │
│  communications→ GraphNode[EMAIL, COMMUNICATION]     │
│  timeline      → AuditLog + OrgMemory (recent)       │
│  memory        → OrgMemoryRecord (all types)         │
│  recommendations→ operationalIntelligenceService     │
│  health        → healthScoreService                  │
│  people        → GraphNode[USER]                     │
│  transcripts   → GraphNode[TRANSCRIPT]               │
└────────┬────────────────────────────────────────────┘
         │  CapabilityResults: {cap → {records, count, ...}}
         │
         ▼
┌──────────────────┐
│  ContextBuilder  │  "What did FLOW find? Format it for the LLM."
│                  │
│  → Structured sections per capability
│  → Explicit empty-state statements (no hedging)
│  → Flat evidence records for evidence pipeline
└────────┬─────────┘
         │  contextBlock (text injected into LLM prompt)
         │
    ┌────┴────────────────────┐
    │                         │
    ▼                         ▼
Evidence Collection       ReasoningEngine
(RAG fallback, parallel)  (uses contextBlock as primary)
    │                         │
    └──────────┬──────────────┘
               ▼
         EvidenceRanker
               │
               ▼
         VerificationEngine
               │
    ┌──────────┴──────────┐
    ▼                     ▼
ActionPlanner    BusinessImpactAnalyzer
    │                     │
    └──────────┬──────────┘
               ▼
         ConfidenceScorer
               │
               ▼
      LLM Response Synthesis
      (with FLOW_IDENTITY prompt)
               │
               ▼
         BrainResponse
```

---

## CapabilityPlanner

**File:** `src/ai/reasoning/CapabilityPlanner.js`

Maps question keywords to capabilities. Returns a priority-ordered list.

```js
planCapabilities("What are my pull requests?", intent)
// → {
//     capabilities: [
//       { capability: 'engineering', priority: 1, limit: 20 },
//       { capability: 'memory',      priority: 3, limit: 10 },
//       { capability: 'health',      priority: 4, limit: 1  },
//     ],
//     primaryCapability: 'engineering',
//     requiresLiveConnector: true,
//   }
```

### Capability Routing Table

| Trigger Keywords | Capability |
|-----------------|------------|
| pr, pull request, merge, commit, deploy, repo, issue, jira, sprint | `engineering` |
| meeting, standup, sync, calendar, agenda, schedule, upcoming | `meetings` |
| customer, client, churn, arr, revenue, account, deal, at risk | `customers` |
| incident, outage, down, sev, p0, alert, production, broke | `incidents` |
| document, doc, wiki, policy, knowledge, confluence | `knowledge` |
| email, message, thread, inbox, slack, mail | `communications` |
| what changed, recent, activity, timeline, today, history | `timeline` |
| recommend, suggest, what should, prioritize, work on | `recommendations` |
| who, team, employee, hire, headcount, org chart | `people` |
| transcript, said, discussed, action item, notes from | `transcripts` |
| health, status, score, performing | `health` |
| (always added) | `memory`, `health` |

---

## CapabilityDispatcher

**File:** `src/ai/reasoning/CapabilityDispatcher.js`

For each capability in the plan, queries the real FLOW data source. All dispatches run in parallel via `Promise.all`.

### Data Sources by Capability

| Capability | Primary Source | Secondary Source |
|-----------|----------------|-----------------|
| engineering | `GraphNode` WHERE type IN [PR, COMMIT, ISSUE, SYSTEM] | — |
| meetings | `GraphNode` WHERE type IN [MEETING, EVENT] | — |
| customers | `GraphNode` WHERE type = CUSTOMER | `OrgMemoryRecord` (PROJECT_EVENT, CUSTOMER_EVENT) |
| incidents | `GraphNode` WHERE type = INCIDENT | `OrgMemoryRecord` (INCIDENT) |
| knowledge | `GraphNode` WHERE type = DOCUMENT | `OrgMemoryRecord` (KNOWLEDGE_UPDATE) |
| communications | `GraphNode` WHERE type IN [EMAIL, COMMUNICATION] | — |
| timeline | `AuditLog` ORDER BY createdAt DESC | `OrgMemoryRecord` (recent) |
| memory | `OrgMemoryRecord` ORDER BY importance DESC | — |
| recommendations | `operationalIntelligenceService.getProactiveRecommendations()` | — |
| health | `healthScoreService.calculateWorkspaceHealth()` | — |
| people | `GraphNode` WHERE type = USER | — |
| transcripts | `GraphNode` WHERE type = TRANSCRIPT | — |

### Workspace Data (Demo Company)

| Node Type | Count |
|-----------|-------|
| EMAIL | 1,957 |
| COMMIT | 1,415 |
| ISSUE | 1,200 |
| PR | 329 |
| EVENT | 500 |
| COMMUNICATION | 500 |
| USER | 450 |
| MEETING | 300 |
| DOCUMENT | 440 |
| CUSTOMER | 211 |
| INCIDENT | 80 |
| TRANSCRIPT | 150 |

---

## ContextBuilder

**File:** `src/ai/reasoning/ContextBuilder.js`

Formats capability results into a structured text block for the LLM.

### Section Format

```
=== FLOW WORKSPACE DATA ===
FLOW queried 5 capability systems and found 234 records.

--- Engineering (11 records — PRs, commits, issues) ---
Pull Requests (5):
  • Fix authentication bug [open]
  • Add user dashboard [merged]
  • Update API rate limits [draft]
...

--- Incidents (3 total, 1 active) ---
Active incidents: 1 of 3
  • [active] Database connection pool exhausted: ...
  • [resolved] Deployment failure in staging: ...

=== EMPTY STATES (state as facts, do not hedge) ===
• No meetings or calendar events found in this workspace.
• No recommendations generated for this workspace.

=== END FLOW DATA ===
```

### Empty State Principle

Every capability that returns 0 records generates an explicit empty-state statement. The LLM must use this exact phrasing — not invent hedges.

| Instead of | FLOW says |
|-----------|-----------|
| "I don't have access to your meetings" | "No meetings or calendar events found in this workspace." |
| "I cannot view your pull requests" | "No pull requests exist in this workspace." |
| "I'm unable to check your incidents" | "No incidents are currently recorded in this workspace." |

---

## FLOW Identity Contract

Every LLM synthesis call uses the `FLOW_IDENTITY` system prompt:

```
You are FLOW, the Operational Brain of this company's enterprise workspace.

FLOW has already queried all relevant systems before generating this prompt:
Engineering, Meetings, Customers, Incidents, Knowledge Base, Communications,
Org Memory, Health Score, and Knowledge Graph.

STRICT RULES:
1. NEVER say "I don't have access to..." — state the empty fact.
2. NEVER say "As an AI..." or reference your AI nature.
3. NEVER say "I recommend checking [external tool]" — FLOW IS the tool.
4. NEVER say "I don't know" — state what data shows or say no data exists.
5. NEVER hedge. If data is absent: "No pull requests exist in this workspace."
6. Reference actual names, counts, and statuses from the context.
7. Write for a senior executive. Concise. Factual. Actionable.
```

---

## Full Pipeline (Phase 9.2)

```
Stage 0: Capability Planning  — CapabilityPlanner.planCapabilities()
Stage 1: Intent Analysis      — IntentAnalyzer.analyzeIntent() (parallel with Stage 2)
Stage 2: Capability Dispatch  — CapabilityDispatcher.dispatchCapabilities() (all parallel)
         + RAG Evidence       — EvidenceCollector.collectEvidence() (parallel)
Stage 3: Context Building     — ContextBuilder.buildContext() + formatContextForPrompt()
Stage 4: Evidence Merge       — capability records + RAG merged into unified evidence set
Stage 5: Evidence Ranking     — EvidenceRanker.rankEvidence()
Stage 6: Reasoning            — ReasoningEngine.reason() (uses contextBlock)
Stage 7: Verification         — VerificationEngine.verify()
Stage 8: Action Planning      — ActionPlanner.planActions() (parallel with Stage 9)
Stage 9: Business Impact      — BusinessImpactAnalyzer.analyzeBusinessImpact() (parallel)
Stage 10: Confidence          — ConfidenceScorer.scoreConfidence()
Stage 11: Synthesis           — LLM answer generation with FLOW_IDENTITY
```

---

## API

```
POST /api/brain/reason
{
  "question": "What are my pull requests?",
  "pageContext": "projects",
  "role": "ENGINEER"
}

Response:
{
  "summary": "FLOW found 329 pull requests in the engineering system. Most recent: 'Fix authentication bug' [open], created 2 days ago...",
  "capabilities": {
    "planned": ["engineering", "memory", "health"],
    "totalRecords": 341,
    "primary": "engineering"
  },
  "confidence": { "score": 88, "level": "high" },
  ...
}
```

---

## Extending: Add a New Capability

1. Add to `Capability` enum in `CapabilityPlanner.js`
2. Add trigger keywords in `planCapabilities()`
3. Add data source function in `CapabilityDispatcher.js`
4. Add section formatter in `ContextBuilder.js`
5. Add empty-state statement in `_emptyStateStatement()`

No other files change.

---

## File Map

| File | Role |
|------|------|
| `src/ai/reasoning/CapabilityPlanner.js`    | Maps questions to required capabilities |
| `src/ai/reasoning/CapabilityDispatcher.js` | Queries FLOW data systems per capability |
| `src/ai/reasoning/ContextBuilder.js`       | Formats capability results for LLM injection |
| `src/ai/reasoning/OperationalBrain.js`     | Orchestrator: capability pipeline + reasoning chain |
| `src/ai/PromptBuilder.js`                  | FLOW_IDENTITY system prompt (no-disclaimer rules) |
| `src/services/copilotService.js`           | Copilot: also uses capability pipeline |

---

*Delivered: Phase 9.2 — 2026-07-07*
