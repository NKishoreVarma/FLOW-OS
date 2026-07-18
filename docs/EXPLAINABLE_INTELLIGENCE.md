# Explainable Intelligence Engine (XAI) — Phase 11.2

> FLOW already reasons. Now it explains. Every recommendation, prediction, and
> answer can be understood, verified, and challenged. FLOW never produces opaque
> intelligence — no conclusion without showing why.

---

## 1. What it is

A layer (`src/explainability/`) that wraps **any** AI output into a single
standard **explanation envelope**. It consolidates rather than duplicates: it
reuses the Phase 9.1 reasoning pipeline (evidence, confidence, verification,
business impact), the `CriticAgent` (contradictions), the Operational Graph
(11.1, relationship/impact explanations), and the Event Platform (11.0), and adds
the missing trust-building pieces — a six-dimension confidence breakdown, typed
source attribution, honest missing-evidence detection, alternatives, and a trust
score.

```
 any AI output ──▶ explain(output, context) ──▶ explanation envelope
 (Brain result,        │
  copilot answer,      ├─ EvidenceFormatter → SourceAttribution
  recommendation)      ├─ ConfidenceBreakdown (6 real-signal dimensions)
                       ├─ ReasoningTrace + DecisionTree
                       ├─ contradiction detection (surface, never hide)
                       ├─ MissingEvidenceDetector (honest "not enough evidence")
                       ├─ AlternativeGenerator
                       ├─ BusinessJustification (6 impact dimensions)
                       ├─ graph explanation (path / impact / dependency, 11.1)
                       └─ TrustScorer
```

---

## 2. The explanation envelope

Every explained output contains:

| Field | Meaning |
|-------|---------|
| `executiveSummary` | The answer |
| `evidence[]` | Normalized, typed evidence with refs, source, freshness, authority |
| `reasoning.trace` | Ordered reasoning chain (the "how") |
| `reasoning.decisionTree` | The decision path (the "why this recommendation") |
| `confidence` | Six-dimension breakdown + overall + level |
| `sources` | Source attribution by type + "who said this" |
| `missingInformation` | Sufficiency + honest statement + what's missing |
| `contradictions[]` | Conflicting evidence, surfaced explicitly |
| `alternatives[]` | Other plausible conclusions / decisions |
| `businessImpact` | Revenue · customer · engineering · operational · time · risk |
| `recommendedActions[]` | What to do |
| `trust` | 0–100 trust score + level + factor breakdown |
| `graph` | Relationship / impact / dependency explanation (when an entity is in context) |

---

## 3. Confidence — six real-signal dimensions

Confidence is **never an LLM self-report**. Each dimension (0–100) is computed
from real signals:

| Dimension | Derived from |
|-----------|--------------|
| **Data freshness** | Evidence timestamps (recency decay; undated penalty) |
| **Evidence quality** | Ranking scores × authority × quantity × source diversity |
| **Relationship confidence** | Operational Graph edge weights/degree around the entity (11.1) |
| **Reasoning confidence** | Phase 9.1 `ConfidenceScorer` + verifier trust level |
| **Connector health** | Phase 10 connector `health_status` for the workspace |
| **Overall** | Weighted blend (evidence 0.30, reasoning 0.25, freshness 0.20, relationship 0.15, connector 0.10) |

The breakdown names its **weakest dimension** so a user sees exactly what to
shore up.

## 4. Trust vs. confidence

**Trust** is a distinct score: it starts from overall confidence, then **rewards**
corroboration (diverse, fresh sources) and **penalizes** unresolved
contradictions, insufficient evidence, and failed verification. This is why a
confident-looking answer with a contradiction gets a low trust score — e.g. in
validation the "deploy Friday vs delayed" case scored confidence 65 but **trust
38 (unreliable)**, while a fresh, corroborated, verified incident scored
confidence 77 but **trust 90 (trusted)**.

---

## 5. Contradictions — surfaced, never hidden

When evidence conflicts, the explanation says so. Detection combines:
1. Contradictions already flagged by the reasoning pipeline.
2. An opposing-claims scan across evidence content on known topics (deployment
   timing, incident status, decisions, delivery status).
3. High-severity verification issues that read as conflicts.

Example (from validation): a calendar note *"deploy payments Friday, approved"*
(E1, MEETING) versus a Jira ticket *"payments deployment delayed, blocked"* (E2,
JIRA) is surfaced as a `deployment timing` contradiction with both refs and the
note: *"Resolve which source is authoritative/current."*

## 6. Missing evidence — intellectual honesty

Instead of hallucinating, `MissingEvidenceDetector` declares
**"There isn't enough evidence to answer this confidently."** and explains what's
missing: empty capabilities, thin coverage (<3 items), stale sources (>45 days),
expected-but-absent source types for the domain, and carried-over reasoning gaps.

