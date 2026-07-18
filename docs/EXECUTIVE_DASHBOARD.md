# Executive Dashboard (Phase 15)

A single view of company health across six domains, each assessed by its executive agent.

## Backend (`src/council/executiveDashboard.js`)

`getDashboard(workspaceId, { force })`:

1. Runs all six agents' lighter `healthReport(ws)` passes in parallel
   (`Promise.allSettled` — fault-isolated; a failing domain becomes an `unknown` card).
2. Assembles one card per domain: `{ agent, title, status, score, topRisks,
   topOpportunities, recommendedActions, summary }`.
3. Computes an `overall` status (worst-of the known cards).
4. **Caches** per workspace for ~10 minutes so the landing view is fast; the full
   debate reasoning stays on `/ask`. `clearDashboardCache(ws)` invalidates.

Each `healthReport()` reuses the Brain (`explainQuestion`) with a fixed domain-health
question, then derives a status band from confidence + contradictions:

| Status | Condition |
|--------|-----------|
| `healthy` | confidence ≥ 75, no blocking contradiction |
| `watch` | confidence 55–74 |
| `at_risk` | confidence < 55, or contradictions with confidence < 60 |
| `unknown` | the agent could not assess (no evidence / error) |

## REST

`GET /api/council/dashboard` → `{ workspaceId, generatedAt, overall, cards[], cached }`.
Excluded from the 30 s request timeout (runs the Brain six times); cached responses
return immediately.

## Frontend (`components/council/ExecutiveCouncil.jsx`, `/council`)

Six health cards — **status badge (with score) · top risks · top opportunities ·
recommended actions** — colored by status (healthy/watch/at-risk). Above them, "Ask the
Council" renders the synthesized answer, the debate panel (conflicts + preserved minority
opinions), and each executive's finding. A labelled demo fallback keeps the page usable
when the backend is slow or unavailable (the Brain is inherently slow — see the council
doc's performance note).

## Card contents (per the spec)

- **Overall status** — the status badge + numeric score.
- **Top risks** — the agent's most important risks (contradictions + declared gaps).
- **Top opportunities** — the agent's forward-looking recommended moves.
- **Recommended actions** — one-click executable via the Phase-14 Execution Engine.

## Validation

The dashboard reuses the same validated agent + status logic; the council harness
(`scripts/validate-executive-council.js`, 23/23) covers routing, findings, and status
derivation inputs. Integration regression steady at **66/74**.
