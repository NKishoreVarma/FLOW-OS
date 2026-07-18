# Unified Event Platform — Phase 11.0

> The nervous system of FLOW. Every activity anywhere in the company becomes one
> normalized **FLOW Event** that every intelligence module consumes. After this
> phase there are no "GitHub events", "Slack events", or "Calendar events" — only
> FLOW Events, one pipeline, many independent consumers.

---

## 1. Why this exists

Before Phase 11.0 there were two overlapping event systems: the Phase 9.4 real-time
intelligence pipeline (`src/services/events`) and the Phase 10.3 webhook fan-out
(`src/services/webhooks`), plus a bare in-process `EventEmitter`
(`src/core/events/eventBus`). Adding a connector meant touching connector-specific
pipelines and duplicating normalization and routing.

Phase 11.0 **consolidates** these into a single canonical platform at `src/events`.
The validated 9.4 intelligence engines and 10.3 provider parsing are **reused as
internals** — nothing working was rewritten. What was added is the durable,
replayable, observable spine they were missing.

**The payoff:** adding a new connector now requires only three things —
1. OAuth 2. Sync 3. Event normalization (publish to `src/events`).
Timeline, Operational Brain, Memory, Knowledge Graph, Recommendations,
Notifications, Workspace Feed, Analytics, Audit, and Search all work
automatically, because they subscribe to the one bus.

---

## 2. Architecture

```
   Producers                    THE ONE PIPELINE (src/events)                 Consumers
 ┌───────────┐         ┌───────────────────────────────────────────┐   ┌──────────────────┐
 │ ingestion │         │  EventPublisher                           │   │ timeline         │
 │ worker    │──────▶  │    normalize → score → (version stamp)    │   │ feed             │
 ├───────────┤         │  EventBus.publish                         │   │ memory (+KG)     │
 │ webhook   │──────▶  │    validate → correlate → append(store)   │──▶│ notify           │
 │ worker    │         │    → route → mirror(legacy emit)          │   │ brain (→RAG)     │
 ├───────────┤         │                                           │   │ recommendation   │
 │ connector │──────▶  │  EventStore (PostgreSQL: flow_events)      │   │ …your consumer   │
 │ actions   │         │  EventRouter (retry · DLQ · metrics)       │   └──────────────────┘
 ├───────────┤         │  EventCorrelation (groups + causation)     │
 │ internal  │──────▶  │  EventReplay · EventSearch · EventMetrics  │   Each subscribes
 │ (AI, mem) │         │  EventRetention · EventSchemaRegistry      │   independently.
 └───────────┘         └───────────────────────────────────────────┘   No connector coupling.
```

### Module map (`src/events/`)

| Module | Responsibility |
|--------|----------------|
| `index.js` | Public barrel — the only import path for producers/consumers |
| `EventSchemaRegistry.js` | Unified schema, 21 event types, `validate()`, migration registry |
| `EventVersioning.js` | Stamp `version`, upcast stored events to current schema |
| `EventNormalizer.js` | Single translation boundary — wraps 9.4 normalizer + scoring + webhook bridge |
| `EventStore.js` | Durable PostgreSQL persistence (`flow_events`), tenant-scoped reads |
| `EventBus.js` | **The one pipeline**: validate → correlate → store → route → mirror |
| `EventPublisher.js` | Producer entry: `publish` · `publishFields` · `publishWebhook` |
| `EventSubscriber.js` | Subscription registry with filters + priority |
| `EventRouter.js` | Routing authority: parallel fan-out, retry/backoff, dead-letter, metrics |
| `EventCorrelation.js` | Wraps 9.4 correlation engine, adds `causationId`/`parentEvent` |
| `EventReplay.js` | Re-deliver stored events by time/connector/user/type/correlation |
| `EventMetrics.js` | Throughput, latency percentiles, per-type/connector, failure counters |
| `EventRetention.js` | Age-based pruning per event type |
| `EventSearch.js` | Structured + text query over the durable store |
| `EventInspector.js` | Read-only observability aggregations for the admin page |
| `builtinSubscribers.js` | Registers FLOW's core consumers on the bus (the consolidation seam) |
| `orgResolver.js` | workspaceId → organizationId cache |

---

## 3. The unified FLOW Event

Every event carries these canonical fields (a **superset** of the Phase 9.4
`CompanyEvent`, so the validated engines consume it unchanged):

```
eventId · eventType · connector · workspaceId · organizationId · actor · entity
title · summary · timestamp · payload · metadata · importance · confidence
priority · correlationId · causationId · parentEvent · sourceEventId · version
```

### Event types (21)

Engineering · Meeting · Communication · Customer · Knowledge · Incident · Approval ·
Deployment · Task · Security · Authentication · Integration · Recommendation · AI ·
Memory · Timeline · plus extended: Automation · Finance · HR · Compliance · Custom.

