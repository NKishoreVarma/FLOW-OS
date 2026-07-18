# FLOW OS — Operational Brain v2
## Phase 9.1: COO-Grade Reasoning Pipeline

> FLOW is no longer a search engine. It reasons like a Chief Operating Officer.

---

## Overview

The Operational Brain v2 is a multi-stage reasoning pipeline that transforms every question into a structured intelligence brief. Instead of pattern-matching or generating a text answer, FLOW:

1. Classifies intent and domain
2. Collects evidence from all data sources in parallel
3. Ranks evidence by relevance, authority, and recency
4. Reasons through the evidence step by step
5. Verifies the reasoning for hallucinations and data quality issues
6. Plans concrete actions — including what FLOW can execute automatically
7. Assesses business impact in executive-facing language
8. Produces a calibrated confidence score with full breakdown

---

## Architecture

```
POST /api/brain/reason
        │
        ▼
┌─────────────────┐
│  IntentAnalyzer │  Stage 1 — Heuristic + LLM enrichment
│                 │  → questionType, domain, timeframe, urgency, entities
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  EvidenceCollector  │  Stage 2 — Parallel collection from 5 sources
│  (parallel)         │
│  ┌───┐ ┌───┐ ┌───┐ │  • Vector store (pgvector semantic / keyword fallback)
│  │RAG│ │MEM│ │KG │ │  • Org memory (decisions, incidents, project events)
│  └───┘ └───┘ └───┘ │  • Knowledge graph (entity neighbors)
│  ┌───────┐ ┌─────┐ │  • Health metrics
│  │Health │ │Time │ │  • Audit log / connector timeline
│  └───────┘ └─────┘ │
└────────┬────────────┘
         │
         ▼
┌─────────────────┐
│  EvidenceRanker │  Stage 3 — Score, deduplicate, tier
│                 │  formula: semantic×0.40 + authority×0.35 + recency×0.15 + type_boost×0.10
│                 │  → primary (top 5), supporting (next 7), context (next 8)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ReasoningEngine│  Stage 4 — Multi-step reasoning chain
│                 │  → chain[], findings[], gaps[], contradictions[], narrative
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│ VerificationEngine│  Stage 5 — Deterministic post-processor (no LLM)
│                  │  checks: unsupported findings, stale data, contradictions, gaps
│                  │  → passed, trustLevel, issues[], warnings[]
└────────┬─────────┘
         │
         ├─────────────────────────────────┐
         ▼                                 ▼
┌─────────────────┐             ┌──────────────────────┐
│  ActionPlanner  │  Stage 6    │ BusinessImpactAnalyzer│  Stage 7
│                 │             │                       │
│  → recommended  │             │  → impactLevel        │
│    executable   │             │    affectedAreas      │
│    canExecute   │             │    timeToImpact       │
│    quickWin     │             │    revenueRisk        │
│    executionPlan│             │    businessSummary    │
└────────┬────────┘             └──────────┬────────────┘
         └──────────────┬──────────────────┘
                        ▼
              ┌─────────────────┐
              │ ConfidenceScorer│  Stage 8
              │                 │
              │  evidence: 35%  │  score 0-100
              │  coherence: 25% │  level: very_high/high/moderate/low/very_low
              │  verify: 25%    │
              │  intent: 15%    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Answer Synthesis│  Stage 9 — Executive-facing answer generation
              └────────┬────────┘
                       │
                       ▼
              Structured BrainResponse
```

---

## API

### POST /api/brain/reason

**Headers:** `Authorization: Bearer <jwt>`, `workspace-id: <id>`

**Request:**
```json
{
  "question": "Why are our pull requests taking so long to merge?",
  "pageContext": "projects",
  "entityId": "pr-42",
  "role": "CTO"
}
```

