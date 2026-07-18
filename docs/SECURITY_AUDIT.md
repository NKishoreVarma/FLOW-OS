# Security Audit — FLOW OS

> Phase 12 Milestone 2, Part 1. A complete review of the FLOW OS backend against
> 25 security domains. Findings are classified Critical / High / Medium / Low with
> Risk, Impact, Affected files, Mitigation, and Status.

**Audit date:** 2026-07-11 · **Scope:** `src/**` backend · **Reviewer:** Platform engineering

---

## Scorecard

| # | Domain | Rating | Notes |
|---|--------|--------|-------|
| 1 | JWT authentication | 🟢 Strong | Enforced, no hardcoded fallback, ≥32-char secret validated at boot |
| 2 | OAuth credentials | 🟢 Strong | Encrypted at rest (`ConnectorCredentialStore`), signed OAuth state (CSRF), PKCE |
| 3 | RBAC | 🟢 Strong | Governance evaluator (role×action matrix, policies); OWNER/ADMIN gates |
| 4 | Workspace isolation | 🟢 Strong | `tenantIsolation` verifies workspace-id belongs to the JWT's org (DB) |
| 5 | Tenant isolation | 🟢 Strong | Every engine read is `workspace_id`-scoped; no cross-tenant query paths |
| 6 | Graph access | 🟢 Strong | `/api/graph` + Explorer require JWT + workspace-id; queries workspace-scoped |
| 7 | Replay permissions | 🟢 Strong | `/api/replay` JWT + workspace-id; replay-to-subscribers gated ADMIN |
| 8 | Simulation permissions | 🟢 Strong | `/api/simulation` JWT + workspace-id; reads only tenant graph/events |
| 9 | Prediction permissions | 🟢 Strong | `/api/predictions` JWT + workspace-id; persists tenant-scoped |
| 10 | Event platform | 🟢 Strong | Store/replay/search require `workspace_id`; dedup + idempotency |
| 11 | **WebSocket auth** | 🟡→🟢 **Fixed** | Was unauthenticated (HIGH); now JWT + org-ownership verified |
| 12 | File uploads | 🟢 N/A | No HTTP file-upload endpoints; only email MIME parsing internally |
| 13 | Environment variables | 🟢 Strong | `validateEnv()` gates boot; required vars + JWT quality checks |
| 14 | Secrets | 🟢 Strong | Env-driven; connector creds encrypted; no secrets in repo |
| 15 | Prompt injection | 🟢 Mitigated | Parser strips injection → `[STRIPPED INJECTION]`; privacy gate |
| 16 | SSRF | 🟢 Strong | Crawler resolves DNS, blocks private/metadata IPs, http/https only |
| 17 | SQL injection | 🟢 Strong | Parameterized queries throughout; dynamic filters use `$n` placeholders |
| 18 | XSS | 🟢 Mitigated | Admin pages `esc()` output + SVG `textContent`; surfaces 404 in prod |
| 19 | CSRF | 🟢 N/A | JWT in `Authorization` header (no cookies) → no ambient-credential CSRF |
| 20 | Command injection | 🟢 N/A | No `child_process`/`exec`/`spawn`; only regex/Redis `.exec()` |
| 21 | Path traversal | 🟢 Mitigated | Vault channel sanitized; workspaceId is DB-validated (see LOW-1) |
| 22 | Rate limiting | 🟡 Partial | Per-tenant sliding window, applied globally — but per-instance (see MED-1) |
| 23 | CORS | 🟡 Partial | `false` in prod unless `CORS_ORIGIN` set; `*` in dev (see MED-2) |
| 24 | Security headers | 🟢 Strong | `nosniff`, `X-Frame-Options: DENY`, referrer + permissions policy |
| 25 | Sensitive logging | 🟢 Mitigated | No token/secret logging found; redaction added in structured logging |

**Overall posture: STRONG.** One High finding (WebSocket auth) is **fixed** in this
milestone. Remaining items are Medium/Low and either mitigated by design or
documented as accepted with a recommended production control.

---

## Findings

### HIGH-1 — WebSocket connections were unauthenticated  ✅ FIXED
- **Risk:** Any client could open `ws://host?workspaceId=<any-id>` and receive that
  workspace's real-time stream (events, incidents, predictions, memory) with no
  credential — a workspace-isolation bypass on the WS channel.
