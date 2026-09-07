# Universal Webhook Platform — Phase 10.3

Production-grade webhook ingestion, verification, deduplication, and fan-out for all FLOW OS connectors.

---

## Overview

The webhook platform turns inbound real-time events from GitHub, Slack, Google, Notion, and Jira into fully-processed FLOW native events. Every event flows through a multi-stage pipeline before fan-out to the Operational Brain, workspace feed, notifications, timeline, recommendation engine, and memory.

```
Connector Platform
       │
       ▼
POST /api/webhooks/:connector
       │
       ├── [1] HMAC Signature Verification (connector-specific scheme)
       ├── [2] Workspace Resolution (query param or X-Flow-Workspace header)
       ├── [3] Respond 200 immediately (async pipeline below)
       │
       ▼
WebhookProcessor.processWebhookRequest()
       │
       ├── [4] Replay Protection (Redis SET NX — claimDelivery)
       ├── [5] Event Normalization (FLOW native format)
       ├── [6] Sequence Tracking (Redis INCR per resource)
       ├── [7] Persist to webhook_events (PostgreSQL)
       └── [8] Enqueue to BullMQ webhook-processing queue
                      │
                      ▼
              webhookWorker (BullMQ consumer)
                      │
                      ▼
              EventBroadcaster.broadcast()  ← fan-out in parallel
               │         │        │       │         │       │
               ▼         ▼        ▼       ▼         ▼       ▼
           Brain    Feed    Notifs  Timeline  Recommend  Memory
```

---

## Files

### Core Pipeline

| File | Description |
|------|-------------|
| `src/routes/webhookRoutes.js` | Universal inbound handler — `POST /api/webhooks/:connector` |
| `src/routes/webhookManagementRoutes.js` | Management API — registrations, event log, replay, stats |
| `src/services/webhooks/WebhookProcessor.js` | Pipeline orchestrator (steps 4–8 above) |
| `src/services/webhooks/EventBroadcaster.js` | Fan-out to all subscribers in parallel |
| `src/workers/webhookWorker.js` | BullMQ consumer — calls EventBroadcaster |
| `src/config/webhookQueue.js` | BullMQ `webhook-processing` queue + `enqueueWebhookEvent()` |
| `scripts/migrate-webhook-platform-v10-3.sql` | DB migration — 4 new tables |

### Webhook Infrastructure

| File | Description |
|------|-------------|
| `src/services/webhooks/ReplayProtection.js` | Redis SET NX dedup — `claimDelivery()`, `extractDeliveryId()` |
| `src/services/webhooks/EventNormalizer.js` | Translates raw payloads → FLOW native event format |
| `src/services/webhooks/SequenceTracker.js` | Redis INCR per `(workspace, connector, resource)` |

### Pipeline Subscribers

| File | Fires for | Output |
|------|-----------|--------|
| `src/services/webhooks/subscribers/BrainWebhookHandler.js` | All events | eventBus `WEBHOOK_EVENT`; ingestion queue for high-urgency |
| `src/services/webhooks/subscribers/FeedWebhookHandler.js` | All events | WebSocket `WEBHOOK_FEED_ITEM` |
| `src/services/webhooks/subscribers/NotificationHandler.js` | Medium+ urgency | PostgreSQL + WebSocket `WEBHOOK_NOTIFICATION` |
| `src/services/webhooks/subscribers/TimelineHandler.js` | All events | PostgreSQL AuditLog + WebSocket `TIMELINE_EVENT` |
| `src/services/webhooks/subscribers/RecommendationHandler.js` | All events | eventBus `RECOMMENDATION_SIGNAL`; WebSocket for weight ≥ 0.70 |
| `src/services/webhooks/subscribers/MemoryHandler.js` | High-urgency lifecycle events | orgMemoryService `saveMemory()` |

---

## Database Schema

Four new tables added by `scripts/migrate-webhook-platform-v10-3.sql`:

### `webhook_events`
Normalized FLOW event record — one row per inbound webhook delivery.

```sql
CREATE TABLE webhook_events (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      TEXT        NOT NULL,
  connector_id      TEXT        NOT NULL,
  event_id          UUID        NOT NULL UNIQUE,
  delivery_id       TEXT        NOT NULL,
  event_type        TEXT        NOT NULL,
  resource_type     TEXT,
  resource_id       TEXT,
  action            TEXT,
  actor             JSONB,
  summary           TEXT,
  urgency           TEXT        DEFAULT 'low',
  sequence          BIGINT      DEFAULT 0,
  metadata          JSONB       DEFAULT '{}',
  raw_payload       JSONB,
  processing_status TEXT        DEFAULT 'queued',
  error_message     TEXT,
  received_at       TIMESTAMPTZ DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  UNIQUE (workspace_id, connector_id, delivery_id)
);
```

