# FLOW OS — Release Checklist
**Document:** GOV-13  
**Status:** Mandatory  
**Applies to:** Every production deployment  
**Last updated:** 2026-07-18

---

## How to Use This Checklist

Print or copy this checklist for every production release. The release engineer checks every item. Items marked N/A must have a written reason. The CTO signs off on the completed checklist before the deployment command is issued.

This is not a "best effort" checklist. Every unchecked item is a risk that must be accepted explicitly, not ignored silently.

---

## Pre-Deployment (48 Hours Before)

### Code

- [ ] All changes are on the `main` branch, tagged with the release version.
- [ ] The release PR was approved by at least one peer reviewer (architectural changes: Head of Engineering).
- [ ] Design Review sign-off exists for all UI changes (GOV-03).
- [ ] No unresolved PR comments marked as blocking.
- [ ] `git log` confirms no unauthorized commits on the release branch.

### Tests

- [ ] Integration suite passes at 66/74 or better: `npm run test:integration` (against staging or a clean environment).
- [ ] No new test failures beyond the 8 known pre-existing failures.
- [ ] Relevant `scripts/validate-*.js` scripts pass for any affected engine.
- [ ] Frontend build succeeds: `cd flow-os-frontend && npm run build` (no errors, no unresolved imports).

### QA

- [ ] QA checklist (GOV-07) complete for all new features in this release.
- [ ] All S1 and S2 bugs are resolved. No open S1/S2 bugs in this release's scope.
- [ ] Pilot user(s) have used the feature without critical issues (if pilot stage was run).

### Database Migrations

- [ ] All database migrations are hand-crafted SQL (`scripts/migrate-*.sql`).
- [ ] Migrations are idempotent (safe to run twice).
- [ ] Migrations are additive-only (no dropped columns or removed enum values).
- [ ] A pre-migration database snapshot is taken (or PITR is confirmed active).
- [ ] The migration has been run on the staging database and verified.
- [ ] `npx prisma generate` has been run after any Prisma-managed schema changes.

### Dependency Audit

- [ ] No new npm packages added without a security review.
- [ ] `npm audit` run — no critical vulnerabilities outstanding.
- [ ] All environment variables for new features are documented in `.env.example` and `CLAUDE.md §11`.

---

## Pre-Deployment (Day Of)

### Environment Configuration

- [ ] Production environment variables are set:
  - [ ] `DATABASE_URL` — production PostgreSQL
  - [ ] `REDIS_URL` — production Redis
  - [ ] `JWT_SECRET` — ≥32 chars, not a known insecure default
  - [ ] `GEMINI_API_KEY` — valid and tested
  - [ ] `NODE_ENV=production`
  - [ ] `WS_AUTH_REQUIRED=true`
  - [ ] `CORS_ORIGIN` — scoped to production domain (not `*`)
  - [ ] `VAULT_ROOT` — configured for production file storage
  - [ ] `FRONTEND_URL` — production URL for OAuth callbacks
  - [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — if Communication/Meeting capability is active
  - [ ] `GITHUB_TOKEN` — if Engineering capability is active
- [ ] No development-only env vars (`LOG_LEVEL=debug`, `SIM_WORKSPACE_ID`, etc.) in production config.

### Infrastructure

- [ ] PostgreSQL is healthy (connection pool responds, no replication lag if replica is used).
- [ ] Redis is healthy (`PING` returns `PONG`).
- [ ] Docker image is built and pushed (if containerized deployment).
- [ ] Health check endpoint responds: `curl http://localhost:5001/health/ready` returns 200.
- [ ] Previous release tag is identified for rollback.
- [ ] Rollback command is prepared and verified (Docker image tag or git revert SHA).

### Observability

- [ ] `GET /api/metrics` responds correctly (with ADMIN JWT or `METRICS_TOKEN`).
- [ ] `GET /metrics/infra` responds correctly.
- [ ] Log pipeline is active (logs shipping to the log aggregator).
- [ ] Alerting rules are configured (see `docs/OBSERVABILITY_GUIDE.md`).

---

## Deployment

### Order of Operations

1. [ ] Take database snapshot (or confirm PITR is active).
2. [ ] Run database migrations: `psql -f scripts/migrate-{feature}.sql $DATABASE_URL`
3. [ ] Run `npx prisma generate` if schema changed.
4. [ ] Deploy the new application version.
5. [ ] Wait for health check to pass: `GET /health/ready` returns 200.
6. [ ] Confirm old instances are draining gracefully (no 5xx spikes during rollover).

### Zero-Downtime Considerations

- [ ] If using rolling deployment: health check readiness probe is active (`/health/ready` → 503 during startup until DB + Redis are confirmed connected).
- [ ] Graceful shutdown is wired (`SIGTERM` → drain HTTP → workers → pool → Redis).
- [ ] In-flight requests are allowed to complete before process exits (15s hard timeout).

---

## Post-Deployment (First 15 Minutes)

### Smoke Tests

Run manually after deployment:

- [ ] `GET /health` → 200
- [ ] `GET /health/ready` → 200
- [ ] `POST /api/auth/login` → valid JWT returned
- [ ] `GET /api/workspace/snapshot` (with JWT + workspace-id) → 200 or `{status:'building'}`
- [ ] `GET /` in browser → Home page loads (not a 500 or blank screen)
- [ ] Brain `POST /api/brain/copilot` → response received (streaming or static)
- [ ] WebSocket connection established from browser (LiveFeedPanel shows connection)

### Error Monitoring

- [ ] No new 5xx errors in the server logs for the first 5 minutes.
- [ ] No unhandledRejection or uncaughtException events.
- [ ] Memory and CPU in normal range (`GET /metrics/infra`).
- [ ] No slow-query log entries from the new release's queries.

### Functional Verification

- [ ] At least one new feature from this release is exercised manually.
- [ ] Governance pipeline verified (attempt a connector action and confirm audit record is created).
- [ ] Notifications arrive via WebSocket (trigger an action and confirm `NOTIFICATION_CREATED` event in the live feed).

---

## Post-Deployment (First 24 Hours)

- [ ] Integration suite run against production (read-only tests only — no state-mutating tests against live production data).
- [ ] Pilot user(s) notified of new features and asked for feedback.
- [ ] `docs/INCIDENT_LOG.md` checked for any new incidents triggered by the release.
- [ ] Metrics reviewed at the end of day 1: North Star, error rate, fallback rate.

---

## Rollback Decision

Roll back immediately (do not wait for diagnosis) if any of the following occur within 30 minutes of deployment:

- Error rate exceeds 1% of requests (sustained, not a transient spike)
- Any S1 security issue is confirmed
- Database migration has caused data corruption or loss
- Core product flows (auth, brain, execution, WebSocket) are non-functional

### Rollback Command

```bash
# Docker rollback
docker pull flow-os:{previous-tag}
docker service update --image flow-os:{previous-tag} flow-os-app

# Database rollback (if migration is reversible)
psql -f scripts/rollback-{migration-name}.sql $DATABASE_URL

# If migration is not reversible
# Restore from pre-migration snapshot
# Follow BACKUP_RECOVERY.md procedure
```

Root cause analysis must be completed before the next deployment attempt. Document in `INCIDENT_LOG.md`.

---

## Sign-Off

```
Release version: _______________
Release date:    _______________
Release engineer: _______________
CTO approval:    _______________

Pre-deployment checklist:  [ ] Complete
Deployment verified:        [ ] Complete
Post-deployment (15 min):  [ ] Complete

Notes:
_______________________________________________
_______________________________________________
```
