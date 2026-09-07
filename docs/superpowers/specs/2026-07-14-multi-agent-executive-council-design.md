# Phase 15 — Multi-Agent Executive Council — Design Spec

> Status: approved 2026-07-14. FLOW behaves like an executive leadership team: six
> specialized AI executives collaborate to help run the organization.

## Principle — orchestrate, never duplicate

A thin layer in `src/council/`. It adds **no** new reasoning, retrieval, execution, or
storage. It calls existing systems:

| Concern | Reused system |
|---------|---------------|
| Per-agent reasoning | `explainQuestion()` (Operational Brain v2 + Explainability envelope) |
| Routing | `CapabilityPlanner` domain weights + keywords |
| Health / risk | `healthScoreService`, Predictions (11.5) |
| Executable actions | Phase-14 Execution Engine (`ExecutableActionCard` / `/api/execution`) |
| Final-answer confidence/trust | `explain()` |

## Decisions (locked)

1. **Agent engine** — each agent wraps `explainQuestion(ws, domainFramed(q), { role })`.
2. **Routing** — deterministic (keywords + CapabilityPlanner weights → relevant agents;
   all-6 fallback when ambiguous).
3. **Dashboard** — each agent exposes a lighter `healthReport()`; dashboard runs the 6 in
   parallel, cached ~10 min.
4. **Milestones** — M1 agents + orchestrator; M2 debate + synthesis + explainability;
   M3 dashboard + UI + docs.

## Agents (`src/council/agents/`)

Config-driven `ExecutiveAgent` + a registry of 6: **Engineering · Operations · Sales ·
HR · Security · Finance COO**. Config: `{ id, title, domainPrompt, capabilities[],
keywords[], role }`.

- `analyze(ws, question)` → `explainQuestion(ws, "${domainPrompt}\n\n${question}", { role })`
  → normalized **finding**: `{ agent, title, summary, confidence, trust, evidenceCount,
  evidence, recommendedActions, contradictions, risks, opportunities }`.
- `healthReport(ws)` → scoped reasoning on a fixed domain-health question + relevant
  predictions/health → `{ agent, status, score, topRisks, topOpportunities,
  recommendedActions }`.

Agents never reimplement the Brain — they supply a domain prompt and normalize output.

## Executive Orchestrator (`src/council/executiveOrchestrator.js`)

`askCouncil(ws, question, { agents })`:
1. **route** — `router.route(question)` → relevant agent ids (deterministic).
2. **parallel** — `Promise.all(selected.map(a => a.analyze(ws, question)))` (fault-isolated).
3. **collect** — structured findings.
4. **debate** — `debateEngine.detect(findings)` (M2).
5. **synthesize** — `councilSynthesizer.synthesize(question, findings, debate)` (M2).
6. **explain** — wrap the final answer once via `explain()`.
Returns `{ question, answer, routedAgents, findings, debate, confidence, evidence, actions }`.

## Executive Debate (`src/council/debateEngine.js`, M2)

Deterministic disagreement detection: opposing recommended actions, confidence spread,
contradiction overlap → `{ hasDisagreement, conflicts:[{ agents, positions, tradeoffs }],
recommendation, minorityOpinions[] }`. High-evidence minority views are preserved.

## Executive Synthesis (`src/council/councilSynthesizer.js`, M2)

Gemini synthesis of findings + debate → one executive brief (LLM + deterministic
fallback — house pattern). No new LLM client; reuse the existing provider layer.

## Executive Dashboard (`src/council/executiveDashboard.js`, M3)

`getDashboard(ws)` → `Promise.all` of the 6 `healthReport()`s, cached ~10 min → 6 cards
(**status · top risks · top opportunities · recommended actions**).

## REST (`/api/council/*`, JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ask` | Route → parallel agents → debate → synthesis → one answer |
| GET | `/dashboard` | 6 domain health cards (cached) |
| GET | `/agents` | List the council + their domains |
| POST | `/agent/:id` | Query a single executive agent |

## Frontend (M3)

`components/council/ExecutiveCouncil.jsx` at `/council`: 6 health cards + "Ask the
Council" box rendering the synthesized answer, per-agent findings, and the debate panel
(conflicts + minority opinions). Reuses Phase-13 `EvidenceCard`/`ConversationMeta` and
Phase-14 `ExecutableActionCard`.

## Invariants (do not regress)

- No duplication: agents import the Brain (`explainQuestion`); they do not reimplement
  reasoning, retrieval, execution, or health.
- Parallelism is fault-isolated — one failing agent never fails the council.
- Tenant isolation on every read (`workspaceId` mandatory).
- Recommended actions execute only through the governed Phase-14 Execution Engine.

## Validation

`scripts/validate-executive-council.js`: routing selects correct agents; parallel
execution; synthesis yields one answer; debate surfaces a seeded disagreement + preserves
minority; confidence aggregation; explainability present; **no-duplication assertion**
(council modules reference the Brain). Integration regression steady at **66/74**.

## Docs (M3)

`MULTI_AGENT_EXECUTIVE_COUNCIL.md` · `EXECUTIVE_ORCHESTRATOR.md` · `EXECUTIVE_DASHBOARD.md`.

## Milestones

- **M1** — `ExecutiveAgent` + 6 configs, `router`, `executiveOrchestrator` (route +
  parallel + collect; debate/synthesis pass-through), `/api/council/ask` + `/agents` +
  `/agent/:id`, validate M1.
- **M2** — `debateEngine`, `councilSynthesizer`, explainability wrap; richer `/ask`.
- **M3** — `executiveDashboard` + `/dashboard` + `ExecutiveCouncil.jsx` + 3 docs.
