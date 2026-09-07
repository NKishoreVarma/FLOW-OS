# Predictive Workspace Intelligence — Phase 11.5

> FLOW already answers "what happened?" (Replay) and "what would happen?"
> (Simulation). This layer answers **"what is likely to happen next?"** — and
> proactively warns before problems occur. Every prediction is deterministic and
> explainable. No ML. No invented scores.

---

## 1. What it is

`src/predictions/` forecasts risk across four domains by running deterministic
models over the signals FLOW already has:

- **Operational Graph (11.1)** — ownership, bus-factor, dependency structure.
- **Event Platform + Replay (11.0/11.3)** — trends (velocity, incident/deploy
  frequency, review latency) and patterns (deploy→incident co-occurrence).
- **Simulation Engine (11.4)** — for scenario-shaped risks (churn, departure), a
  prediction pairs a likelihood with a real simulated impact.
- **Memory** — historical incidents and prior predictions as comparisons.
- **Workspace health** — the operational baseline.

It **replaces** the former mock `generatePredictions()` (which returned fixed
numbers and fabricated names) with real computation.

```
                         PredictionPipeline.buildContext (one shared, real-signal context)
 events · graph · health · memory ─┬─────────────────────────────────────────────────┐
                                   ▼                                                   │
   ┌── PredictionModels (deterministic registry, ~22 types) ──┐   TrendAnalyzer       │
   │  each run(ctx) → { probability, trend, drivers, evidence }│   PatternDetector     │
   └───────────────────────────┬──────────────────────────────┘   AnomalyPredictor    │
        RiskScorer ──▶ ConfidenceEstimator ──▶ RecommendationGenerator ──▶ ForecastEngine
                                   ▼
        PredictionReporter (8-field output + explanation) ──▶ PredictionEngine ──▶ history
```

## 2. Prediction domains & types (~22)

| Domain | Types |
|--------|-------|
| **Engineering** | deployment risk · sprint delay · incident probability · PR bottleneck · review delay · code-ownership risk |
| **People** | burnout · knowledge loss · bus factor · employee dependency · meeting overload · productivity trend |
| **Customers** | churn · customer health · renewal risk · support escalation · expansion opportunity |
| **Operations** | operational health · capacity risk · security drift · integration failure · policy violation |

## 3. Output (per prediction)

Prediction (statement) · **probability** · **confidence** · **time horizon** ·
supporting evidence · **trend** · business impact · **preventive actions** — plus a
deterministic **explanation**: why · which evidence · historical comparisons ·
confidence breakdown · missing evidence · alternative outcomes.

---

## 4. Prediction pipeline

1. **buildContext** — fetch the event window (60d), graph metrics + orphan repos,
   per-actor/type/connector aggregates, per-person meeting load (from graph
   `ATTENDED` edges), workspace health, memory, and detected patterns — **once**.
2. **runModels** — each model reads the shared context and returns a probability
   with drivers and evidence. Bind helpers (`resolveEmployee`, `resolveCustomer`,
   `simulate`) let models reach the graph and Simulation Engine.
3. **RiskScorer** — probability + trend → risk score/level.
4. **ConfidenceEstimator** — evidence quantity + history depth + trend presence;
   `insufficient` models get very-low confidence.
5. **RecommendationGenerator** — preventive actions per type, grounded in drivers.
6. **PredictionReporter** — the 8-field output + explanation.
7. **PredictionEngine** — sorts by risk, computes `topRisks`, persists the run to
   memory (`MemoryRecordType.PREDICTION`) for **Prediction History**.

## 5. Heuristics (how each probability is derived — examples)

| Type | Deterministic signal |
|------|----------------------|
| Incident probability | Incident-frequency trend × deploy→incident co-occurrence rate × recurring-resource count |
| Deployment risk | Recent failure/rollback rate × deploy→incident rate × cadence trend |
| Sprint delay | Engineering-velocity trend (falling ⇒ higher slippage risk) |
| Code-ownership risk | Fraction of repositories with no ownership edge in the graph |
| Bus factor / employee dependency | Share of activity concentrated in the top 1–2 contributors |
| Knowledge loss | Simulate `EMPLOYEE_DEPARTURE` on the top contributor → knowledge-loss severity |
| Meeting overload | Per-person `ATTENDED` count vs a load threshold |
| Churn risk | Negative-language customer-event ratio + at-risk account, simulated for impact |
| Operational health | Inverse workspace health × incident trend |

