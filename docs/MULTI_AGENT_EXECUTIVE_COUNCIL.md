# Multi-Agent Executive Council (Phase 15)

FLOW behaves like an executive leadership team: six specialized AI executives assess the
company from their domain, collaborate, debate the big calls, and produce one answer.

> **Orchestration, not duplication.** The council adds no new reasoning, retrieval,
> execution, or storage. Every agent's brain is the existing Operational Brain
> (`explainQuestion`); routing reuses `CapabilityPlanner`; actions run through the
> Phase-14 Execution Engine; health reuses the health/prediction services.

## The council (`src/council/agents/`)

Six config-driven agents (one `ExecutiveAgent` class + a registry):

| Agent | Domain | Scope |
|-------|--------|-------|
| Engineering COO | Delivery, code, deploys, incidents, tech debt | `engineering` |
| Operations COO | Process, coordination, meetings, knowledge, blockers | `knowledge, communications, memory` |
| Sales COO | Pipeline, deals, churn, revenue | `customers` |
| HR COO | Workload/burnout, retention, hiring, bus-factor | `people` |
| Security COO | Exposure, access, compliance, threats | `engineering, memory` |
| Finance COO | Cost/burn, revenue trajectory, budget, ROI | `customers, memory` |

Each config is only `{ id, title, domainPrompt, capabilities, keywords, role }`.

## What each agent does

- `analyze(ws, question)` → frames the question with its `domainPrompt` and calls
  `explainQuestion()` (the Brain) → normalizes the explanation envelope into a
  **finding**: `{ summary, confidence, trust, evidenceCount, evidence,
  recommendedActions, contradictions, risks, opportunities, stance }`.
- `healthReport(ws)` → a lighter scoped pass → `{ status, score, topRisks,
  topOpportunities, recommendedActions }` for the dashboard.

Agents never reimplement reasoning — they supply a domain prompt and normalize output.
(Structurally asserted in validation: the agent file imports `explainQuestion` and
contains no embedding/vector code.)

## Flow

```
question
  → Orchestrator.route()            deterministic → relevant agents
  → Promise.allSettled(analyze)     parallel + fault- AND time-isolated
  → collect findings
  → DebateEngine.detect()           surface disagreement + minority
  → CouncilSynthesizer.synthesize() one answer (LLM + deterministic fallback)
  → { answer, findings, debate, confidence, evidence, actions }
```

See [`EXECUTIVE_ORCHESTRATOR.md`](EXECUTIVE_ORCHESTRATOR.md) and
[`EXECUTIVE_DASHBOARD.md`](EXECUTIVE_DASHBOARD.md).

## REST (`/api/council/*`, JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ask` | Route → parallel agents → debate → synthesis → one answer |
| GET | `/dashboard` | Six domain health cards (cached ~10 min) |
| GET | `/agents` | List the council |
| POST | `/agent/:id` | Query a single executive |

Because each agent runs the full (inherently slow) Brain, `/api/council/*` is excluded
from the 30 s request timeout (`COUNCIL_REQUEST_TIMEOUT_MS`, default 120 s) and each
agent is independently capped (`COUNCIL_AGENT_TIMEOUT_MS`, default 60 s) so one slow
domain never hangs the council — it is simply dropped from that round.

## Frontend

`components/council/ExecutiveCouncil.jsx` at `/council`: six health cards + "Ask the
Council" (synthesized answer + per-executive findings + debate panel with preserved
minority opinions). Demo fallback when the backend is unavailable.

## Validation

`node scripts/validate-executive-council.js` — **23/23**: routing selects the correct
agents (and consults the full council when ambiguous), debate detects a seeded
disagreement and preserves the minority, synthesis yields one answer, confidence
aggregation, and the **no-duplication** structural assertions. Integration regression
steady at **66/74**.

> **Performance note (honest):** a single Operational Brain call is ~28–30 s in this
> environment (confirmed against the existing `/api/brain/copilot` at 28.4 s). The
> council orchestrates that Brain, so live throughput is bounded by it — under
> concurrency the fastest agents answer within the window and slower ones are dropped
> gracefully. Speeding up the Brain itself is out of scope (Phase 15 reuses it).
