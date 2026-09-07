# Observability Guide — FLOW OS

> Phase 12 Milestone 2, Part 3. How FLOW OS exposes its internal state: structured
> logs, correlation IDs, unified metrics, and alerts.

---

## 1. Structured logging

Set `LOG_FORMAT=json` (automatic in production) for one JSON object per log line —
ready for ingestion by any log pipeline (Loki, ELK, Datadog, CloudWatch).

```json
{"ts":"2026-07-11T…","level":"info","service":"flow-os","channel":"request",
 "msg":"request","requestId":"…","method":"POST","path":"/api/query","status":200,
 "durationMs":142,"workspaceId":"workspace_corp_alpha","userId":"usr_…"}
```

| Field | Meaning |
|-------|---------|
| `level` | info · warn · error |
| `channel` | INFO / QUEUE / RAG / MEMORY / VECTOR / SECURITY / request |
| `requestId` | Correlation ID — matches the `x-request-id` response header |
| `workspaceId` / `userId` | Tenant + actor (when known) |
| `durationMs` | Request/operation timing |

**Redaction (never logged):** keys matching
`password / secret / token / authorization / api_key / jwt / cookie /
refresh_token / access_token / client_secret / private_key / ssn / credit_card`
are replaced with `[REDACTED]` recursively before any line is written
(`src/utils/logger.js` → `redact()`). Verified by the observability probe.

### Correlation IDs

Every request gets an `x-request-id` (propagated from the caller if present,
generated otherwise), attached as `req.id`, echoed in the response header, and
included in the request log line and error responses. Use it to trace a single
request across logs and error reports.

## 2. Unified metrics — `GET /api/metrics`

Auth: `Authorization: Bearer <ADMIN-JWT>` **or** a static `METRICS_TOKEN` bearer
(for scraper agents). Available in **all environments**. Returns:

```
timestamp, uptimeSec
process   { pid, cpuPercent, memory{rss,heapUsed,heapTotal}, heapUsedPct, node }
db        { max, total, idle, waiting, queries, slowQueries, errors }
redis     { status, reconnects }
queues    { <queue>: {waiting,active,completed,failed,delayed} }   # all 6 BullMQ queues
eventPlatform { throughput{eventsPerSec}, latencyMs{p50,p95,p99}, counters{…}, byType, byConnector }
engines   { prediction:{runs,avgMs,p95Ms,lastAt}, simulation:{…} }
connectors{ <workspace>: {executed,denied,approvalRequired} }
websocket { active connections per workspace }
```

Covers Part 2's required signals: latency, errors, queue depth, worker health,
memory, CPU, DB pool, Redis, events/sec, predictions/sec, simulation runtime.

The infra-only subset (no auth, no tenant data) is also at `GET /metrics/infra`.

## 3. Alerts — `GET /api/metrics/alerts`

Deterministic rule evaluation over the aggregated metrics (pull-based). Returns
`{ status: ok|degraded|critical, count, bySeverity, alerts[] }`. Rules + thresholds
(env-overridable):

| Rule | Severity | Default threshold |
|------|----------|-------------------|
| `queue_backlog` | warning | `ALERT_QUEUE_BACKLOG` = 1000 waiting |
| `queue_failures` | critical | `ALERT_QUEUE_FAILED` = 50 failed |
| `db_pool_saturation` | warning | `ALERT_DB_WAITING` = 20 waiting |
| `redis_unhealthy` | critical | status ≠ ready |
| `redis_flapping` | warning | ≥ 5 reconnects |
| `high_memory` | warning | `ALERT_HEAP_PCT` = 90% |
| `high_cpu` | warning | `ALERT_CPU_PCT` = 90% |
| `event_dead_letter` | warning | `ALERT_EVENT_DLQ` = 25 |

## 4. Monitoring dashboard — `/monitoring`

Dev-only admin UI (404 in production; paste an ADMIN JWT). Auto-refreshes every 5s
and renders overall health, process/CPU/memory, DB pool, Redis, queues, event
platform, engines, connectors, WebSockets, and active alerts. It consumes the same
`/api/metrics` endpoints, so what you see is exactly what a monitoring system sees.

## 5. Wiring to external systems

- **Prometheus/Datadog:** scrape `GET /api/metrics` with a `METRICS_TOKEN`; map the
  JSON into your metrics store (or add a `/metrics/prometheus` text exporter).
- **Log pipeline:** run with `LOG_FORMAT=json` and ship stdout/stderr.
- **Alerting:** poll `GET /api/metrics/alerts` from your scheduler/pager, or wire
  the existing `evaluateAlerts()` into a BullMQ cron to push notifications.

---

*Part of Phase 12 — Production Hardening (Milestone 2).*
