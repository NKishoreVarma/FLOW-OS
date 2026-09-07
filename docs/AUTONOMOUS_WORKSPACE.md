# Autonomous Workspace Engine

> FLOW is no longer a reactive assistant. When the user opens FLOW, the work is already done.

---

## Overview

The Autonomous Workspace Engine transforms FLOW from a query-answering system into a proactive operational intelligence platform. It runs continuous background analysis across all workspace data systems, compiles morning briefings, detects anomalies, surfaces prioritised recommendations, and pushes actionable notifications — without the user having to ask.

---

## Architecture

```
BullMQ Scheduler (BackgroundAnalysisScheduler)
      │
      ├── 08:00 AM → MorningBriefService
      │       │
      │       ├── CapabilityDispatcher (all 12 capabilities)
      │       ├── PriorityEngine (score all items)
      │       ├── ProactiveRecommendationEngine
      │       ├── WorkspaceInsightService (anomaly detection)
      │       └── DailyPlanningEngine → Redis + WebSocket
      │
      ├── every 15 min → Analysis Cycle
      │       │
      │       ├── CapabilityDispatcher
      │       ├── PriorityEngine → NotificationEngine (WebSocket)
      │       ├── WorkspaceInsightService → Redis
      │       └── WorkspaceDigestService → Redis (ring buffer)
      │
      └── 18:00 PM → EOD Digest → WebSocket
```

---

## Services

### `src/services/autonomous/`

| File | Role |
|------|------|
| `PriorityEngine.js` | Pure scoring function. Assigns urgency, business impact, deadline risk, customer impact, engineering impact, and a composite score to any work item. No I/O. |
| `NotificationEngine.js` | Smart notification filter. Deduplicates (1h window), rate-limits (10/hour/workspace), checks composite score ≥ 0.65 and actionability before broadcasting via WebSocket. |
| `WorkspaceDigestService.js` | Redis ring buffer (max 50 entries, 24h TTL) per workspace. Generates digest entries from capability results. |
| `MorningBriefService.js` | Compiles 10-section daily brief: Executive Summary, Critical Risks, Today's Meetings, Blocked Work, Waiting For You, Recent Customer Changes, Important PRs, Incident Summary, Suggested Actions, Top Priorities. Stored in Redis (24h). |
| `ProactiveRecommendationEngine.js` | Generates 2-8 specific recommendations without user prompting. Heuristic layer (always runs) + LLM enrichment layer. Merged result surfaces concrete items like "Review Rahul's PR before the 2PM deploy". |
| `WorkspaceInsightService.js` | Trend and anomaly detection by diffing capability result snapshots. Detects: count spikes (2.5×), count drops (60%), stale PRs (48h+), long-running incidents (4h+), health alerts (score < 50). |
| `DailyPlanningEngine.js` | Generates time-blocked daily schedule from brief + insights. Heuristic base + LLM enrichment for focus blocks and schedule summary. Stored in Redis (24h). |
| `BackgroundAnalysisScheduler.js` | BullMQ Worker + Queue. Schedules recurring jobs (8AM brief, 15m analysis, 6PM EOD). Exposes `startAutonomousScheduler()`, `stopAutonomousScheduler()`, `triggerAnalysis(workspaceId, orgId)`. |

---

## Schedule

| Time | Job | Description |
|------|-----|-------------|
| 08:00 daily | `morning_brief` | Compiles brief + plan for all workspaces |
| Every 15 min | `analysis_cycle` | Runs for all workspaces: caps → insights → notifications |
| 18:00 daily | `eod_digest` | EOD digest compilation + WebSocket broadcast |
| On-demand | `trigger_analysis` | Queued via `POST /api/workspace/trigger` |

---

## REST API

All routes require `Authorization: Bearer <jwt>` and `workspace-id` header.

