# FLOW OS — Security Standard
**Document:** GOV-08  
**Status:** Mandatory  
**Applies to:** All code, configuration, and infrastructure  
**Last updated:** 2026-07-18

---

## Overview

FLOW is a multi-tenant enterprise system that holds organizational communications, engineering artifacts, and decision history. A security failure has regulatory, contractual, and reputational consequences.

This document is the reference for every security decision. It is not a checklist — it is the standard.

---

## 1. Authentication

### JWT

- JWTs are issued at login with a 24-hour expiry.
- `JWT_SECRET` must be ≥32 characters. Startup rejects known insecure defaults.
- JWTs are sent only in the `Authorization: Bearer {token}` header. Never in query strings for HTTP API calls.
- WebSocket connections send the token as `?token={jwt}` in the upgrade URL — the only query-string exception, required by the WS protocol.
- JWT secrets are never logged, never returned in API responses, never hardcoded.
- Key rotation: when `JWT_SECRET` is rotated, all issued tokens are invalidated immediately. There is no grace period. Coordinate with active sessions before rotating.

### Authentication Middleware

All protected routes use `authenticate.js`. It verifies the JWT, attaches `req.user`, and rejects with 401 on failure. Never call `authenticate.js` as a conditional — it either applies to a route or it does not.

### Session Invalidation

FLOW uses stateless JWTs with no server-side session store. Token revocation is not supported at the token level. Log out is client-side (clear localStorage). For security incidents requiring immediate invalidation, rotate `JWT_SECRET`.

---

## 2. Authorization

### Role Hierarchy

```
OWNER > ADMIN > MEMBER > VIEWER > API_CLIENT
```

Higher roles inherit all permissions of lower roles. There is no role bypass.

### RBAC Middleware

Use `authorize.js` for route-level role guards. Attach after `authenticate.js` and `tenantIsolation.js`.

```js
router.delete('/policies/:id', authenticate, tenantIsolation, authorize('OWNER'), handler);
```

### Governance Layer

For connector actions, the governance layer (`evaluateWithPolicies()`) is the authority. It evaluates:
1. DB-configured policies (DENY wins if any policy denies)
2. Default role-action matrix (fallback)

The governance layer's decision cannot be overridden by any middleware, route handler, or service. A `DENY` result throws an `AuthorizationError`. A `REQUIRE_APPROVAL` result halts execution, creates a `PendingApproval`, and returns `403` with `{ approvalId }`.

---

## 3. Tenant Isolation

This is the most critical security invariant in FLOW. Every failure of tenant isolation is a P0 security incident.

### HTTP Layer

`tenantIsolation.js` middleware:
1. Reads `workspace-id` header.
2. Queries the DB to confirm this workspace belongs to `req.user.orgId`.
3. Returns 400 if the header is absent, 403 if the workspace does not belong to the user's org.
4. Attaches `req.tenantId` and `req.workspace` on success.

**Every route that reads or writes workspace data** must have `tenantIsolation` in its middleware chain. No exceptions.

### Database Layer

Every SQL query on workspace-scoped tables includes `WHERE workspace_id = $N`. The workspace_id value comes from `req.tenantId` (set by middleware) — never from the request body or query string directly.

```sql
-- Correct
SELECT * FROM workspace_intel_chunks WHERE workspace_id = $1 AND ...

-- Forbidden — workspace_id from user-controlled input without middleware validation
SELECT * FROM workspace_intel_chunks WHERE workspace_id = $req.body.workspaceId
```

### WebSocket Layer

`socketService.authenticateSocket()` verifies JWT + org-owns-workspace before allowing a client into a workspace channel. In production (`WS_AUTH_REQUIRED=true`), unauthenticated WebSocket connections are rejected with a close frame. In development, they log a warning (never silently admitted in production).

### Event Platform

Every event query includes `workspace_id`. The event bus subscriber receives the full `ctx` including `workspaceId` — it never infers workspace from event content.

---

## 4. Secrets Management

### Environment Variables

Required secrets:
```
JWT_SECRET          Minimum 32 chars. Generate: openssl rand -hex 32.
DATABASE_URL        PostgreSQL connection string with credentials.
REDIS_URL           Redis connection string.
COMPOSIO_API_KEY    Composio integration key.
GEMINI_API_KEY      Google AI key.
GOOGLE_CLIENT_ID    OAuth client for Gmail / Calendar.
GOOGLE_CLIENT_SECRET
GITHUB_TOKEN        GitHub PAT (repo, read:user scopes).
```

Rules:
- Never commit `.env` to git.
- Never log secret values (logger.js applies redaction, but the rule applies to manual log statements).
- Never return secrets in API responses (not even hashed or masked forms).
- Never hardcode fallback values for required secrets. `validateEnv.js` exits the process if required secrets are missing.
- Secrets rotation: update `.env`, restart the process. No hot reload for secrets.

### OAuth Credentials

OAuth tokens (Gmail, Google Calendar, GitHub PAT) are stored in `connector_credentials` table (PostgreSQL, encrypted at rest in production via filesystem encryption or column encryption). They are retrieved only by the adapter that owns them. They are never returned in API responses.

### API Keys

