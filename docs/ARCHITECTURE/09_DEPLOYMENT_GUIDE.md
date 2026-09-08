# FLOW OS — Deployment Guide
**Architecture Version:** 1.0  
**Status:** FROZEN  
**Full reference:** `docs/DEPLOYMENT_GUIDE.md`, `docs/BACKUP_RECOVERY.md`

---

## 1. Prerequisites

| Requirement | Version |
|------------|---------|
| Node.js | 20+ (ESM required) |
| PostgreSQL | 16 with `pgvector` extension |
| Redis | 7+ (AOF recommended for durability) |
| Docker | 24+ (optional, recommended for production) |

---

## 2. Environment Variables

### Required (server exits on missing)
```bash
DATABASE_URL=postgresql://user:pass@host:5432/flowos
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=<min 32 chars — generate: openssl rand -hex 32>
COMPOSIO_API_KEY=<composio key>
GEMINI_API_KEY=<google ai key>   # or OPENAI_API_KEY — at least one required
```

### Optional (warn if absent)
```bash
PORT=5001
NODE_ENV=production              # Blocks /dev-dashboard, /monitoring, /event-inspector, /graph-explorer, /replay-player, /simulation-workspace, /prediction-workspace
VAULT_ROOT=/path/to/vaults      # Default: ~/FLOW-OS-VAULTS
FRONTEND_URL=http://localhost:3000

# Gmail / Google Calendar OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Aliases: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET

# GitHub
GITHUB_TOKEN=                   # scopes: repo, read:user
GITHUB_API_URL=                 # Enterprise: https://github.example.com/api/v3

# Additional AI providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# AI Platform
AI_DEFAULT_PROVIDER=gemini
AI_FALLBACK_PROVIDER=openai
AI_ROUTING_STRATEGY=QUALITY_FIRST
AI_RPM_LIGHT=60
AI_RPM_STANDARD=30
AI_RPM_HEAVY=10

# Security
WS_AUTH_REQUIRED=true           # MUST be true in production
CORS_ORIGIN=https://app.yourcompany.com

# Observability
LOG_FORMAT=json                 # Structured logging for pipelines
SLOW_QUERY_MS=500               # Threshold for slow query log
REQUEST_TIMEOUT_MS=30000        # Per-request timeout (SSE excluded)
COUNCIL_REQUEST_TIMEOUT_MS=120000  # Extended for council paths
METRICS_TOKEN=<secret>          # Token for /api/metrics (or use ADMIN JWT)

# Workers
PREDICTION_CRON=0 */6 * * *    # Default: every 6 hours
SIM_TICK_MS=300000              # Living Workspace Simulator tick interval

# Workspace Intelligence Cache
WIC_CRON_MS=300000              # Refresh cron interval (default: 5min)
WIC_DEBOUNCE_MS=10000           # Debounce on event-triggered refresh (default: 10s)
WIC_TTL_SECONDS=3600            # Redis TTL for cached snapshots
```

---

## 3. Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment
cp .env.example .env
# Edit .env with your values

# 3. Start PostgreSQL and Redis (Docker)
docker run -d --name flow-postgres \
  -e POSTGRES_DB=flowos -e POSTGRES_USER=flow -e POSTGRES_PASSWORD=flow \
  -p 5432:5432 pgvector/pgvector:pg16

docker run -d --name flow-redis \
  -p 6379:6379 redis:7-alpine

# 4. Run Prisma migrations
npx prisma migrate dev
npx prisma generate

# 5. Apply raw SQL migrations (in order)
psql $DATABASE_URL -f scripts/migrate-governance-5-3-b.sql
psql $DATABASE_URL -f scripts/migrate-event-platform-v11-0.sql
psql $DATABASE_URL -f scripts/migrate-graph-engine-v11-1.sql
psql $DATABASE_URL -f scripts/migrate-integration-permissions-v13.sql
psql $DATABASE_URL -f scripts/migrate-execution-engine-v14.sql
psql $DATABASE_URL -f scripts/migrate-orchestrator.sql
psql $DATABASE_URL -f scripts/migrate-simulation-v11-4.sql
psql $DATABASE_URL -f scripts/migrate-predictions-v11-5.sql
npx prisma generate   # Regenerate after enum additions

# 6. Start the server (includes all BullMQ workers)
npm run dev           # Watch mode
# OR
npm run start         # Production mode

# 7. Start the frontend
cd flow-os-frontend
npm install
npm run dev           # Runs at http://localhost:3000 (proxied to :5001)
```

---

## 4. Docker Compose (Recommended)

```bash
# Build and start all services
docker compose up --build

# Services started:
# - app (flow-os backend) → localhost:5001
# - postgres (pgvector pg16) → localhost:5432
# - redis (redis:7) → localhost:6379
```

### `docker-compose.yml` overview
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flow -d flowos"]
      interval: 5s, timeout: 5s, retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  app:
    build: .   # Multi-stage Dockerfile, non-root user
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    ports: ["5001:5001"]
    environment:
      DATABASE_URL: postgresql://flow:flow@postgres:5432/flowos
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
      WS_AUTH_REQUIRED: "true"
```

