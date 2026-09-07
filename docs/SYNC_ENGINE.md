# FLOW OS — Real Synchronization Engine
> Phase 10.2 · Last updated 2026-07-08

---

## 1. Overview

The synchronization engine continuously pulls data from all six connectors into FLOW's intelligence pipeline. Every item passes through dedup, delta detection, conflict resolution, and the 9-stage ingestion pipeline before landing in the vector store.

### Capabilities

| Feature | Implementation |
|---------|---------------|
| Initial sync | Full backfill from time-window start; all resource types enqueued in parallel |
| Incremental sync | Cursor-based (historyId, syncToken, ISO timestamp, Slack ts) — only changed items fetched |
| Manual sync | `POST /api/sync/:connectorId/start` — immediate BullMQ job |
| Background sync | BullMQ repeat jobs — fire on configurable interval per resource type |
| Scheduled sync | `sync_schedules` table + BullMQ repeat jobs; restored on server boot |
| Webhook-triggered sync | Webhook handlers enqueue narrow targeted sync with the event payload |
| Retry queue | BullMQ: 5 attempts, exponential backoff (10s → 160s) |
| Dead-letter handling | After 5 failures: moved to `dead_letter_queue` table, WebSocket alert |
| Duplicate prevention | `sync_items` table: `(workspace_id, connector_id, resource_type, external_id, etag)` |
| Checkpoint persistence | `sync_state` table: platform-native cursor per `(workspace, connector, resource_type)` |
| Delta synchronization | etag comparison skips unchanged items before ingestion |
| Conflict handling | Calendar/Notion: `sync_conflicts` table, `remote_wins` default strategy |
| Sync statistics | `sync_records` table: per-run counts, durations, success rate |
| Progress reporting | WebSocket events: `SYNC_STARTED`, `SYNC_PROGRESS`, `SYNC_COMPLETED`, `SYNC_FAILED`, `SYNC_DLQ` |

---

## 2. Architecture

```
Webhook / Manual / Schedule
         │
         ▼
  BullMQ connector-sync queue
  (dedup by jobId: workspace:connector:resourceType)
         │
         ▼
    SyncWorker (concurrency=6, rate limit 20/s)
         │
         ▼
    SyncEngine.runSync()
    ├─ Load checkpoint (sync_state)
    ├─ Connector adapter → { items[], newCursor }
    ├─ DeltaProcessor.isDuplicate() per item (sync_items table)
    ├─ ConflictResolver.checkConflict() (Calendar/Notion only)
    ├─ ingestionQueue.add() for each new item
    ├─ DeltaProcessor.bulkMarkSynced() (batch upsert)
    ├─ markSyncComplete() (update sync_state cursor)
    └─ ProgressReporter (WebSocket broadcast)
         │
    on all retries fail:
    DeadLetterService.moveToDLQ() → dead_letter_queue
```

---

## 3. Connector Resource Types

### GitHub (`github`)
| Resource | Cursor | ETag | Sync interval |
|----------|--------|------|--------------|
| `repositories` | ISO timestamp (pushed_at) | pushed_at | 15 min |
| `pull_requests` | ISO timestamp (updated_at) | updated_at | 15 min |
| `issues` | ISO timestamp (updated_at, via GitHub `?since=`) | updated_at | 15 min |
| `commits` | ISO timestamp (`?since=`) | commit SHA (immutable) | 15 min |
| `releases` | ISO timestamp (published_at) | published_at | 15 min |

Webhook events map to resource types:
- `push` → `commits`
- `pull_request`, `pull_request_review` → `pull_requests`
- `issues` → `issues`
- `release` → `releases`

### Gmail (`gmail`)
| Resource | Cursor | ETag | Sync interval |
|----------|--------|------|--------------|
| `threads` | Gmail `historyId` (incremental history API) | historyId | 10 min |
| `messages` | Gmail `historyId` | historyId | 10 min |
| `labels` | ISO timestamp | label ID | 10 min |

Thread incremental sync uses Gmail's `users.history.list` API with `startHistoryId`. If the historyId is older than 7 days (Google expires them), falls back to a full thread list with `users.threads.list`.

### Google Calendar (`google-calendar`)
| Resource | Cursor | ETag | Sync interval |
|----------|--------|------|--------------|
| `events` | Google Calendar `syncToken` | event etag | 15 min |
| `invites` | ISO timestamp | event etag | 15 min |

Event incremental sync uses Google Calendar's `syncToken` API. A `410 Gone` response (expired token) triggers a full re-sync from `timeMin`. Invite sync filters for events where `selfAttendee.responseStatus === 'needsAction'`.

### Slack (`slack`)
| Resource | Cursor | ETag | Sync interval |
|----------|--------|------|--------------|
| `channels` | ISO timestamp | channel_id + updated | 10 min |
| `messages` | Unix ts string (`"1720396800.000000"`) | message ts | 10 min |
| `threads` | Unix ts string | reply ts | 10 min |

Slack's `oldest` parameter accepts Unix timestamps. The cursor advances to the latest message ts after each sync. Up to 20 channels are synced per run (configurable via `MAX_CHANNELS`).

