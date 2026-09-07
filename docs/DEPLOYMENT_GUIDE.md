# Deployment Guide — FLOW OS

Production deployment of the FLOW OS backend. Covers Docker, configuration,
migrations, health probes, and graceful shutdown. See also
[`OPERATIONS_GUIDE.md`](OPERATIONS_GUIDE.md) and [`BACKUP_RECOVERY.md`](BACKUP_RECOVERY.md).

---

## 1. Requirements

- Node.js 20+ (the image is `node:20-slim`)
- PostgreSQL 14+ **with the `pgvector` extension**
- Redis 7+
- At least one AI key: `GEMINI_API_KEY` or `OPENAI_API_KEY`

## 2. Configuration

All config is environment-driven (12-factor). The server **refuses to start** if
required vars are missing or `JWT_SECRET` is weak (`validateEnv()` at boot).

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | ✅ | `redis://host:6379` |
| `JWT_SECRET` | ✅ | ≥ 32 chars — `openssl rand -hex 32` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | ✅ (one) | AI provider |
| `COMPOSIO_API_KEY` | ⬜ | Integrations |
| `NODE_ENV` | ⬜ | `production` blocks dev dashboards + admin surfaces (404) |
| `PORT` | ⬜ | Default 5000 |
| `CORS_ORIGIN` | ⬜ | Scope to your app domain in prod (empty = deny in prod) |
| `DB_POOL_MAX` | ⬜ | Default 20 |
| `SLOW_QUERY_MS` | ⬜ | Slow-query log threshold, default 500 |
| `REQUEST_TIMEOUT_MS` | ⬜ | Per-request timeout, default 30000 (SSE excluded) |
| `VAULT_ROOT` | ⬜ | Vault file location, default `~/FLOW-OS-VAULTS` |

## 3. Run with Docker Compose (self-contained)

```bash
cp .env.example .env            # set JWT_SECRET + an AI key
docker compose up --build       # brings up app + pgvector Postgres + Redis
```

Compose starts the app only after Postgres and Redis pass their healthchecks. The
app image runs as a **non-root** user and ships a Docker `HEALTHCHECK` hitting
`/health/live`.

### First-run migrations (once)

The schema + extensions must be applied before first use:

```bash
# Prisma tables (identity/org/graph/memory/etc.)
docker compose exec app npx prisma migrate deploy   # or: npx prisma db push

# Hand-crafted SQL migrations (apply in order; idempotent)
for f in scripts/migrate-*.sql; do
  docker compose exec -T postgres psql "$DATABASE_URL" -f "/app/$f"
done
# Enable pgvector if not already:  CREATE EXTENSION IF NOT EXISTS vector;
```

> Phase 7+ models use hand-crafted SQL migrations under `scripts/` and
> `prisma/migrations/` — apply with `psql -f`, then `npx prisma generate`. Do NOT
> run `prisma migrate dev` against production.

## 4. Run the app image against managed DB/Redis

```bash
docker build -t flow-os:latest .
docker run -p 5000:5000 --env-file .env flow-os:latest
```

Point `DATABASE_URL` / `REDIS_URL` at your managed Postgres (pgvector) and Redis
(e.g. RDS + ElastiCache).

## 5. Health probes

| Endpoint | Use | Behavior |
|----------|-----|----------|
| `GET /health/live` | Liveness | 200 while the process is up (no dependency checks) |
| `GET /health/ready` | Readiness | 200 only when Postgres + Redis are reachable; **503 during graceful shutdown** |
| `GET /health` | Full status | Component-by-component (postgres, redis, queue, websocket, embeddings) |
| `GET /metrics/infra` | Ops snapshot | Pool stats, redis status, BullMQ queue counts, memory, uptime |

**Kubernetes example:**

```yaml
livenessProbe:  { httpGet: { path: /health/live,  port: 5000 }, initialDelaySeconds: 20, periodSeconds: 15 }
readinessProbe: { httpGet: { path: /health/ready, port: 5000 }, initialDelaySeconds: 15, periodSeconds: 10 }
```

## 6. Graceful shutdown

On `SIGTERM`/`SIGINT` the process: (1) flips readiness to 503 so the LB drains it,
(2) stops accepting new HTTP connections, (3) closes BullMQ workers (in-flight jobs
finish), (4) closes the PG pool and Redis, then exits — with a 15s hard timeout as
a backstop. Set your orchestrator's `terminationGracePeriodSeconds` ≥ 20.

## 7. Scaling notes

- **Stateless HTTP** — scale horizontally behind a load balancer. Sessions/tokens
  are JWT; no server affinity required (WebSocket clients reconnect).
- **Workers** run in-process with the API. To scale workers independently, run
  additional replicas; BullMQ coordinates via Redis (jobs are not double-processed).
- **DB pool** — size `DB_POOL_MAX` per replica so `replicas × max ≤ Postgres
  max_connections` with headroom.
- **CORS** — set `CORS_ORIGIN` to your exact app origin in production.

## 8. Deployment rollback

Images are immutable and tagged; roll back by redeploying the previous tag. The
platform is backward-compatible within a release line, but **migrations are
forward-only** — never auto-run a down-migration in production. To roll back a
schema change, restore from backup (see `BACKUP_RECOVERY.md`) or ship a
compensating forward migration.

---

*Part of Phase 12 — Production Hardening (Milestone 1: Runtime & Deployment).*
