# FLOW OS — Security Model
**Architecture Version:** 1.0  
**Status:** FROZEN  
**Security Audit:** `docs/SECURITY_AUDIT.md`

---

## 1. Authentication

### JWT Token Flow
```
POST /api/auth/login
  → verify email + bcrypt password check
  → signToken({ sub: userId, orgId, role })
  → return { token, user }

Every protected route:
  → authenticate middleware
  → jwt.verify(token, JWT_SECRET)
  → req.user = { id, orgId, role }
```

**Token properties:**
- Algorithm: HS256
- Secret: `JWT_SECRET` (minimum 32 characters, enforced by `validateEnv()` at startup)
- Known insecure defaults are explicitly rejected at startup
- No hardcoded fallback (removed in Sprint 5.3.2)

**WebSocket Authentication:**
- Production (`WS_AUTH_REQUIRED=true`): JWT required as `?token=` query param or `Authorization: Bearer` header
- Server verifies JWT + workspace ownership before upgrading connection
- `socketService.authenticateSocket()` implements the check
- Pre-12.0 vulnerability (unauthenticated WS): **FIXED** (security audit finding HIGH-1)

### API Keys
- Stored in `api_keys` table (hashed, not plaintext)
- Scoped to an organization
- Optional expiry (`expires_at`)

---

## 2. Authorization — RBAC

### Role Hierarchy
```
OWNER   — full control, including policy management
ADMIN   — can approve actions, manage users, view audit
MEMBER  — normal workspace user (default automation actor)
VIEWER  — read-only access
```

### Role Resolution
1. `authenticate` middleware extracts org-level role from JWT
2. `tenantIsolation` middleware queries `workspace_members` table for workspace-scoped role
3. If no `WorkspaceMember` record exists, org role is used as fallback
4. `governanceMiddleware` attaches `req.govContext = { workspaceRole, plan }`

### Route-Level Enforcement
- Public routes: `/health`, `/api/auth/*`
- Protected routes: all others require valid JWT
- Role-restricted routes: ADMIN+ for approvals/policies, OWNER for policy mutation

---

## 3. Tenant Isolation

**This is the most critical security boundary in FLOW.**

### Enforcement Point: `tenantIsolation` middleware
```javascript
// src/core/middleware/tenantIsolation.js
const workspaceId = req.headers['workspace-id'];
if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });

// DB query: does this workspace belong to req.user.orgId?
const workspace = await prisma.workspace.findFirst({
  where: { externalId: workspaceId, orgId: req.user.orgId },
  include: { org: { select: { plan: true } } }
});
if (!workspace) return res.status(403).json({ error: 'Workspace not found or access denied' });

req.tenantId  = workspaceId;
req.workspace = workspace;
```

**Invariant:** This check runs before any route handler that touches workspace data. Cross-org data access always returns 403.

### Database-Level Isolation
- Every pgvector query filters by `workspace_id`
- Every `org_memory_records` query filters by `workspace_id` or `orgId`
- Every `graph_nodes` / `graph_edges` query filters by `workspace_id`
- Every `audit_logs` query filters by `orgId`

---

## 4. Policy Engine

**Files:** `src/core/governance/`

### Policy Evaluation Order
```
1. Load active policies for (orgId, workspaceId, connectorId) from DB
   → 60-second in-memory cache (policyStore.js)
2. Sort by priority DESC (higher priority evaluated first)
3. First matching policy:
   DENY         → return immediately (DENY wins)
   REQUIRE_APPROVAL → accumulate (all must pass)
   ALLOW        → set allow flag
4. If no DB policy matches → fall back to DEFAULT_ROLE_PERMISSIONS matrix
5. Plan-tier gates (pro/enterprise features blocked on free plan)
```

### Default Role-Action Matrix
```
OWNER:  everything ALLOW
ADMIN:  most actions ALLOW, destructive = REQUIRE_APPROVAL
MEMBER: read = ALLOW, write = REQUIRE_APPROVAL, delete = DENY
VIEWER: read = ALLOW, everything else = DENY
```

### Policy Model
```
Policy {
  orgId, workspaceId?, connectorId?, capability?,
  actionType?, subjectRole?, subjectUserId?,
  effect: ALLOW | DENY | REQUIRE_APPROVAL,
  conditions: { requireApproval, planTiers, timeWindow },
  priority: int,
  enabled: bool
}
```

---

## 5. Approval Flow

**Files:** `src/core/governance/approvalStore.js`, `src/execution/approvalEngine.js`

### Approval Lifecycle
```
PENDING → APPROVED → EXECUTED
        → REJECTED
        → EXPIRED (after 48h default TTL)
```

### Risk-Tiered Approval (Phase 14)
```
LOW      → auto-execute, no human in loop
MEDIUM   → requester confirms in FLOW UI
HIGH     → 1× ADMIN or OWNER approval required
CRITICAL → 2× distinct ADMIN/OWNER approvals (two-person rule)
```

### Self-Approval Guard
- A user cannot approve their own request
- CRITICAL requires two **distinct** approvers
- Enforced in `approvalStore.updateApprovalStatus()`

### Automation Actor Invariant
- Automation rules always run as fixed `MEMBER` role
- Rule data cannot escalate to ADMIN/OWNER
- `CONNECTOR_ACTION_EXECUTED` is never an automation trigger (loop prevention)

---

## 6. PII Protection