Every current and future connector maps into exactly one of these. New types
register in `EventSchemaRegistry`.

---

## 4. Publish sequence

```
Producer.publish(source, rawType, payload, ctx)
  │
  ├─ EventNormalizer.normalize()      raw payload → CompanyEvent → score → unified event
  ├─ EventBus.publish(event)
  │    ├─ stampVersion + validate      invalid → DROP (counted), never throws to caller
  │    ├─ correlate                    sets correlationId + causationId (Redis window)
  │    ├─ EventStore.append            INSERT ... ON CONFLICT DO NOTHING  ← exactly-once
  │    │                               duplicate (PK or source unique) → SKIP (counted)
  │    ├─ EventRouter.route            parallel fan-out to matching subscribers
  │    │    └─ per subscriber: try → retry(backoff) → dead-letter; record outcome
  │    └─ legacyBus.emit               mirror to in-process EventEmitter (compat)
  └─ returns { published, eventId, duplicate?, delivery[] }
```

Webhooks take the same path via `publishWebhook`, which reuses the Phase 10.3
provider parser as an internal normalizer before entering the bus.

---

## 5. Subscriber model

Consumers register with a filter and options — there is no direct connector coupling:

```js
import { subscribe } from '../events/index.js';

subscribe('my-consumer',
  { types: ['incident', 'deployment'], connectors: ['github'] },  // filter (all optional)
  async (event) => { /* handle the unified event */ },
  { priority: 5, durable: true, retries: 2 },                     // options
);
```

- **Fault isolation** — one subscriber throwing never blocks another (parallel `allSettled`).
- **Priority** — lower number runs earlier (scheduling only; all still run).
- **Durable + retries** — durable subscribers retry with exponential backoff, then
  land in the **dead-letter** state (`flow_event_deliveries.status = 'dead_letter'`).
- **A subscriber failure never loses the event** — it is already durably stored
  before routing begins.

FLOW's built-in subscribers (registered in `builtinSubscribers.js`): `timeline`,
`feed`, `memory` (durable), `notify`, `brain` (urgent → RAG ingestion),
`recommendation`.

**Loop-prevention invariant:** the `brain` subscriber never re-enqueues events with
`metadata.origin === 'ingestion'` or `metadata.replayed`, so
publish → ingestion → publish cannot cycle (mirrors the automation-engine
governance rule).

---

## 6. Replay model

Replay re-delivers stored events to subscribers **without re-storing them**
(default sink = `EventRouter.route`), so it never pollutes the durable log.

```js
replay({ workspaceId, range: 'hour'|'day'|'week' });   // or explicit since/until
replay({ workspaceId, connector: 'github' });
replay({ workspaceId, actorId: 'user:github:alice' });
replay({ workspaceId, eventType: 'incident' });
replay({ workspaceId, correlationId });
```

Replayed events are tagged `metadata.replayed = true` with `originalEventId`. Older
events are upcast to the current schema via `EventVersioning.migrate` on the way
out. REST: `POST /api/events/replay` (ADMIN/OWNER) and per-workspace filters.

Use cases: debugging a consumer, rebuilding a downstream projection, and future
simulations.

---

## 7. Storage & data model

**`flow_events`** — the single durable log. Append-only, idempotent.
- PK `event_id`; partial unique `(workspace_id, connector, source_event_id)` for
  provider idempotency.
- Indexes: `(workspace_id, ts)`, `(workspace_id, event_type, ts)`,
  `(workspace_id, connector, ts)`, `correlation_id`, `causation_id`, a **BRIN** on
  `ts` for wide replay/retention scans, and a **GIN** on `metadata`.
- Tenant isolation is enforced at the query layer — `workspace_id` is mandatory on
  every read path; no query can return another workspace's events.

**`flow_event_deliveries`** — one row per (event, subscriber) outcome
(`delivered | failed | dead_letter`) with attempts, error, and latency. Powers the
Inspector's failure/DLQ/subscriber views.

Migration: `scripts/migrate-event-platform-v11-0.sql` (idempotent).

---

## 8. Observability — the Event Inspector

Internal admin page at **`/event-inspector`** (dev only — 404 in production;
API requires an OWNER/ADMIN JWT + `workspace-id` header, like the dev dashboard).

Tabs: **Overview** (throughput, latency p95, dedup/failure counters, volume by
type/connector), **Live Events**, **Subscribers** (per-subscriber delivered/failed/
dead-letter + latency), **Failures / DLQ**, and **Event Detail** (full payload,
metadata, correlation/causation, and per-subscriber delivery outcomes).

Programmatic metrics: `GET /api/events/metrics` and `getMetrics()` return
events/sec, latency p50/p95/p99, per-type and per-connector volume, and the
published/stored/duplicate/delivered/failed/dead-letter counters.

