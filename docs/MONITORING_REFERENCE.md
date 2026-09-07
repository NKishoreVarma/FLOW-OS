# Monitoring Reference — FLOW OS

> Phase 12 Milestone 2, Part 4/5. Quick reference of every monitoring surface,
> what it reports, and the alert catalogue.

---

## Endpoints

| Endpoint | Auth | Env | Purpose |
|----------|------|-----|---------|
| `GET /health/live` | none | all | Liveness (process up) |
| `GET /health/ready` | none | all | Readiness (pg+redis; 503 during shutdown) |
| `GET /health` | none | all | Full component status |
| `GET /metrics/infra` | none | all | Infra snapshot (pool/redis/queues/memory) |
| `GET /api/metrics` | ADMIN JWT / `METRICS_TOKEN` | all | Unified metrics |
| `GET /api/metrics/alerts` | ADMIN JWT / `METRICS_TOKEN` | all | Evaluated alerts |
| `/monitoring` | ADMIN JWT (in UI) | dev only | Dashboard |
| `/event-inspector` · `/graph-explorer` · `/replay-player` · `/simulation-workspace` · `/prediction-workspace` | ADMIN JWT (in UI) | dev only | Per-engine admin surfaces |

## What each subsystem reports

| Subsystem | Source | Key signals |
|-----------|--------|-------------|
| **Process** | `metricsAggregator` | cpuPercent, heapUsed/Total, rss, uptime, node version |
| **PostgreSQL** | `config/db.js#poolStats` | pool max/total/idle/waiting, query count, slowQueries, errors |
| **Redis** | `config/redis.js#redisHealth` | status (ready/…), reconnect count |
| **BullMQ (×6)** | `queueMetrics` | waiting/active/completed/failed/delayed per queue |
| **Event platform** | `EventMetrics` | events/sec, latency p50/p95/p99, published/stored/duplicates/dead-lettered |
| **Engines** | `engineMetrics` | prediction & simulation run counts + avg/p95 latency |
| **Connectors** | governance `getAllConnectorMetrics` | executed / denied / approvalRequired per workspace |
| **WebSockets** | `socketService#getSocketStatus` | active connections per workspace |
| **Workers** | queue counts (active/failed) | health inferred from queue activity + failures |

The six BullMQ queues: `ingestion-queue`, `summary-queue`, `connector-sync`,
`webhook-processing`, `event-retention-queue`, `prediction-queue`.

## Alert catalogue

| Rule | Severity | Trigger | Handling |
|------|----------|---------|----------|
| `queue_backlog` | warning | queue waiting ≥ threshold | Scale workers / investigate stuck jobs |
| `queue_failures` | critical | queue failed ≥ threshold | Inspect DLQ; replay after fixing root cause |
| `db_pool_saturation` | warning | queries waiting on pool | Raise `DB_POOL_MAX` or reduce load |
| `db_error_rate` | warning | query error rate ≥ 5% | Check DB health / slow-query log |
| `redis_unhealthy` | critical | status ≠ ready | Check Redis; readiness will fail → LB drains |
| `redis_flapping` | warning | ≥ 5 reconnects | Network/Redis stability |
| `high_memory` | warning | heap ≥ 90% | Check for leaks; restart if needed |
| `high_cpu` | warning | cpu ≥ 90% | Scale out; profile hot path |
| `event_dead_letter` | warning | ≥ 25 dead-lettered | Inspect failing subscribers |
| `event_drops` | info | invalid events dropped | Check producer payloads |

## Suggested SLO signals

- **Availability:** `/health/ready` success rate.
- **Latency:** event-platform p95, engine p95, request `durationMs`.
- **Saturation:** DB pool waiting, queue backlog, heap %.
- **Errors:** 5xx request rate, queue failures, DB errors.

---

*Part of Phase 12 — Production Hardening (Milestone 2).*