Workspace API keys (used by external systems to call FLOW) are stored hashed (`bcryptjs`). The raw key is shown once on creation. It cannot be recovered — only revoked and regenerated.

---

## 5. SQL Injection Prevention

FLOW uses parameterized queries exclusively. No string interpolation in SQL. This is an absolute rule.

```js
// Correct
const result = await pool.query(
  'SELECT * FROM flow_events WHERE workspace_id = $1 AND type = $2',
  [workspaceId, type]
);

// Absolutely forbidden
const result = await pool.query(
  `SELECT * FROM flow_events WHERE workspace_id = '${workspaceId}'`
);
```

Prisma (used for identity tables) parameterizes automatically. Raw Prisma `$queryRaw` calls must still use template-literal syntax (which Prisma parameterizes), not string concatenation.

---

## 6. XSS Prevention

### Backend

FLOW's API returns JSON. HTML is never generated on the server (no server-side templates). SQL data that reaches the API is returned as JSON strings — the browser handles escaping.

### Frontend

- React escapes text content by default. Never use `dangerouslySetInnerHTML` for user-generated content or AI output.
- AI responses are rendered as React elements (Markdown parser → React nodes), not injected as raw HTML.
- `parserService.js` on the backend strips prompt injection from ingested text (`[STRIPPED INJECTION]`).
- No `eval()`, `new Function()`, or dynamic `<script>` tags in frontend code.

---

## 7. SSRF Prevention

FLOW's crawler service allows fetching arbitrary URLs (for knowledge ingestion). All outbound URL fetches go through `crawlerService.js`, which:
- Resolves the hostname to an IP address and rejects private ranges (10.x, 172.16–31.x, 192.168.x, 127.x, ::1, link-local).
- Rejects non-HTTP/HTTPS schemes.
- Enforces a response size limit.
- Times out after a configurable threshold.

Never call `fetch(userSuppliedUrl)` directly in any service. Route all external HTTP calls through `crawlerService.fetchUrl()`.

---

## 8. Command Injection Prevention

FLOW does not execute shell commands with user-supplied input. If a future feature requires shell execution:
- Use `childProcess.execFile()` (not `exec()` with a string).
- Pass arguments as an array, never interpolated into a string.
- Validate and whitelist all input before passing it to the command.

---

## 9. Privacy Gate

The privacy gate is an architectural invariant, not a feature.

Content classified as `PRIVATE_PERSONAL` by the privacy gate:
- Is discarded immediately (no DB write, no vault write, no embedding).
- Causes a `PRIVACY_SHIELD_TRIGGERED` WebSocket event with no payload text.
- Is never logged.

The privacy gate cannot be disabled by:
- A workspace setting
- A governance policy
- An environment variable
- A feature flag
- Any code path

Any request to add a configuration option that disables or bypasses the privacy gate must be declined.

---

## 10. Audit Logging

Every connector action is persisted to the `AuditLog` table (PostgreSQL, durable) with:
- `workspaceId` — tenant isolation
- `userId` — who triggered it
- `connectorId`, `actionType` — what happened
- `outcome` — success/failure/denied/approval_required
- `approvalId` — if approval was required
- `policyId` — which policy triggered the outcome
- `createdAt` — when

Audit logs are never deleted. They may be archived, but the archive must be durable and queryable.

`GET /api/connectors/audit` reads from PostgreSQL (not the in-memory ring buffer). The in-memory buffer is for real-time WebSocket delivery only.

---

## 11. Dev Dashboard Security

The dev dashboard (`/dev-dashboard`, `/api/dev/*`) is:
- 404 in `NODE_ENV=production`.
- JWT-protected in all other environments (OWNER or ADMIN role required).
- Never served with real user data.

The dev dashboard is a diagnostic tool. It does not receive production data. It does not connect to production databases.

---

## 12. CORS

Current state: `origin: '*'` (Tech Debt TD-04). This must be scoped before production deployment.

Required before production:
```js
cors({ origin: process.env.CORS_ORIGIN || 'https://flow.yourdomain.com' })
```

`CORS_ORIGIN` must be set in production. The wildcard `*` is never used in production.

---

## 13. Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

Do not remove these headers. Do not add `Access-Control-Allow-Origin: *` outside the CORS middleware.

---

## 14. Rate Limiting

Current: in-memory sliding window, global (TD-10 — per-tenant rate limiting is pending).

Before production:
- Per-tenant rate limiting must be implemented or enforced at the API gateway layer.
- Hard limits: 100 requests/minute per workspace for standard API; 10 requests/minute for AI endpoints.

---

## 15. Incident Response

A security incident is any confirmed or suspected:
- Unauthorized access to workspace data
- Tenant isolation breach (one org seeing another's data)
- PII in logs or API responses
- Credential exposure (JWT secret, OAuth token)
- Governance bypass in production

**Response protocol:**
1. CTO is notified immediately (same day, not next sprint).
2. Affected workspace(s) identified and isolated if possible.
3. Root cause identified before fix is applied.
4. Hotfix deployed using the hotfix process (`06_RELEASE_PROCESS.md`).
5. Incident documented in `INCIDENT_LOG.md` with timeline, scope, root cause, fix.
6. Affected customers notified within 72 hours (GDPR/enterprise contract requirement).
