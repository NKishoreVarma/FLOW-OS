# Real-Time Company Event Intelligence

> FLOW sees everything the moment it happens — and understands what it means.

---

## Overview

Phase 9.4 transforms FLOW into a living operational system. Every event occurring inside the company — across GitHub, Slack, Jira, Gmail, Calendar, HubSpot, Salesforce, Workday, BambooHR, and internal automations — flows through a unified intelligence pipeline that normalizes, correlates, scores, routes, and surfaces the event in real time.

The user never needs to refresh. FLOW tells them what happened, why it matters, who is affected, what systems are related, and what should happen next.

---

## Architecture

```
Connector Event (GitHub / Slack / Jira / Gmail / Calendar / CRM / HR / ...)
      │
      ▼
EventNormalizer        — convert to CompanyEvent (common schema)
      │
      ▼
EventPriorityEngine    — score: priority, severity, urgency, businessImpact, affectedTeams
      │
      ▼
EventCorrelationEngine — group related events (causal chains + entity overlap + time window)
      │
      ├──► WorkspaceTimelineEngine  — chronological operational timeline (Redis ZSET)
      │
      ├──► EventMemoryService       — persist high-priority events to OrgMemory + KG
      │
      ├──► LiveFeedEngine           — Bloomberg-style workspace feed (Redis list)
      │
      └──► RealtimeNotificationEngine — push critical events via WebSocket immediately
```

---

## Files

### `src/services/events/`

| File | Role |
|------|------|
| `EventNormalizer.js` | Converts raw connector payloads to `CompanyEvent`. Handles: github, slack, jira, gmail, calendar, hubspot, salesforce, workday, bamboohr, notion, confluence, ingestion_worker, connector_action. |
| `EventPriorityEngine.js` | Scores every `CompanyEvent` with priority/severity/urgency/businessImpact/affectedTeams. Type-specific logic for incidents, deployments, customers, meetings, security. |
| `EventCorrelationEngine.js` | Groups events into `CorrelationGroup`s using: causal chain detection, entity overlap, 15-minute time window. Redis-backed with 1h TTL. |
| `WorkspaceTimelineEngine.js` | Chronological Redis ZSET (scored by timestamp). Max 500 events, 7-day TTL. Supports time/type/priority filtering. |
| `LiveFeedEngine.js` | Bloomberg-style feed: Redis list ring buffer (max 100, 24h TTL). Formats each event to `{ icon, text, detail, actions }`. Broadcasts `NEW_EVENT` via WebSocket. |
| `RealtimeNotificationEngine.js` | Fires immediately on qualifying events. Categories: critical_incident, customer_escalation, approval_required, deployment_failure, executive_alert, meeting_reminder, security_warning. 30-min dedup window. |
| `EventMemoryService.js` | Persists high/critical events to `OrgMemoryRecord` (Prisma). Registers actors as `GraphNode` USER nodes. Emits `COMPANY_EVENT_STORED` on eventBus. |
| `EventPipeline.js` | The orchestrator. Entry points: `processRawEvent()`, `processNormalizedEvent()`, `ingestFromWorker()`, `ingestFromConnector()`. Each stage isolated — failures don't abort the pipeline. |

---

## CompanyEvent Schema

```js
{
  id:                  uuid,
  workspaceId:         string,
  type:                EventType,     // engineering|meeting|deployment|incident|...
  source:              string,        // github|slack|jira|gmail|...
  sourceEventId:       string|null,
  title:               string,
  summary:             string,
  icon:                string,        // emoji icon
  actors:              [{ type: 'USER|SYSTEM', id, name }],
  entities:            [{ type: string, id, name, url }],
  priority:            'critical|high|medium|low',
  severity:            0-1,
  urgency:             0-1,
  confidence:          0-100,
  businessImpact:      0-1,
  affectedTeams:       string[],
  affectedCustomers:   string[],
  affectedProjects:    string[],
  correlatedEventIds:  string[],
  correlationGroupId:  string|null,
  metadata:            {},
  ts:                  ISO string,
  resolvedAt:          ISO string|null,
}
```

---

## Event Types

| Type | Icon | Description |
|------|------|-------------|
| `engineering` | 🟣 | PRs, commits, issues, branches |
| `meeting` | 🔵 | Calendar events, meeting updates |
| `deployment` | 🟢 | Deployment started/completed/failed |
| `incident` | 🔴 | Outages, alerts, SLA violations |
| `approval` | 🟡 | Pending approvals requiring action |
| `customer` | 🟠 | CRM updates, churn risk, escalations |
| `knowledge` | 📄 | Document creates/updates |
| `automation` | ⚙️ | FLOW or connector automation runs |
| `security` | 🔐 | Breaches, unauthorized access, vulnerabilities |
| `finance` | 💰 | Budget, invoicing, payment events |
| `hr` | 👤 | Hiring, offboarding, org changes |
| `communication` | ✉️ | Emails, Slack messages |
| `compliance` | ✅ | Policy violations, audit findings |
| `custom` | ⚡ | User-defined or uncategorized |