### `webhook_deliveries`
Per-attempt tracking for BullMQ retries.

### `webhook_registrations`
Extended from Phase 10.1 — adds `verification_token`, `channel_id`, `expiration`, `delivery_count`, `failed_count`.

### `webhook_notifications`
In-app notifications derived from medium+ urgency webhook events.

---

## Event Format (FLOW Native)

Every event is normalized to this shape before entering the pipeline:

```json
{
  "eventId":      "uuid-v4",
  "deliveryId":   "x-github-delivery header value",
  "connectorId":  "github",
  "workspaceId":  "workspace_corp_alpha",
  "eventType":    "pr.merged",
  "resourceType": "pull_request",
  "resourceId":   "github:owner/repo/pulls/42",
  "action":       "closed",
  "actor": {
    "id":    "github:42",
    "name":  "alice",
    "email": null
  },
  "summary":   "PR #42 merged: feat: add vectorized search",
  "urgency":   "high",
  "sequence":  17,
  "metadata":  { "repo": "owner/repo", "merged": true },
  "receivedAt": "2026-07-09T12:00:00.000Z"
}
```

---

## Connector Support Matrix

| Connector | Event Types | Signature Scheme | Delivery ID Header |
|-----------|-------------|------------------|-------------------|
| GitHub | push, pull_request, issues, release, deployment, workflow_run | HMAC-SHA256 (`X-Hub-Signature-256`) | `X-GitHub-Delivery` |
| Slack | message.posted, reaction.added, channel.created | HMAC-SHA256 with timestamp (`X-Slack-Signature`) | `body.event_id` |
| Google | calendar.event_created/updated, gmail.message_received | Pub/Sub push + channel header | `X-Goog-Channel-Id:X-Goog-Message-Number` |
| Notion | page.created, page.updated, database.updated | No native signature (IP allowlist) | `X-Notion-Webhook-Id` |
| Jira | issue.opened/updated/closed, sprint events | HMAC-SHA256 (`X-Hub-Signature`) | `X-Atlassian-Event-Id` |

---

## FLOW Event Type → Urgency Mapping

| Urgency | Event Types |
|---------|-------------|
| **high** | deployment.failed, ci.failed, issue.opened, pr.merged, release.published, sprint.completed, message.channel.deleted, calendar.invite_received (P0/P1/critical label) |
| **medium** | pr.opened, pr.reviewed, pr.review_requested, issue.updated, issue.assigned, comment.added, sprint.started, deployment.created, deployment.succeeded |
| **low** | Everything else (message.posted, thread.replied, page.updated, etc.) |

Escalation: GitHub issues/PRs with `P0`, `P1`, `critical`, or `urgent` labels are promoted to `high`.

---

## Replay Protection

Two-layer deduplication:

1. **Redis SET NX** (primary): `wh:dedup:{workspaceId}:{connectorId}:{deliveryId}` with 24-hour TTL. `claimDelivery()` returns `true` on first-seen, `false` on duplicate — O(1) per event.

2. **PostgreSQL UNIQUE constraint**: `(workspace_id, connector_id, delivery_id)` on `webhook_events`. Catches duplicates if Redis is flushed or unavailable.

Manual replay bypasses dedup by appending a `:replay:{ts}` suffix to the delivery ID.

---

## Sequence Tracking

Monotonic sequence numbers per `(workspace, connector, resourceId)` via Redis INCR:

```
wh:seq:{workspaceId}:{connectorId}:{resourceId}  →  INCR (7-day TTL)
```

Out-of-order detection: if `currentSequence(resourceId) > incomingSequence`, the event may be a late delivery. The `sequence` field is stored on the event record for downstream ordering if needed.

---

## BullMQ Worker

Queue: `webhook-processing`  
Concurrency: 10  
Rate limit: 50/s  
Attempts: 5, exponential backoff (2s base)  

On final failure: event row updated to `processing_status = 'failed'` with error message for manual inspection via `GET /api/webhooks/manage/events?status=failed`.

---

## Webhook Management API

Base path: `/api/webhooks/manage` (JWT-protected)