### Layer 1: Privacy Gate (Ingestion Stage 3)
```javascript
if (scores.privacy_score > 0.85) {
  // DISCARD — data never reaches vector store, vault, or KG
  broadcast PRIVACY_SHIELD_TRIGGERED (no payload text)
  return;
}
```
The raw input text is set to `null` for PRIVATE_PERSONAL classified messages. It never appears in any log line.

### Layer 2: AI Guardrails (AIPlatform Layer 6)
- PII detected in user prompts → HIGH severity (SSN, credit card, passport) blocks the request
- PII echo-back in AI output → blocks the response
- Pattern list: email, phone, SSN, credit card, IP, passport, DOB, salary, national ID

### Layer 3: Structured Logging Redaction
```javascript
// src/utils/logger.js — redact() runs on every log object
// Redacted keys: token, password, secret, authorization, apikey, jwt, cookie, pii
// Applies recursively to nested objects
```

### Layer 4: Vault File Security
- Vault files written to `$VAULT_ROOT` (default: `~/FLOW-OS-VAULTS`)
- Files contain only OPERATIONAL_INTEL classified content (privacy gate passed)
- Path: `{VAULT_ROOT}/workspace_{id}/{channel}/intel_{ts}.md`
- Configurable root: `VAULT_ROOT` env var (fixed in Sprint 5.3.2)

---

## 7. Prompt Injection Protection

### Detection: `src/ai/guardrails/injectionDetector.js`

**14 direct patterns** (case-insensitive):
- "ignore previous instructions"
- "disregard all prior instructions"
- "forget everything"
- "you are now a…"
- "act as if you are…"
- "pretend to be…"
- "jailbreak", "DAN mode", "developer mode enabled"
- `[system]`, `<system>` tags
- SQL comment injection (`--`, `/* */`)
- Data exfiltration attempts ("print your system prompt")

**Structural injection patterns:**
- Role-play headers (`### System:`, `[INSTRUCTION]`)
- ASSISTANT: pre-fills

**Risk levels:**
- `high` → request blocked
- `medium` → warning in trace, request continues
- `none` → clean

### Defense in Depth
1. Injections stripped in `parserService.normalizeFormatting()` during ingestion (Stage 1)
2. Re-detected at `AIPlatform.request()` input guardrail layer
3. PromptBuilder wraps user input in a structured section with explicit boundaries

---

## 8. Audit Logging

### Durable Audit Trail
All connector actions write to `audit_logs` (PostgreSQL, Prisma-backed):
```
AuditLog {
  orgId, workspaceId, userId,
  action,    // "connector.send", "user.login"
  resource,  // "connector:gmail"
  metadata,  // sanitized payload — no secrets
  approvalId, policyId,
  ip, createdAt
}
```

### What is Audited
- Every `executeAction()` call (success, failure, denied, approval_required)
- User login/logout
- Policy changes (create, update, delete)
- Approval decisions (approve, reject)
- Workspace member changes

### What is NOT Audited (by design)
- AI prompts and responses (too large, PII risk)
- Vault file writes (tracked by filesystem path only)
- WebSocket connections

---

## 9. Secrets Management

### Environment Variables
Required at startup (`validateEnv()` exits process on failure):
- `JWT_SECRET` — minimum 32 chars, no known insecure defaults
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `COMPOSIO_API_KEY` / `GEMINI_API_KEY` — at least one AI provider

Optional (warn if absent):
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Gmail/Calendar OAuth
- `GITHUB_TOKEN` — GitHub adapter
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — additional AI providers

### OAuth Token Storage
- Tokens stored in `Integration.credentials` (JSON, Prisma)
- Auto-refresh handled per-adapter (GmailAdapter, GoogleCalendarAdapter)
- Tokens never appear in logs (redaction layer)

### Dev Dashboard Security (`src/routes/devDashboard.js`)
- Returns 404 in `NODE_ENV=production`
- All API routes require OWNER/ADMIN JWT
- Dashboard JS reads token from `localStorage` and sends with every `fetch`

---

## 10. Network Security

### CORS
- Default: `*` in development (tech debt TD-04)
- Production: set `CORS_ORIGIN` env var to restrict to known domains
- Credentials: enabled

### Security Headers (all responses)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0         (CSP is the real guard)
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=()
```

### SSRF Protection
Web crawler (`src/services/crawlerService.js`) blocks private IP ranges:
- `127.x.x.x`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`
- Internal hostnames (`localhost`, `metadata.google.internal`)
- `file://` and other non-HTTP schemes

### Rate Limiting
- In-process sliding window per IP (`src/core/middleware/rateLimiter.js`)
- Per-workspace AI rate limiting (`src/ai/model/rateLimiter.js`)
- Production recommendation: add gateway-level rate limiting before the process

---

## 11. Known Security Posture

From `docs/SECURITY_AUDIT.md` (25 domains assessed, 2026-07-11):

| Finding | Severity | Status |
|---------|----------|--------|
| WebSocket connections unauthenticated | HIGH-1 | **FIXED** — JWT required in prod |
| CORS set to `*` | MEDIUM-2 | Accepted dev tech debt — set `CORS_ORIGIN` in prod |
| Per-instance rate limiting only | MEDIUM-1 | Accepted — add gateway rate limiting in prod |
| Vault workspaceId in path | LOW-1 | Mitigated — validated workspace scope |
| Parameterized SQL throughout | ✅ Verified | No SQL injection risk |
| No command injection | ✅ Verified | No shell exec in request paths |
| SSRF protection | ✅ Verified | Crawler blocks private ranges |
| JWT in header only | ✅ Verified | CSRF not applicable |
| Admin pages escape + prod-404 | ✅ Verified | devDashboard, monitoring, event-inspector |