### `Dockerfile` overview
```dockerfile
FROM node:20-slim AS builder
# Install deps, generate Prisma client

FROM node:20-slim AS runner
# Copy built artifacts, non-root user (UID 1001)
# HEALTHCHECK: curl /health/live every 30s
```

---

## 5. Health Probes

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /health` | Basic alive check | None |
| `GET /api/health` | Extended health (pg + redis) | None |
| `GET /health/live` | Kubernetes liveness | None |
| `GET /health/ready` | Kubernetes readiness (pg+redis, 503 during shutdown) | None |
| `GET /metrics/infra` | Infrastructure metrics (pool, redis, queues, memory) | None |

---

## 6. Production Checklist

Before going live:

```
Security:
  [ ] WS_AUTH_REQUIRED=true
  [ ] CORS_ORIGIN set to known domains (not *)
  [ ] JWT_SECRET ≥ 32 chars, cryptographically random
  [ ] NODE_ENV=production (blocks dev endpoints)
  [ ] METRICS_TOKEN set (or use ADMIN JWT for /api/metrics)
  [ ] Rate limiting at gateway layer (not just in-process)

Database:
  [ ] All SQL migrations applied in order
  [ ] pgvector extension enabled: CREATE EXTENSION IF NOT EXISTS vector
  [ ] Connection pool sized for expected load (default: 10 connections)
  [ ] SLOW_QUERY_MS configured

Backups:
  [ ] pg_dump scheduled (daily minimum)
  [ ] PostgreSQL PITR (WAL archiving) configured
  [ ] Redis AOF enabled (appendonly yes)
  [ ] Vault directory backed up ($VAULT_ROOT)

Observability:
  [ ] LOG_FORMAT=json (for log aggregation)
  [ ] /api/metrics endpoint monitored
  [ ] Alert rules configured (see MONITORING_REFERENCE.md)
  [ ] Slow query log shipping configured

Workers:
  [ ] PREDICTION_CRON set appropriately
  [ ] BullMQ dashboard or monitoring for job failures
```

---

## 7. Graceful Shutdown

Handled by `src/core/lifecycle/gracefulShutdown.js`:
```
SIGTERM / SIGINT
  → stop accepting new HTTP connections
  → drain BullMQ workers (wait for in-flight jobs)
  → close pg.Pool
  → close Redis connection
  → 15-second hard timeout (process.exit(1) if exceeded)

Also handles:
  → unhandledRejection → log + alert (does not crash in production)
  → uncaughtException → log + alert + graceful shutdown
```

Kubernetes: set `terminationGracePeriodSeconds: 30` to allow shutdown to complete before SIGKILL.

---

## 8. Scaling Considerations

### Single Instance (Current Architecture)
FLOW is designed for single-instance deployment. Components that prevent horizontal scaling without changes:
- In-memory stores (vectorDatabase, incidentDatabase, etc.) — TD-01
- WebSocket connections are instance-local
- Rate limiter is in-process (Redis-backed falls back to in-memory)

### Scaling Path
1. **Stateless HTTP:** app server scales horizontally if in-memory stores are externalized
2. **WebSocket:** requires sticky sessions or a shared pub/sub layer (Redis pub/sub)
3. **Rate limiting:** already Redis-backed — works correctly across instances
4. **Read replicas:** `/api/metrics` runs 5 queries — separate read-replica recommended under high load
5. **AI calls:** AI Platform is stateless per-request — scales with HTTP

### BullMQ Workers
Workers run in the same process as the API server. To separate:
```bash
# API server only (no workers)
WORKERS_ENABLED=false npm start

# Workers only (no HTTP)
node src/workers/standalone.js
```

---

## 9. Frontend Deployment

```bash
# Build the React app
cd flow-os-frontend
npm run build
# Output: flow-os-frontend/dist/

# Serve with any static file server
# Vite proxy config (vite.config.js) is dev-only
# Production: configure your reverse proxy to:
#   - Serve /dist as static
#   - Forward /api/* to backend :5001
#   - Forward /health to backend :5001
#   - Upgrade WebSocket connections (ws://) to backend :5001
```

---

## 10. Backup & Recovery

Full reference: `docs/BACKUP_RECOVERY.md`

### PostgreSQL
```bash
# Daily pg_dump
pg_dump -Fc $DATABASE_URL > backup_$(date +%Y%m%d).dump

# PITR: enable WAL archiving
archive_mode = on
archive_command = 'aws s3 cp %p s3://backups/wal/%f'
```

### Redis
- AOF enabled (`appendonly yes`) gives per-command durability
- RDB snapshots as additional safety net
- If Redis lost: all BullMQ queues are durable (re-queue from backup); rate limit counters reset (acceptable)

### Recovery priority
1. **PostgreSQL** — primary data store, most critical
2. **Redis** — queue state; BullMQ jobs can be re-queued from logs if needed
3. **Vault files** — filesystem backup (rsync or S3 sync)
4. **In-memory stores** — not recoverable by design; rebuild from postgres on restart

**RPO (Recovery Point Objective):** 1 hour (with PITR + daily dumps)  
**RTO (Recovery Time Objective):** < 30 minutes (single-region; point-in-time restore from WAL)