Every probability is a **bounded function of measured inputs** — reproducible and
inspectable. Low-signal types return a low probability with an explicit
"insufficient evidence" note rather than a fabricated number.

## 6. Explainability

Because predictions must never be opaque, each carries `explanation.why` (the
drivers), `evidence`, `historicalComparisons` (matching memory), a
`confidenceBreakdown`, `missingEvidence` (when insufficient), and
`alternativeOutcomes` (higher if trends intensify / lower if preventive actions are
taken). The full XAI envelope (11.2) is available on demand for any prediction.

## 7. API

```js
import { predict, predictOne, getHistory } from '../predictions/index.js';

await predict(ws);                          // all domains
await predict(ws, { domain: 'people' });    // one domain
await predict(ws, { types: ['CHURN_RISK'] });
await predictOne(ws, 'INCIDENT_PROBABILITY');
await getHistory(ws);                        // Prediction History
```

Legacy compatibility: `operationalIntelligenceService.generatePredictions()` now
delegates to this engine and maps the top predictions to the old morning-brief
shape.

## 8. Performance

Deterministic and cheap: a full run of ~22 models shares one prefetched context
(a few bounded graph/event queries) and completes in **tens of milliseconds**
(≈50 ms for 22 predictions in validation). Cost scales with workspace connectivity
and window size, not model count. The scheduled proactive worker (M2) can run this
on a cadence without load concern.

## 9. Validation

`node scripts/validate-prediction-engine.js` seeds a workspace with real trends
(rising incidents, falling velocity, a sole-owner contributor, an at-risk customer,
a meeting-heavy person, failed deploys) and runs the seven required predictions.
**All pass**, and the probabilities reflect the seeded signal:

- Sprint delay **83%** (falling velocity) · incident probability **67%** (rising) ·
  knowledge loss **100%** (simulation-backed) · churn **87%** (Acme, simulated
  impact) · code-ownership risk **100%** · meeting overload **50%** (named person) ·
  deployment failure **48%**.
- Low-signal predictions are honestly flagged (insufficient → confidence ≤ 25);
  no prediction carries a probability without evidence.

Integration suite unchanged (284 pass / 0 fail).

## 10. Limitations

- Forecasts are **deterministic heuristics**, not statistical/ML models — they
  detect and extrapolate observed trends, not latent/seasonal structure.
- Bounded by what the event log and graph have recorded; unrecorded work is
  invisible.
- The event platform deduplicates on `(workspace, connector, source_event_id)`, so
  a source that reuses one id for repeated updates collapses to a single event —
  emit distinct event ids per state change.
- Per-person signals depend on identity resolution in the graph (see the
  calendar-attendee gotcha in the Simulation docs).

## 11. Future ML roadmap

Deterministic heuristics are the trustworthy floor. If/when labeled outcomes
accumulate (predicted vs actual), the same context could feed calibrated models:
(1) log every prediction + eventual outcome (the history store already persists
runs); (2) fit lightweight calibration (isotonic/Platt) on probabilities per type;
(3) learn driver weights from outcomes; (4) add sequence models for incident/churn
precursors. Any ML would sit **behind the same explainable interface** — never
replacing the evidence trail.

---

## 12. REST API, Workspace UI & proactive worker (Milestone 2)

`/api/predictions` (JWT + workspace-id):

```
GET /api/predictions/types      → the ~22 types + 4 domains
GET /api/predictions            → run predictions (?domain= or ?types=a,b)
GET /api/predictions/history    → prior runs (Prediction History)
GET /api/predictions/:type      → a single prediction
```

**Prediction Workspace** — admin UI at `/prediction-workspace` (dev-only 404 in
production, OWNER/ADMIN JWT + workspace-id): a domain filter, a **risk timeline**
(bars sized by risk score), **forecast cards** (probability, risk level, trend
arrow, confidence, top evidence, preventive actions, estimated impact), a
"monitoring" section for insufficient-signal types, and **prediction history**.

**Proactive worker** — `predictionWorker` runs a BullMQ repeatable job
(`PREDICTION_CRON`, default every 6h) that recomputes predictions for active
workspaces (those with events in the last 7 days), persists each run to history,
and pushes a `PREDICTION_WARNING` over WebSocket for any risk at/above
`PREDICTION_WARN_THRESHOLD` (default 65). This is the "warn before it happens"
delivery — push, not just pull.

---

*Phase 11.5 complete.*