---

## 9. Failure recovery

| Failure | Behavior |
|---------|----------|
| Invalid event | Dropped before storage, `dropped` counter incremented, caller never sees a throw |
| Duplicate (replay, retry, provider re-send) | `ON CONFLICT DO NOTHING` → skipped, `duplicates` counter incremented — **exactly-once storage** |
| Malformed/garbage payload | Normalizer never throws; event is produced or safely dropped; pipeline continues |
| One subscriber throws | Isolated — other subscribers still deliver; event remains stored |
| Durable subscriber keeps failing | Retried with backoff, then dead-lettered for inspection |
| Redis (correlation) down | Correlation is best-effort; publish still stores + routes |
| Process restart | Durable store persists; in-memory metrics reset; dedup still holds |

All of the above are asserted by `scripts/loadtest-event-platform.js`.

---

## 10. Scaling strategy

- **Read scaling** is index-first: every hot read is workspace-scoped and covered
  by a composite index; wide time scans use the BRIN on `ts`.
- **Write scaling** is append-only with `ON CONFLICT DO NOTHING` — no read-modify-write.
- **Next steps when volume demands it** (not needed at current scale):
  1. **Time-partition** `flow_events` by month (declarative partitioning on `ts`);
     retention then becomes a partition `DROP` instead of batched `DELETE`.
  2. Move the hot fan-out path onto **Redis Streams / BullMQ** for durable
     per-subscriber queues with independent consumer-group lag (the `EventRouter`
     interface already isolates this).
  3. Read-replica the store for Inspector/analytics queries.
- **Retention** (`EventRetention.prune`) caps table growth per type today; wire it
  to a BullMQ cron for hands-off operation.

---

## 11. Adding a new connector (the whole checklist)

1. **OAuth** — register the adapter's auth.
2. **Sync** — pull resources.
3. **Normalize** — call `publish(connectorId, rawType, payload, { workspaceId })`.

That's it. Do **not** write a timeline handler, a memory writer, a recommendation
hook, or a notification path — they already subscribe to the bus. If the connector
needs a new event type, add it to `EventSchemaRegistry`.

---

## 12. Performance benchmarks

Measured by `scripts/loadtest-event-platform.js` against local PostgreSQL + Redis
(Apple Silicon, single process). Numbers are indicative of mechanics, not a tuned
production cluster.

**Run: 100,000 events (`node scripts/loadtest-event-platform.js`) — all 14 scenarios pass.**

| Scenario | Events | Throughput | Notes |
|----------|-------:|-----------:|-------|
| Durable store append | 100,000 | **~22,800 events/s** | `EventStore.append`, concurrency 120, `ON CONFLICT DO NOTHING` |
| Full pipeline (bus) | 10,000 | **~266 events/s** | validate → correlate (Redis) → store → fan-out to 3 subscribers, concurrency 80 |
| Unbounded burst | 5,000 | ~33 events/s | 5,000 fired at once — intentionally saturates the pg pool to show graceful degradation |

| Latency (end-to-end publish) | p50 | p95 | p99 |
|------------------------------|----:|----:|----:|
| Steady-state (bounded concurrency) | ~563 ms | ~664 ms | ~665 ms |
| Burst tail (unbounded 5k concurrent) | ~149 s | ~149 s | ~149 s |

The gap between store throughput (~22.8k/s) and full-pipeline throughput (~266/s)
is the per-event correlation (several Redis ops) plus fan-out — the correctness
work, not the durable write. The unbounded-burst row is deliberately hostile
(5,000 simultaneous connections against a small pool): correctness holds (every
event stored and accounted for) while latency degrades — exactly the case the
§10 scaling steps (queue-backed fan-out, larger pool, partitioning) address.



**Guarantee verified:** across 100k+ events with injected connector failures,
subscriber failures, duplicates, out-of-order streams, bursts, replay, and a
simulated restart — **every event processed exactly once or retried safely**, and
no subscriber failure ever lost an event.

---

## 13. Migration status (Phase 11.0)

- **Milestone 1 (durable core + consolidation)** — complete. `src/events` is the
  canonical platform; producers (ingestion worker, webhook worker, connector
  actions) publish only through it; the built-in consumers subscribe through it.
  The old public APIs (`services/events/EventPipeline`,
  `services/webhooks/EventBroadcaster`) are thin forwarding shims that log a
  one-time deprecation notice. Integration validation: 284 pass / 0 fail (no
  regressions). Platform acceptance: `scripts/validate-event-platform.js` 13/13.
- **Milestone 2 (experience)** — complete. Event Inspector admin page, the 100k
  load/recovery harness, and this document.

The bare `core/events/eventBus` EventEmitter remains as the low-level in-process
primitive the canonical bus emits through — it is intentionally not removed.