---

## Correlation Engine

Three correlation strategies run in order:

### 1. Causal Chain Detection

Known type sequences that FLOW treats as a single thread:

```
engineering  → deployment
deployment   → incident
incident     → customer
customer     → approval
hr           → security
engineering  → approval
```

**Example**: PR merged → Deployment started → Production incident → Customer ticket spike  
FLOW groups all four events and surfaces: *"Deployment from PR #421 appears responsible for the current production degradation."*

### 2. Entity Overlap

Events that reference the same PR, repository, customer, or project are grouped automatically.

### 3. 15-Minute Time Window

Events of causally-linked types within 15 minutes are candidates for grouping. The window slides continuously.

---

## Priority Scoring

| Type | Condition | Priority | Urgency |
|------|-----------|----------|---------|
| INCIDENT | production keywords | critical | 1.0 |
| INCIDENT | high signal | high | 0.75 |
| SECURITY | any | critical | 1.0 |
| DEPLOYMENT | failure/rollback | critical | 0.9 |
| DEPLOYMENT | normal | high | 0.6 |
| CUSTOMER | churn/escalation | high | 0.8 |
| APPROVAL | any | high | 0.7 |
| MEETING | < 30 min away | high | 1.0 |

---

## Real-Time Notification Categories

| Category | Trigger |
|----------|---------|
| `critical_incident` | INCIDENT with priority high/critical |
| `deployment_failure` | DEPLOYMENT with fail/error/rollback keywords |
| `approval_required` | Any APPROVAL event |
| `customer_escalation` | CUSTOMER with churn/at-risk/escalation |
| `meeting_reminder` | MEETING starting within 30 minutes |
| `executive_alert` | Any priority=critical + businessImpact ≥ 0.8 |
| `security_warning` | SECURITY or COMPLIANCE (always fires, no dedup) |

---

## REST API

All routes require `Authorization: Bearer <jwt>` and `workspace-id` header.

Mounted at `/api/events`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events/feed` | Live workspace feed (latest N events, formatted) |
| GET | `/api/events/timeline` | Full chronological timeline (`?hours=24&type=incident&priority=high`) |
| GET | `/api/events/recent` | High-priority events from the last 2 hours |
| GET | `/api/events/stats` | Counts by type and priority |
| GET | `/api/events/correlations/:groupId` | Get a correlation group |
| POST | `/api/events/resolve/:eventId` | Mark a timeline event as resolved |
| POST | `/api/events/ingest` | Inject a raw event (`{ source, type, payload }`) |
| GET | `/api/events/stream` | SSE stream (for clients that can't use WebSocket) |

---

## WebSocket Events

| Event | Description |
|-------|-------------|
| `NEW_EVENT` | New feed item; payload is the formatted `FeedItem` |
| `REALTIME_NOTIFICATION` | High-priority event notification with category + actions |
| `MORNING_BRIEF_READY` | From autonomous scheduler (Phase 9.3) |
| `WORKSPACE_ANALYSIS_COMPLETE` | From autonomous analysis cycle |

---

## Integration Points

### Ingestion Worker
After Stage 9 (cognitive brain) completes, `ingestFromWorker()` converts the job data to a `CompanyEvent` and runs it through the full pipeline (non-blocking side-effect).

### Connector Execution Engine
The `CONNECTOR_ACTION_EXECUTED` eventBus subscriber in `eventSubscribers.js` now calls `ingestFromConnector()` for every connector action that completes successfully.

### Direct Injection
POST to `/api/events/ingest` with `{ source, type, payload }` to inject any event for testing or custom integrations.

---

## Live Feed Design

The feed behaves like a Bloomberg Terminal for the company:

```
🔴 Incident: INC-021: Auth service 503 errors
🟢 Deployment completed: flow-os v2.4.1
🟣 Rahul merged PR: Add OAuth2 support
🔵 Meeting: Q3 Planning Review — starting in 8 minutes
🟠 Customer update: Acme Corp at risk of churning
⚙️ FLOW completed automation: Notify on-call
✉️ AlertBot: Production health dropped below 80%
```

Each feed item has:
- **View Details** — opens event detail panel
- **Ask FLOW** — opens copilot with event context pre-loaded
- **Take Action** — contextual action (Approve/Assign/Investigate/Join)

---

## Validation Scenarios

All 8 scenarios validated:

| Scenario | Source | Expected Type | Priority |
|----------|--------|---------------|---------|
| PR merged | github | engineering | medium |
| Deployment started | github | deployment | high |
| Slack incident message | slack | communication | low |
| Jira incident created | jira | incident | critical |
| Meeting in 45 min | calendar | meeting | high |
| Customer churn risk | hubspot | customer | high |
| Employee offboarded | workday | hr | medium |
| Approval required | github | engineering/approval | medium |

Timeline, feed, correlation, memory persistence, and notification dedup all verified.

---

*Last updated: 2026-07-07 — Phase 9.4 Real-Time Company Event Intelligence*