**Response shape:**
```json
{
  "success": true,
  "traceId": "brain_1783359291901_mynv",
  "question": "...",
  "role": "CTO",
  "timestamp": "2026-07-06T17:41:04.465Z",
  "elapsedMs": 17069,

  "summary": "Executive-ready answer (3-5 sentences)",

  "evidence": {
    "total": 20,
    "primary": [
      {
        "ref": "E1",
        "type": "memory",
        "source": "org_memory",
        "content": "...",
        "score": 0.847,
        "authority": 1.4,
        "ts": "2026-06-28T..."
      }
    ],
    "supporting": 7,
    "sources": ["org_memory", "vault"]
  },

  "confidence": {
    "score": 91,
    "level": "very_high",
    "explanation": "Evidence quality: 87% (20 items) | Reasoning coherence: 80% | ...",
    "components": { "evidence": 87, "coherence": 80, "verification": 100, "intentMatch": 100 },
    "recommendation": "High confidence — this analysis can be acted upon directly."
  },

  "reasoning": {
    "questionType": "diagnostic",
    "domain": "incidents",
    "timeframe": "recent",
    "chain": [{"step": 1, "thought": "...", "evidence_refs": ["E1"]}],
    "findings": [{"finding": "...", "confidence": 0.85, "evidence_refs": ["E1"]}],
    "gaps": [],
    "contradictions": [],
    "verification": {
      "passed": true,
      "trustLevel": "high",
      "issues": [],
      "warnings": [],
      "summary": "Evidence is strong and reasoning is well-supported."
    }
  },

  "businessImpact": {
    "level": "high",
    "affectedAreas": ["uptime", "customer_experience"],
    "timeToImpact": "immediate",
    "revenueRisk": "...",
    "customerRisk": "...",
    "operationalRisk": null,
    "complianceRisk": null,
    "summary": "One executive-facing sentence."
  },

  "actions": {
    "recommended": [
      {
        "action": "...",
        "rationale": "...",
        "priority": "immediate",
        "owner": "engineering",
        "estimatedImpact": "...",
        "actionType": "escalate",
        "executable": false
      }
    ],
    "executable": [],
    "canExecute": false,
    "quickWin": "...",
    "riskIfNoAction": "...",
    "executionPlan": null
  },

  "flowCanExecute": false,
  "flowExecutionNote": "These actions require manual execution by your team."
}
```

---

## File Map

| File | Role |
|------|------|
| `src/ai/reasoning/IntentAnalyzer.js`         | Stage 1 — heuristic + LLM intent classification |
| `src/ai/reasoning/EvidenceCollector.js`       | Stage 2 — parallel RAG + memory + KG + health + timeline |
| `src/ai/reasoning/EvidenceRanker.js`          | Stage 3 — score, deduplicate, tier into primary/supporting/context |
| `src/ai/reasoning/ReasoningEngine.js`         | Stage 4 — multi-step LLM reasoning chain |
| `src/ai/reasoning/VerificationEngine.js`      | Stage 5 — deterministic post-processor, no LLM |
| `src/ai/reasoning/ActionPlanner.js`           | Stage 6 — recommended + executable action plan |
| `src/ai/reasoning/BusinessImpactAnalyzer.js`  | Stage 7 — business impact in COO language |
| `src/ai/reasoning/ConfidenceScorer.js`        | Stage 8 — calibrated 0-100 score with component breakdown |
| `src/ai/reasoning/OperationalBrain.js`        | Orchestrator — chains all 8 stages, assembles final response |
| `src/routes/brainRoutes.js`                   | `POST /api/brain/reason` endpoint |

---

## Confidence Score Formula

```
score = evidence × 0.35 + coherence × 0.25 + verification × 0.25 + intentMatch × 0.15

Evidence component:
  = (min(total/8, 1.0) × 0.5 + avg_ranked_score × 0.5) + authority_boost
  authority_boost = +0.05 per high-authority (≥1.3) primary source, capped at 0.20

Coherence component:
  base 0.80
  − 0.10 per unsupported finding
  − 0.08 per contradiction
  − 0.05 per gap
  + 0.03 per reasoning chain step (capped at 0.15)

Verification component:
  high → 1.0 | moderate → 0.75 | low → 0.45 | insufficient → 0.10
  − 0.08 per verification issue
  − 0.04 per warning

Intent match component:
  = fraction of ideal evidence types for this question type that are present
```

---

## Extending the Pipeline

**Add a new evidence source:** Add a function to `EvidenceCollector.js` and include it in `collectEvidence()` via `Promise.allSettled`. Return items with shape `{ type, content, score, source, authority, ts, metadata }`.

**Add a new question type:** Add to `QuestionType` in `IntentAnalyzer.js`, add detection in `_detectQuestionType()`, and add ideal evidence types in `ConfidenceScorer._scoreIntentMatch()`.

**Change provider routing:** Update `AIConfig.js` or `src/ai/BrainRouter.js` task routing — the pipeline is provider-agnostic.

---

*Delivered: Phase 9.1 — 2026-07-06*
