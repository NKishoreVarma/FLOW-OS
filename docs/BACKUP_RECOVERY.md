# Backup & Recovery — FLOW OS

> Phase 12 Milestone 3, Part 10. How to back up, restore, and recover FLOW OS.
> The durable state of record is **PostgreSQL**; Redis and the filesystem vault are
> secondary and largely reconstructable.

---

## 1. What holds state

| Store | Contents | Criticality | Recovery |
|-------|----------|-------------|----------|
| **PostgreSQL** | Identity/org, connectors + encrypted creds, event log (`flow_events`), operational graph, memory, predictions/simulations, audit, sync state | **Critical** | Restore from backup / PITR |
| **Redis** | BullMQ job state, social cache, correlation windows, replay-protection keys, sequence counters | Important (transient) | Rebuilds; AOF for durable queues |
| **Filesystem vault** | Markdown intel + daily summaries (`VAULT_ROOT`) | Low | Reconstructable from the event log |

Everything intelligence-facing is derived from `flow_events` + the Prisma tables,
so a Postgres backup is the backbone of recovery.

## 2. PostgreSQL backup

### Logical (portable) — recommended baseline
```bash
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" > flow_$(date +%F).dump
# restore:
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" flow_YYYY-MM-DD.dump
```
Schedule nightly (cron/managed snapshot). Keep ≥ 14 daily + 8 weekly copies
off-host (S3/GCS with lifecycle + encryption).

### Physical + PITR (for low RPO)
Enable continuous archiving (`archive_mode=on`, `archive_command` → object store)
and take a base backup (`pg_basebackup`). This gives **point-in-time recovery** —
replay WAL to any second. Managed Postgres (RDS/Cloud SQL) provides this via
automated backups + PITR; enable it and set the retention window.

### After any restore
1. `CREATE EXTENSION IF NOT EXISTS vector;` (if a fresh cluster).
2. Apply pending migrations: Prisma + `scripts/migrate-*.sql`.
3. `npx prisma generate` if the client is stale.
4. Verify `GET /health/ready` and `GET /api/metrics`.

## 3. Redis recovery

- **Queues (BullMQ):** enable AOF (`--appendonly yes`, already set in
  `docker-compose.yml`) so in-flight jobs survive a Redis restart. On total loss,
  queues restart empty — the platform re-derives: webhooks are idempotent, syncs
  resume from their cursor, the prediction/retention crons re-register on boot.
- **Caches (social cache, correlation windows, replay-protection):** all TTL-bound
  and non-authoritative — they simply repopulate. No restore needed.
- **Sequence/replay-protection keys:** loss can at worst re-admit a duplicate
  webhook within the window; the DB `UNIQUE (workspace, connector, delivery_id)`
  constraint still prevents double-storage.

## 4. Disaster recovery (region/host loss)

1. **Provision** a new host/cluster + Postgres (pgvector) + Redis.
2. **Restore Postgres** from the latest backup or PITR to the target time.
3. **Deploy** the app image (previous known-good tag), point `DATABASE_URL` /
   `REDIS_URL` at the new stores; set `JWT_SECRET` (same value — else all tokens
   invalidate) and connector encryption keys.
4. **Migrate** if the restore predates a schema change.
5. **Cut over** DNS/LB once `/health/ready` is green; the crons and workers
   re-arm automatically at boot.
6. **Backfill** (optional) any events missed during the outage by re-syncing
   connectors (idempotent) — the event platform dedups.

**Targets:** RPO = your backup/PITR cadence (minutes with WAL archiving, up to 24h
with nightly dumps). RTO = provision + restore time (typically < 1h for managed DB
PITR).

## 5. Worker recovery

- BullMQ workers are **idempotent and retryable**: failed jobs retry with
  exponential backoff, then land in a dead-letter state for inspection/replay.
- On a crash/restart, unacked jobs are redelivered (Redis-backed); repeatable crons
  (`prediction-proactive-scan`, `event-retention-daily`, daily summary) re-register
  on boot via idempotent `jobId`s.
- A stuck worker shows as `active: 0` with rising `waiting` in `/api/metrics` —
  restart the replica.

## 6. Deployment rollback

- Images are immutable and tagged → redeploy the previous tag; graceful shutdown
  drains the old replica first (zero-downtime behind a LB).
- **Migrations are forward-only.** To undo a schema change: ship a compensating
  forward migration, or restore from backup to before the migration. Never
  auto-run down-migrations in production.

## 7. Backup verification (do this)

A backup you haven't restored is a hypothesis. Periodically restore the latest dump
into a scratch database and run `GET /health/ready` + a smoke query. Automate it in
CI/staging.

---

*Part of Phase 12 — Production Hardening (Milestone 3).*