### Notion (`notion`)
| Resource | Cursor | ETag | Sync interval |
|----------|--------|------|--------------|
| `pages` | ISO timestamp (filter: `last_edited_time > cursor`) | last_edited_time | 30 min |
| `databases` | ISO timestamp | last_edited_time | 30 min |

Database sync also ingests the 20 most recently edited rows in each database.

### Jira (`jira`)
| Resource | Cursor | ETag | Sync interval |
|----------|--------|------|--------------|
| `projects` | ISO timestamp | project_id | 20 min |
| `issues` | ISO timestamp (JQL: `updated >= "date"`) | issue.fields.updated | 20 min |
| `comments` | ISO timestamp | comment.updated | 20 min |

Jira uses JQL for incremental queries. Comment sync fetches comments from issues updated since the cursor.

---

## 4. Dedup and Delta

### sync_items table
```sql
(workspace_id, connector_id, resource_type, external_id, etag) UNIQUE
```

Before each item is ingested:
1. `DeltaProcessor.isDuplicate()` checks if `external_id` + `etag` match the stored row
2. If match → `itemsSkipped++`, still calls `bulkMarkSynced` to update `last_seen_at`
3. If new or etag changed → ingest into the pipeline, then update row

`etag` values per connector:
- GitHub: `commit.sha` (commits), `updated_at` (PRs/issues/releases)
- Gmail: `historyId` string
- Calendar: Google's event `etag` header value
- Slack: message `ts` (immutable)
- Notion: `last_edited_time` ISO string
- Jira: `issue.fields.updated` ISO string

### Dedup in BullMQ
Ingestion jobs are keyed: `ingest:{workspaceId}:{connectorId}:{externalId}`. BullMQ deduplicates pending jobs with the same ID — if the item is already waiting in the ingestion queue, it won't be added again.

---

## 5. Checkpoint Persistence

Cursors are stored in `sync_state`:

```sql
UNIQUE (workspace_id, connector_id, resource_type)
cursor TEXT  -- platform-native value
```

The cursor is updated atomically with `markSyncComplete()`. If a sync fails, the previous cursor is retained so the next run resumes from the same position (no data loss, some duplication is acceptable).

---

## 6. Scheduled Sync

Schedules are activated per workspace after OAuth connect:

```
POST /api/sync/schedules/github
→ activates 5 BullMQ repeat jobs (one per resource type)
→ stores 5 rows in sync_schedules table
```

On server restart, `SyncWorker` calls `restoreSchedulesOnBoot()` which re-registers all enabled schedules from the database. BullMQ also persists repeat job definitions in Redis, so this is a double safety net.

### Default intervals
| Connector | Interval |
|-----------|---------|
| GitHub | 15 minutes |
| Gmail | 10 minutes |
| Google Calendar | 15 minutes |
| Slack | 10 minutes |
| Notion | 30 minutes |
| Jira | 20 minutes |

---

## 7. Webhook-Triggered Sync

Incoming webhooks trigger narrow syncs in addition to direct ingestion:

```
POST /api/webhooks/github
  → ingestionQueue.add('webhook', { text: eventText })   ← fast: text summary
  → enqueueSyncJob(workspaceId, 'github', 'pull_requests', { webhookPayload })
     → GitHubSyncAdapter uses webhookPayload.pull_request directly (no API call)
```

Webhook-triggered sync is zero-latency for the event payload itself (ingested immediately) plus a targeted delta sync for the full resource state.

---

## 8. Dead-Letter Queue

A job moves to the DLQ after 5 failed attempts (exponential backoff: 10s → 160s):

```sql
dead_letter_queue: { status: 'pending' | 'retrying' | 'resolved' | 'dismissed' }
```

WebSocket event `SYNC_DLQ` fires for each DLQ entry. The Integration Hub UI displays DLQ count per connector.

### DLQ API
```bash
# List pending DLQ entries
GET /api/sync/dead-letters

# Re-enqueue for retry
POST /api/sync/dead-letters/:id/retry

# Dismiss (mark as won't fix)
POST /api/sync/dead-letters/:id/dismiss
```

---

## 9. Conflict Handling

Conflicts are detected for Google Calendar and Notion, where FLOW can store metadata back to the provider (meeting notes, page properties). For all other connectors the provider is pure source-of-truth and conflicts cannot arise.

Detection: if `sync_items.etag !== remoteEtag` for a Calendar/Notion item, a conflict is logged.

Default resolution: `remote_wins` — the provider's current state is ingested, overwriting any local FLOW metadata. The conflict is logged in `sync_conflicts` for audit.

---

## 10. Progress Reporting

All sync events are broadcast to the workspace's WebSocket channel:

| Event | Payload |
|-------|---------|
| `SYNC_STARTED` | `{ connectorId, resourceType, trigger }` |
| `SYNC_PROGRESS` | `{ connectorId, resourceType, itemsProcessed, itemsNew, itemsSkipped, page }` |
| `SYNC_COMPLETED` | `{ connectorId, resourceType, itemsSynced, itemsNew, itemsSkipped, durationMs, newCursor }` |
| `SYNC_FAILED` | `{ connectorId, resourceType, error, attempt, maxAttempts }` |
| `SYNC_DLQ` | `{ connectorId, resourceType, error, dlqId }` |

