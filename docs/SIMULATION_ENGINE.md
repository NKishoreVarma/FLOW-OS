# What-If Simulation Engine — Phase 11.4

> A decision-support system. Simulate hypothetical changes inside the company
> *before* acting — "what happens if Rahul resigns / payments goes down / Acme
> churns / Release 4.2 slips" — and get an evidence-backed answer, not a guess.

---

## 1. What it is (and isn't)

`src/simulation/` is **not** a predictor and **not** an LLM narrator. It is a
simulation engine that reasons over the layers already in FLOW:

- **Operational Graph (11.1)** — cascading impact via real traversal (blast
  radius, dependencies, orphan/bus-factor analysis).
- **Event Platform + Replay (11.0/11.3)** — relevant history replayed as evidence.
- **Memory** — past incidents, recommendations, and prior simulations as analogues.
- **Explainability (11.2)** — every simulation is wrapped in the explanation
  envelope (why / assumptions / evidence / uncertainty).

Nothing is mocked. Every number traces to graph structure, historical events, or a
stated heuristic.

```
 "what if…" ─▶ ScenarioBuilder ─▶ Validator ─▶ Planner ─▶ Runner ─▶ Estimator
                (structured +                     (per-type   (REAL      (impacts +
                 heuristic NL)                     analysis    graph +    heuristic
                                                   plan)       events +   financial)
                                                               memory)       │
                        Reporter ◀─ MitigationPlanner ◀─ RiskCalculator ◀────┘
                (12-field output + XAI envelope)   (grounded actions)   (overall risk)
                        │
                   SimulationMemory (persist + reuse)
```

---

## 2. Scenario types (11)

`EMPLOYEE_DEPARTURE · SERVICE_OUTAGE · REPOSITORY_LOSS · RELEASE_SLIP ·
DEPLOYMENT_POSTPONE · CUSTOMER_CHURN · PROJECT_CANCEL · INTEGRATION_OUTAGE ·
MEETING_CANCEL · TEAM_MERGE · HIRING` (abstract).

Input is either **structured** (`{ type, targetEntityId | targetName, params }`)
or a **natural question** — a heuristic layer classifies the type by keywords and
resolves the target to a real graph node via `searchNodes`. No LLM: the front door
stays deterministic and reproducible.

## 3. Execution flow

1. **ScenarioBuilder** → structured scenario + resolved target node.
2. **ScenarioValidator** → type known, target resolved (or abstract).
3. **ScenarioPlanner** → which analyses to run for this type (graph list + replay
   mode + memory).
4. **ScenarioRunner** → executes them: `analyzeImpact` / `dependencyChain` /
   `neighbors` / `findOrphans` / bus-factor (owned assets + backup owners), a
   `replay` of relevant history, and memory analogues. **This is the real data.**
5. **ImpactEstimator** → business · engineering · customer · operational ·
   knowledge-loss · dependencies · timeline + a **heuristic financial** figure.
6. **RiskCalculator** → weighted overall risk × likelihood × criticality, with
   named drivers.
7. **MitigationPlanner** → concrete actions grounded in the findings (name the
   backup people, the orphan-risk assets, the affected customers).
8. **SimulationReporter** → the 12-field report + the explainability envelope.
9. **SimulationMemory** → persists the simulation (`MemoryRecordType.SIMULATION`)
   for reuse.

## 4. Output (12 fields)

Executive summary · overall risk score · business impact · engineering impact ·
customer impact · operational impact · heuristic financial estimate · knowledge
loss · dependencies affected · timeline changes · recommended actions ·
confidence — plus the explanation envelope, assumptions, and evidence.

---

## 5. How each dimension is derived (real, not invented)

| Dimension | Source |
|-----------|--------|
| Cascading impact | Graph `analyzeImpact` blast radius (impacted count, affected customers, by-type) |
| Dependencies | Graph `dependencyChain` |
| Knowledge loss | Owned/authored assets + **bus-factor** (assets with no other owner) + backup candidates, from graph neighbors |
| Customer/engineering/operational | Blast radius + dependency count + incident history frequency |
| Timeline | Delay params × dependent-item count |
| Evidence | Replayed history events + memory analogues + the graph cascade |
| Confidence | Target resolution + evidence quantity + memory analogues + blast radius (−penalty for unresolved target) |

