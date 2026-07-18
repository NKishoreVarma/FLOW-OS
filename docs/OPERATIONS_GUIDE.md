# Operations Guide — FLOW OS

> Phase 12 Milestone 2, Part 6. Day-2 operations for running FLOW OS in
> production: deploy, monitor, scale, restart, recover, respond to incidents.
> See also `DEPLOYMENT_GUIDE.md`, `OBSERVABILITY_GUIDE.md`, `MONITORING_REFERENCE.md`,
> `SECURITY_AUDIT.md`.

---

## 1. Deployment (summary)

`docker compose up --build` (self-contained) or the app image against managed
Postgres+Redis. Apply migrations once (Prisma + `scripts/migrate-*.sql` + `CREATE
EXTENSION vector`). Set `JWT_SECRET`, `CORS_ORIGIN`, `WS_AUTH_REQUIRED=true`, and an
AI key. Full details in `DEPLOYMENT_GUIDE.md`.

## 2. Monitoring

- Point liveness at `/health/live`, readiness at `/health/ready`.
- Scrape `/api/metrics` (ADMIN JWT or `METRICS_TOKEN`); poll `/api/metrics/alerts`.
- Ship `LOG_FORMAT=json` logs to your pipeline; trace with `x-request-id`.
- Watch the dashboard at `/monitoring` (dev) or your own Grafana on the metrics.

**Golden signals:** readiness success, event-platform + engine p95 latency, DB pool
waiting, queue backlog/failures, heap %, 5xx rate.

## 3. Scaling

- **API/workers are stateless** (JWT auth, Redis-coordinated queues) — scale
  horizontally behind a load balancer. No session affinity.
- **DB pool:** keep `replicas × DB_POOL_MAX ≤ Postgres max_connections` with headroom.
- **Workers** run in-process; add replicas to increase job throughput (BullMQ
  prevents double-processing). Concurrency is per-worker (see each worker file).
- **Rate limiting** is per-instance — enforce true limits at the gateway for
  multi-replica (see `SECURITY_AUDIT.md` MED-1).

## 4. Restart & graceful shutdown

On `SIGTERM`/`SIGINT`: readiness flips to 503 (LB drains) → HTTP stops accepting →
BullMQ workers finish in-flight jobs → PG/Redis close → exit (15s hard cap). Set
`terminationGracePeriodSeconds ≥ 20`. A rolling restart is therefore zero-downtime
behind a load balancer.

## 5. Recovery

| Failure | Behavior | Action |
|---------|----------|--------|
| Postgres blip | Pool logs a recoverable error (no crash); readiness fails | LB drains; recovers when DB returns |
| Redis blip | Auto-reconnect with backoff; `redis_unhealthy`/`flapping` alerts | Verify Redis; readiness gates traffic |
| Worker job failure | BullMQ retries with backoff → dead-letter | Inspect DLQ; fix; replay |
| Uncaught exception | Logged, then graceful shutdown | Orchestrator restarts the replica |
| Event dead-letters | `event_dead_letter` alert | Inspect subscriber; replay from event store |

Data recovery (DB/Redis backups) is covered in `BACKUP_RECOVERY.md` (Milestone 3).

## 6. Incident response

1. **Triage** — check `/monitoring` and `/api/metrics/alerts` for `status` and the
   active alert(s).
2. **Scope** — use `x-request-id` to trace failing requests in the logs; check the
   per-engine admin surfaces (`/event-inspector`, `/graph-explorer`, etc.).
3. **Contain** — if a subsystem is unhealthy, readiness already drains that replica;
   scale healthy replicas, or roll back the last deploy (see below).
4. **Fix & verify** — deploy the fix; confirm alerts clear and readiness is green.
5. **Post-mortem** — the event platform + memory retain the operational history;
   use Workspace Replay to reconstruct the timeline.

## 7. Runbooks

**Queue backlog / failures**
- `GET /api/metrics` → `queues`. High `waiting`? add worker replicas. High `failed`?
  the job is erroring — inspect the DLQ (`/event-inspector`, sync `DeadLetterService`),
  fix the root cause, then replay.

**Database saturation**
- `db.waiting` high or `slowQueries` climbing → raise `DB_POOL_MAX`, check the
  slow-query log (`🐢 Slow query …`), add/verify indexes (`SLOW_QUERY_MS` tunes the
  threshold).

**Redis unhealthy**
- Readiness fails automatically. Verify Redis reachability/memory; BullMQ + caches
  reconnect on recovery.

**A worker appears stopped**
- Its queue shows `active: 0` with rising `waiting`. Restart the replica; the
  repeatable cron re-registers (`prediction-proactive-scan`, `event-retention`).

**OAuth/auth failures spike**
- Check logs for `SECURITY`/auth `warn` lines and `[Socket] Rejected` entries.
  Rotate keys if compromise suspected (`SECURITY_AUDIT.md`).

## 8. Deployment rollback

Images are immutable + tagged — redeploy the previous tag. **Migrations are
forward-only**; to undo a schema change, ship a compensating forward migration or
restore from backup. Never auto-run down-migrations in production.

## 9. Alert handling matrix

See `MONITORING_REFERENCE.md#alert-catalogue` for each rule's trigger and handling.
Critical = page; warning = investigate within the hour; info = review at leisure.

---

*Part of Phase 12 — Production Hardening (Milestone 2).*