### Registrations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/registrations` | List all registered webhooks |
| POST | `/registrations` | Register a new webhook + generate secret |
| GET | `/registrations/:connector` | Get single registration |
| PATCH | `/registrations/:connector` | Update event types or endpoint URL |
| DELETE | `/registrations/:connector` | Deactivate webhook |

**Register a webhook:**

```bash
curl -X POST http://localhost:5001/api/webhooks/manage/registrations \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{
    "connectorId": "github",
    "endpointUrl": "https://your-domain.com/api/webhooks/github?workspace=workspace_corp_alpha",
    "eventTypes": ["push", "pull_request", "issues", "release"]
  }'
# Response includes { "secret": "..." } — configure this in your GitHub webhook settings
```

### Event Log

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List recent events (filter: connector, urgency, status) |
| GET | `/events/:eventId` | Single event with delivery attempts |
| POST | `/events/:eventId/replay` | Re-enqueue a past event |

**View failed events:**

```bash
curl "http://localhost:5001/api/webhooks/manage/events?status=failed&connector=github" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"
```

**Replay an event:**

```bash
curl -X POST "http://localhost:5001/api/webhooks/manage/events/<eventId>/replay" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"
```

### Stats and Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Per-connector event counts, failure rates |
| GET | `/notifications` | Recent in-app notifications |
| PATCH | `/notifications/:id/read` | Mark notification as read |

---

## Inbound Webhook URL Format

```
POST https://your-domain.com/api/webhooks/{connector}?workspace={workspaceId}

# OR use X-Flow-Workspace header:
POST https://your-domain.com/api/webhooks/github
X-Flow-Workspace: workspace_corp_alpha
```

### Supported `:connector` values
`github` · `slack` · `google` · `gmail` · `google-calendar` · `notion` · `jira`

---

## Slack URL Verification

When registering a Slack Events API endpoint, Slack sends a `url_verification` challenge. The platform handles this automatically before any signature check:

```json
{ "type": "url_verification", "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXHW" }
→ 200 { "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXHW" }
```

---

## Connector Setup Checklist

### GitHub
1. Register webhook: `POST /api/webhooks/manage/registrations` → copy `secret`
2. In GitHub repo Settings → Webhooks → Add webhook:
   - Payload URL: `https://your-domain.com/api/webhooks/github?workspace=<id>`
   - Secret: paste the generated secret
   - Content type: `application/json`
   - Events: push, pull_request, issues, release, deployment, workflow_run

### Slack
1. Register webhook (no signature secret needed for Slack — uses signing secret):
   ```bash
   POST /api/webhooks/manage/registrations
   { "connectorId": "slack", "endpointUrl": "...", "secret": "<SLACK_SIGNING_SECRET>" }
   ```
2. In Slack API App settings → Event Subscriptions → Request URL: `https://your-domain.com/api/webhooks/slack?workspace=<id>`
3. Subscribe to bot events: `message.channels`, `message.groups`, `reaction_added`

### Jira
1. Register webhook with your Atlassian Connect shared secret
2. In Jira Automations or Atlassian Connect → Webhook URL: `https://your-domain.com/api/webhooks/jira?workspace=<id>`

### Notion
1. Register webhook (no signature):
   ```bash
   POST /api/webhooks/manage/registrations
   { "connectorId": "notion", "endpointUrl": "..." }
   ```
2. Notion webhooks require IP allowlist for your server's egress IP

### Google (Calendar / Gmail Push)
1. Register webhook:
   ```bash
   POST /api/webhooks/manage/registrations
   { "connectorId": "google", "endpointUrl": "..." }
   ```
2. Use Google Calendar `watch()` or Gmail `watch()` API to configure Pub/Sub push to `https://your-domain.com/api/webhooks/google?workspace=<id>`

---

## WebSocket Events

| Event | Consumer | Triggered by |
|-------|----------|-------------|
| `WEBHOOK_FEED_ITEM` | DailyWorkfeed | Every normalized event |
| `WEBHOOK_NOTIFICATION` | Notification bell | Medium+ urgency events |
| `TIMELINE_EVENT` | OperationalTimeline | Every normalized event |
| `RECOMMENDATION_SIGNAL` | RecommendationEngine | Events with weight ≥ 0.70 |
| `BRAIN_CONTEXT_UPDATE` | AICopilot | High urgency events |

---

## Validation

Run end-to-end validation:

```bash
node scripts/validate-webhook-platform.js
```

Checks: queue connectivity, replay protection (Redis), EventNormalizer for all 5 connectors, worker import, route registration, subscriber imports, DB table presence.

---

*Phase 10.3 delivered — 2026-07-09*