- **Impact:** Cross-tenant data exposure over WebSocket.
- **Affected files:** `src/services/socketService.js`
- **Mitigation (implemented):** `authenticateSocket()` now requires a JWT
  (`?token=` or `Authorization: Bearer`) whose `orgId` owns the requested
  workspace (verified against the DB). Rejections close with 1008. Enforced in
  production / when `WS_AUTH_REQUIRED=true`; dev allows unauthenticated with a loud
  warning so local/frontend clients keep working until they pass a token.
- **Status:** **Mitigated / Fixed.** Frontend must append `&token=<jwt>` to the WS
  URL before enabling `WS_AUTH_REQUIRED` in staging.

### MED-1 — Rate limiting is per-instance (in-memory)
- **Risk:** The sliding-window counter lives in process memory; behind N replicas a
  caller effectively gets N × the limit.
- **Impact:** Weakened abuse/DoS protection at horizontal scale.
- **Affected files:** `src/core/middleware/rateLimiter.js`
- **Mitigation:** Enforce true limits at the API gateway/load balancer, or back the
  limiter with Redis (`INCR`+`EXPIRE`) for a shared window. Per-tenant keying is
  already correct.
- **Status:** Open (accepted for single-instance; gateway control recommended for
  multi-replica). Tracked as TD-10.

### MED-2 — CORS wildcard in development
- **Risk:** `CORS_ORIGIN` unset defaults to `*` in dev (browsers can call the API
  from any origin).
- **Impact:** None in production (defaults to `false`); dev convenience only.
- **Affected files:** `src/server.js`
- **Mitigation:** Always set `CORS_ORIGIN` to the exact app origin in every
  deployed environment; documented in `DEPLOYMENT_GUIDE.md`.
- **Status:** Mitigated (production-safe by default). Tracked as TD-04.

### LOW-1 — workspaceId not sanitized in the vault filesystem path
- **Risk:** `saveToVault` builds `workspace_${workspaceId}` into a filesystem path.
  The channel segment is sanitized, but the workspaceId segment is not.
- **Impact:** Negligible — `workspaceId` is validated by `tenantIsolation` against
  the DB before any handler runs, so a traversal payload never reaches this code.
- **Affected files:** `src/services/vaultService.js`
- **Mitigation (recommended):** Defense-in-depth — apply the same
  `replace(/[^a-zA-Z0-9_-]/g,'_')` to the workspaceId segment.
- **Status:** Open (low; belt-and-suspenders).

### LOW-2 — Random embedding fallback in non-production
- **Risk:** When no AI key is present in dev/test, a random normalized vector is
  used for embeddings.
- **Impact:** Pollutes the vector index with noise in dev only; disabled when
  `NODE_ENV=production`.
- **Affected files:** `vectorStoreService.js`, `retrievalService.js`
- **Mitigation:** Already gated off in production.
- **Status:** Accepted (dev only). Tracked as TD-06.

### INFO — Dev/admin surfaces
- `/dev-dashboard`, `/event-inspector`, `/graph-explorer`, `/replay-player`,
  `/simulation-workspace`, `/prediction-workspace`, `/monitoring` all return **404
  in production** and require an OWNER/ADMIN JWT (+ workspace-id) for their APIs.
- **Status:** Mitigated by design.

---

## Controls verified (no action needed)

- **Parameterized SQL** everywhere; dynamic `WHERE`/`LIMIT` use `$n` placeholders —
  no string interpolation of untrusted values into SQL.
- **No command execution** — no `child_process`, `exec`, or `spawn`.
- **SSRF** — `crawlerService` resolves the hostname, rejects private/loopback/
  link-local/metadata IPs and non-http(s) protocols before fetching.
- **OAuth state** is HMAC-signed with a TTL (CSRF protection on the OAuth flow);
  PKCE supported.
- **JWT** — no hardcoded fallback secret; `validateEnv()` rejects short/known-weak
  secrets and missing required vars at boot.
- **Connector credentials** are encrypted at rest and workspace-scoped.

## Recommended production controls

1. Set `WS_AUTH_REQUIRED=true` and `CORS_ORIGIN=<app-origin>` in every environment.
2. Enforce rate limits at the gateway (or Redis-back the limiter) for multi-replica.
3. Rotate `JWT_SECRET` and connector encryption keys on a schedule.
4. Ship structured JSON logs (with redaction) to a SIEM; alert on WS/OAuth/auth failures.

---

*Part of Phase 12 — Production Hardening (Milestone 2, Part 1).*