## 6. Financial estimate — explicitly heuristic

The engine states its basis and assumptions; it never fabricates precision.

| Scenario | Heuristic |
|----------|-----------|
| Customer churn | Account ARR (or tier estimate) |
| Employee departure | Recruiting + onboarding + ~6-month ramp, scaled by unowned critical assets |
| Service / integration outage | ~$2,500/hour revenue exposure × assumed downtime hours |
| Release slip / deploy postpone | ~$40,000/week opportunity cost × weeks |

Every financial line carries `heuristic: true`, a `basis`, and `assumptions`.

---

## 7. Explainability & assumptions

Every simulation is passed through `explain()` (11.2), so it carries a six-
dimension confidence breakdown, source attribution, contradictions, missing-
evidence honesty, a trust score, and — because the target is a graph node — a
relationship/impact graph explanation. Assumptions are always listed explicitly
(the modelled change, the financial basis, "impact derived from the current graph
snapshot", "second-order/behavioral effects not modelled").

## 8. API

```js
import { simulate, compare } from '../simulation/index.js';

// Structured
await simulate(ws, { type: 'EMPLOYEE_DEPARTURE', targetEntityId }, { persist: true });
// Natural language
await simulate(ws, { question: 'What if Acme churns?' });
// Side-by-side
await compare(ws, scenarioA, scenarioB);
```

---

## 9. Validation

`node scripts/validate-simulation-engine.js` seeds a workspace **by publishing
events** (so the graph subscriber builds a real twin and the store holds real
history), then runs all seven required scenarios. **14/14 pass:**

- Employee departure — detects **8 owned assets, 8 with no remaining owner**
  (bus-factor) + knowledge-transfer mitigations.
- Service outage — real graph cascade (10 downstream nodes) + customer comms plan.
- Deployment postpone, customer churn ($60k heuristic), repository loss, meeting
  cancellation, and a large-scale change (hire 5).
- Every simulation carries an explanation envelope and explicit assumptions;
  scenario comparison yields a risk delta; prior simulations are reused from memory.

Integration suite unchanged (284 pass / 0 fail).

---

## 10. Assumptions & limitations

- Impact is bounded by what the **Operational Graph** has recorded; relationships
  that were never observed as events are not modelled.
- Financial figures are **heuristic** planning aids, not forecasts.
- Second-order and behavioral effects (morale, market reaction, cascading
  re-prioritization) are out of scope.
- Natural-language classification is keyword-based; ambiguous phrasing may need a
  structured `type`.
- Bus-factor treats single-authored artifacts as sole-owned — accurate for the
  graph model, but a PR naturally having one author is weaker signal than a
  repository with a single owner.

## 11. Performance & scaling

Each simulation is a handful of bounded graph traversals (tens of ms each, per
11.1), one replay window, and one memory query — typically well under a second.
Cost scales with the target's connectivity, not total history size (graph
traversal is frontier-bounded; snapshots/replay are indexed). Scaling levers:
cache hot targets' impact/dependency closures; precompute bus-factor for key
people; batch scenario comparisons.

## 12. REST API & Simulation Workspace (Milestone 2)

`/api/simulation` (JWT + workspace-id; distinct from the legacy `/api/test/simulate`):

```
GET  /api/simulation/types      → the 11 scenario types
POST /api/simulation            { type | question, targetEntityId | targetName, params } → run
POST /api/simulation/compare    { a, b } → side-by-side with a risk/financial delta
```

**Simulation Workspace** — admin UI at `/simulation-workspace` (dev-only 404 in
production, OWNER/ADMIN JWT + workspace-id). A scenario builder (type · target ·
params), a **risk gauge**, **impact dimension bars** (business / engineering /
customer / operational / knowledge), risk drivers, grounded recommended actions,
knowledge-loss / dependency / timeline detail, assumptions, and an **A/B compare
mode**. Self-contained (no build, no CDN).

## 13. Future roadmap

1. Multi-step / compound scenarios ("if Alice leaves *and* Release 4.2 slips").
3. Monte-Carlo ranges over uncertain parameters.
4. Graph write-back preview ("show the twin *after* the change").
5. Learning loop: compare simulated vs. actual outcomes to calibrate heuristics.

---

*Phase 11.4 Milestone 1 complete. Milestone 2: Simulation Workspace UI + REST API.*