---

## 7. Source attribution

Every piece of evidence is classified into a source type — EMAIL · SLACK · GITHUB
· JIRA · MEETING · DOCUMENT · TIMELINE · GRAPH · MEMORY · CRM — and grouped so a
user can ask **"what evidence?"** (by type) and **"who said this?"** (by actor,
with the refs each actor is behind).

## 8. Graph-grounded explanation

When `context.entityId` is present, the explanation pulls from the Operational
Graph (11.1): the entity's **relationships** (neighbors), its **impact** blast
radius (`analyzeImpact`), and its **dependencies** (`analyzeDependencies`). Graph
relationship strength also feeds the relationship-confidence dimension, and the
impact blast radius enriches customer/revenue business impact.

---

## 9. Business impact — six dimensions

`BusinessJustification` expresses impact in leadership terms: **revenue ·
customer · engineering · operational · time · risk**, wrapping the Phase 9.1
`BusinessImpactAnalyzer` and enriching customer/revenue lines with the graph
blast radius (e.g. "N customer accounts in the blast radius").

---

## 10. API

```js
import { explain, explainQuestion, answerFollowUp } from '../explainability/index.js';

// Wrap any AI output.
const envelope = await explain(brainOutput, { workspaceId, entityId, domain });

// Run the Operational Brain for a question, then explain it end-to-end.
const envelope = await explainQuestion(workspaceId, 'Are we deploying Friday?', { entityId });

// Answer a follow-up question from an explanation.
answerFollowUp(envelope, 'why');                // confidence rationale + top evidence
answerFollowUp(envelope, 'how');                // reasoning chain
answerFollowUp(envelope, 'what_evidence');      // evidence + by-type
answerFollowUp(envelope, 'who_said');           // attribution by actor
answerFollowUp(envelope, 'what_changed');       // recent / timeline evidence
answerFollowUp(envelope, 'why_now');            // urgency + business time
answerFollowUp(envelope, 'what_missing');       // missing information
answerFollowUp(envelope, 'why_recommendation'); // decision tree + top action
```

### REST API (Milestone 2)

All under `/api/explain` (JWT + workspace-id):

```
POST /api/explain            { output }            → explain an AI output
POST /api/explain            { question, entityId } → reason (Operational Brain) + explain
POST /api/explain/followup   { explanation, type } → answer a follow-up
POST /api/explain/followup   { question, type }    → reason + explain + follow-up
GET  /api/explain/types                            → the 8 follow-up types
```

**Pass-through on the Brain:** `POST /api/brain/reason` and `POST /api/brain/copilot`
accept an opt-in `explain: true` (body) / `?explain=true` (query). When set, the
response carries a full `explanation` envelope alongside the answer. It is
**off by default** so the explanation cost is only paid when asked for.

---

## 11. Module map (`src/explainability/`)

| Module | Responsibility |
|--------|----------------|
| `ExplanationEngine.js` | `explain` / `explainQuestion` / `answerFollowUp`; contradiction detection; graph + connector-health fetch; normalization |
| `EvidenceFormatter.js` | Normalize + classify evidence by source type; freshness |
| `SourceAttribution.js` | Group by source type; who-said |
| `ConfidenceBreakdown.js` | The six confidence dimensions |
| `ReasoningTrace.js` | Ordered reasoning chain |
| `DecisionTree.js` | Decision-path representation |
| `AlternativeGenerator.js` | Alternative conclusions / decisions |
| `MissingEvidenceDetector.js` | Honest sufficiency + gaps |
| `BusinessJustification.js` | Six business-impact dimensions |
| `TrustScorer.js` | Trust score + factors |

---

## 12. Validation

`node scripts/validate-explainability.js` — generates explanations across all
eight domains (recommendations, incidents, meetings, customers, engineering,
knowledge, timeline, operational graph) against a seeded workspace + twin.
**16/16 pass:** every envelope complete with six confidence dimensions; the
meetings case surfaces the deploy contradiction; the knowledge case honestly
declares insufficient evidence; graph-backed domains carry relationship/impact
explanations; the follow-up API answers all eight question types.

---

## 13. Design invariants

- Confidence dimensions and trust are computed from real signals, never
  self-reported.
- Contradictions are surfaced, never hidden.
- Insufficient evidence is declared, never papered over with a guess.
- The layer wraps existing reasoning (9.1) / graph (11.1) / events (11.0) — it does
  not re-implement them.

---

*Phase 11.2 Milestone 1 complete. Milestone 2: wire `explain()` into the live
brain/copilot/recommendation endpoints + `POST /api/explain` and the follow-up API.*