Mounted at `/api/workspace`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/brief` | Get today's morning brief (compiled on-demand if not ready) |
| GET | `/api/workspace/digest` | Get live event digest (last 30 entries by default) |
| GET | `/api/workspace/insights` | Get latest trend/anomaly insights |
| GET | `/api/workspace/plan` | Get today's daily plan |
| GET | `/api/workspace/recommendations` | Get fresh proactive recommendations |
| GET | `/api/workspace/status` | What autonomous data is available right now |
| POST | `/api/workspace/trigger` | Queue an immediate analysis cycle |

---

## WebSocket Events

| Event | Trigger |
|-------|---------|
| `MORNING_BRIEF_READY` | Morning brief compiled; includes `criticalCount` and `sections` keys |
| `WORKSPACE_ANALYSIS_COMPLETE` | 15-minute cycle complete; includes `totalItems`, `criticalCount`, `insightCount` |
| `EOD_DIGEST_READY` | EOD digest compiled |
| `PRE_MEETING_BRIEF_READY` | Pre-meeting intelligence refresh (when meeting sync triggers it) |
| `AUTONOMOUS_NOTIFICATION` | Individual notification from NotificationEngine |

---

## Priority Scoring

`PriorityEngine` scores every work item using this composite formula:

```
composite = urgency × 0.35
          + businessImpact × 0.30
          + deadlineRisk × 0.20
          + customerImpact × 0.08
          + engineeringImpact × 0.07
```

| Item Type | Urgency | Business Impact |
|-----------|---------|----------------|
| INCIDENT (active) | 1.0 | 0.9 |
| CUSTOMER at risk | 0.85 | 0.9 |
| PR stale >2 days | 0.75 | 0.5 |
| MEETING <1h away | 1.0 | 0.6 |
| ISSUE blocked | 0.8 | 0.5 |

NotificationEngine only fires when composite ≥ 0.65.

---

## Morning Brief Sections

1. **Executive Summary** — AI-generated 3-sentence brief from all section data
2. **Critical Risks** — items with priority=critical from PriorityEngine
3. **Today's Meetings** — calendar events on today's date
4. **Blocked Work** — items matching block/stuck/waiting/hold keywords
5. **Waiting For You** — PRs and issues with review/approve status
6. **Recent Customer Changes** — CUSTOMER and PROJECT_EVENT records
7. **Important Pull Requests** — highest-scored PRs
8. **Incident Summary** — active incident count + names
9. **Suggested Actions** — merged from ProactiveRecommendationEngine + critical items
10. **Top Priorities** — top 5 by composite score

---

## Insight Types

| Type | Condition | Severity |
|------|-----------|----------|
| `anomaly` | Count increased ≥ 2.5× vs previous snapshot | `high` |
| `anomaly` | Count dropped ≥ 60% (min 5 prev) | `medium` |
| `stale` | ≥ 3 PRs open 48h+ | `high` |
| `stale` | Incident open 4h+ | `high` |
| `trend` | Engineering activity +30% | `low` |
| `trend` | Customer activity +50% | `medium` |
| `alert` | Workspace health < 50 | `high` |
| `alert` | Engineering sector health < 40 | `high` |

---

## Engineering Rules

- **Does NOT add new connectors** — reads from existing capability layer only
- **Does NOT modify AI Provider Layer** — uses `ask()` / `TaskType` from `src/ai/BrainRouter.js`
- **Does NOT modify Operational Brain v2** — runs as a parallel autonomous layer
- **Every job is idempotent** — safe to retry on BullMQ failure
- **No workspace data crosses workspace boundaries** — `workspaceId` isolation enforced in all queries
- **Heuristic fallback everywhere** — LLM enrichment always has a heuristic base that works without AI key

---

## Example Output

### Morning Brief (abbreviated)

```json
{
  "generatedAt": "2026-07-07T08:00:00.000Z",
  "sections": {
    "executiveSummary": "2 critical incidents require immediate response. Engineering health is at 42/100 with 7 stale PRs awaiting review. Recommended action: resolve INC-021 and unblock the auth-service PR.",
    "criticalRisks": [
      { "name": "INC-021: Auth service outage", "type": "INCIDENT", "priority": "critical" }
    ],
    "todaysMeetings": [
      { "name": "Q3 Planning Review", "ts": "2026-07-07T14:00:00Z" }
    ],
    "incidentSummary": { "total": 3, "active": 2 },
    "suggestedActions": [
      { "text": "Assign INC-021 incident response owner", "urgency": "high" }
    ]
  },
  "meta": { "totalItemsScored": 48, "criticalCount": 2, "highCount": 7 }
}
```

---

*Last updated: 2026-07-07 — Phase 9.3 Autonomous Workspace Engine*