Progress is broadcast every 25 items during a sync run.

---

## 11. API Reference

### Sync management (`/api/sync` — JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/:connectorId/start` | Trigger full sync (all resource types) |
| POST | `/api/sync/:connectorId/:resourceType/start` | Trigger narrow sync |
| GET | `/api/sync/:connectorId/status` | Current cursor + stats per resource type |
| GET | `/api/sync/history` | Sync run history (`?connector=&limit=`) |
| GET | `/api/sync/stats` | Aggregate stats for all synced connectors |
| GET | `/api/sync/schedules` | List active schedules |
| POST | `/api/sync/schedules/:connectorId` | Activate scheduled sync |
| DELETE | `/api/sync/schedules/:connectorId` | Deactivate scheduled sync |
| GET | `/api/sync/dead-letters` | List DLQ entries |
| POST | `/api/sync/dead-letters/:id/retry` | Re-enqueue DLQ entry |
| POST | `/api/sync/dead-letters/:id/dismiss` | Dismiss DLQ entry |
| GET | `/api/sync/conflicts` | List sync conflicts |

### Webhook endpoints (`/api/webhooks` — public, HMAC-verified)

| Method | Path | Connector |
|--------|------|-----------|
| POST | `/api/webhooks/github?workspace=:id` | GitHub events |
| POST | `/api/webhooks/slack?workspace=:id` | Slack Events API |
| POST | `/api/webhooks/jira?workspace=:id` | Jira Atlassian Connect |

---

## 12. File Map

| File | Purpose |
|------|---------|
| `src/services/sync/SyncEngine.js` | Main orchestrator; `runSync()`, `runInitialSync()` |
| `src/services/sync/SyncScheduler.js` | BullMQ repeat job manager; `activateSchedule()`, `restoreSchedulesOnBoot()` |
| `src/services/sync/DeltaProcessor.js` | Item-level dedup via `sync_items` table |
| `src/services/sync/DeadLetterService.js` | DLQ management; `moveToDLQ()`, `retryDeadLetter()` |
| `src/services/sync/ProgressReporter.js` | WebSocket sync event broadcasts |
| `src/services/sync/ConflictResolver.js` | Conflict detection and resolution logging |
| `src/services/sync/connectors/GitHubSyncAdapter.js` | repos · prs · issues · commits · releases |
| `src/services/sync/connectors/GmailSyncAdapter.js` | threads · messages · labels |
| `src/services/sync/connectors/CalendarSyncAdapter.js` | events · invites |
| `src/services/sync/connectors/SlackSyncAdapter.js` | channels · messages · threads |
| `src/services/sync/connectors/NotionSyncAdapter.js` | pages · databases |
| `src/services/sync/connectors/JiraSyncAdapter.js` | projects · issues · comments |
| `src/workers/syncWorker.js` | BullMQ consumer; DLQ handler; schedule restore on boot |
| `src/routes/syncRoutes.js` | REST API at `/api/sync` |
| `src/routes/webhookRoutes.js` | Inbound webhook receiver; triggers targeted syncs |
| `src/services/integrations/SyncStateManager.js` | Cursor + history persistence (unchanged) |
| `scripts/migrate-sync-engine-v10-2.sql` | DB migration: sync_items, dead_letter_queue, sync_conflicts, sync_schedules |

---

## 13. Setup

### Apply migration
```bash
psql "$DATABASE_URL" -f scripts/migrate-sync-engine-v10-2.sql
```

### Activate sync after OAuth connect
```bash
# After connecting GitHub:
POST /api/sync/schedules/github
Authorization: Bearer <jwt>
workspace-id: workspace_corp_alpha

# Manual immediate sync:
POST /api/sync/github/start
```

### Register webhooks (optional — sync works without them)
```bash
# Register GitHub webhook (returns endpoint URL + secret)
POST /api/integrations-hub/github/webhook
Authorization: Bearer <jwt>
workspace-id: workspace_corp_alpha

# Set the returned endpoint URL + secret in github.com/settings/hooks
```

---

## 14. Adding a New Connector

1. Create `src/services/sync/connectors/MyConnectorSyncAdapter.js`:
   - Export `RESOURCE_TYPES = ['type_a', 'type_b']`
   - Export `async function sync(workspaceId, resourceType, cursor, opts)`
   - Return `{ items: [{ externalId, etag, platform, sender, channel, text, metadata }], newCursor }`

2. Register in `SyncEngine.js`:
   ```js
   const ADAPTERS = {
     'my-connector': () => import('./connectors/MyConnectorSyncAdapter.js'),
   };
   SYNC_INTERVALS['my-connector'] = 20 * 60 * 1000;
   DEFAULT_RESOURCE_TYPES['my-connector'] = ['type_a', 'type_b'];
   ```

3. No other files need to change.

---

*Phase 10.2 — Real Synchronization Engine. No simulated data.*
