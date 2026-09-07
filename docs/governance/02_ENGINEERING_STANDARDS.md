# FLOW OS — Engineering Standards
**Document:** GOV-02  
**Status:** Mandatory  
**Applies to:** All backend and frontend code  
**Last updated:** 2026-07-18

---

## Module System

FLOW uses **ESM exclusively**. Every file uses `import`/`export`. No `require()`, no CommonJS interop in new code. Files that mix CJS and ESM will fail to boot in Node 20+ strict mode.

```js
// Correct
import { evaluateWithPolicies } from '../core/governance/index.js';
export async function buildSnapshot(workspaceId) { ... }

// Forbidden
const { evaluateWithPolicies } = require('../core/governance');
module.exports = { buildSnapshot };
```

---

## Folder Organization

```
src/
├── server.js                   # Entry — mounts routes, starts WS. Max 200 lines.
├── config/                     # Infrastructure: pg pool, redis, bullmq queue
├── core/                       # Framework-level cross-cutting concerns
│   ├── config/                 # Prisma singleton
│   ├── errors/                 # Typed errors (AppError, ValidationError, etc.)
│   ├── events/                 # In-process EventEmitter (not the Unified Event Platform)
│   ├── governance/             # Permission evaluator, policy store, approval lifecycle
│   ├── lifecycle/              # Graceful shutdown
│   ├── middleware/             # authenticate, authorize, tenantIsolation, rateLimiter
│   └── monitoring/             # Queue metrics, metrics aggregator, alerts
├── connectors/                 # Universal Connector Framework
│   ├── adapters/               # One file per connector (GmailAdapter.js, etc.)
│   ├── BaseAdapter.js
│   ├── registry.js
│   ├── executionEngine.js
│   └── ...
├── routes/                     # Express route files — thin handlers only
├── services/                   # Business logic — pure functions or function collections
├── workers/                    # BullMQ consumers
├── events/                     # Unified Event Platform (Phase 11.0)
├── graph/                      # Operational Graph Engine (Phase 11.1)
├── explainability/             # XAI Engine (Phase 11.2)
├── replay/                     # Workspace Replay Engine (Phase 11.3)
├── simulation/                 # What-If Simulation (Phase 11.4)
├── predictions/                # Predictive Intelligence (Phase 11.5)
├── execution/                  # Operational Execution Engine (Phase 14)
├── collaboration/              # Merge Conflict Intelligence (Phase 14.2)
├── notifications/              # Notification Engine (Phase 14.3)
├── council/                    # Multi-Agent Executive Council (Phase 15)
├── workspaceCache/             # Workspace Intelligence Cache (Phase 16.1)
├── simulator/                  # Living Workspace Simulator (Sprint 5)
├── onboarding/                 # Pilot onboarding state + metrics
├── autonomous/                 # Chief of Staff, Weekly Review, Action Cards (Phase 19)
├── observability/              # Token counter, trace helpers
├── prompts/                    # Centralized LLM prompt templates
├── evaluation/                 # RAG quality evaluation
└── utils/                      # Pure helpers: logger, envValidation, llm/
```

### Rules

1. **New capabilities get their own top-level folder.** A Phase 20 capability named "XYZ" lives at `src/xyz/` — it does not expand an existing folder.
2. **Route files are thin.** A route handler extracts request data, calls the service, and returns JSON. Business logic belongs in services. A route file longer than 150 lines is a signal to extract a service.
3. **`src/services/` is for legacy services.** New Phase 11+ code goes in its own folder (events/, graph/, etc.). Do not add new files to `src/services/` unless patching legacy code.
4. **Adapters live in `src/connectors/adapters/`.** One file per provider, e.g., `GmailAdapter.js`. Never put adapter logic in routes.

---

## Naming Conventions

### Files
```
PascalCase   → Classes, React components, adapters     GmailAdapter.js, BrainMessage.jsx
camelCase    → Services, utilities, route files        briefingEngine.js, meetingRoutes.js
kebab-case   → Config files, scripts                   docker-compose.yml, migrate-*.sql
```

### Functions and Variables
```
camelCase              → everything: functions, variables, constants
UPPER_SNAKE_CASE       → environment variables only (process.env.VAULT_ROOT)
PascalCase             → classes and React components only
```

### Database
```
snake_case             → table names, column names (workspace_id, created_at)
Tables                 → plural nouns (flow_events, graph_nodes, pending_approvals)
Primary keys           → always id (UUID string — gen_random_uuid() or Prisma cuid())
Foreign keys           → {table_singular}_id (workspace_id, user_id)
```

### Routes
```
/api/{resource}                  → collection (GET list, POST create)
/api/{resource}/:id              → member (GET, PATCH, DELETE)
/api/{resource}/:id/{action}     → sub-action (POST)
kebab-case for all path segments: /api/integration-permissions/:connector/discover
```

---

## Layering and Dependency Rules

The architecture has strict layers. **Lower layers do not import from higher layers.**

```
Level 0 (Foundation): config/, core/, utils/, prompts/
Level 1 (Infrastructure): events/, graph/, connectors/
Level 2 (Intelligence): services/, explainability/, replay/, simulation/, predictions/
Level 3 (Capabilities): execution/, collaboration/, notifications/, council/, workspaceCache/, autonomous/, onboarding/
Level 4 (Application): routes/, workers/, server.js
```

**Forbidden imports:**
- `core/` importing from `services/` or `routes/` ← never
- A service importing from `routes/` ← never
- Two Level-1 modules importing from each other in a cycle ← resolve with an event or a shared interface
- `server.js` containing business logic ← extract to a service

**Circular dependencies:** Boot-time circular imports crash the server. Use dynamic `import()` to break cycles where necessary (see `GmailAdapter.js` lazy-importing the ingestion queue).

---

## API Standards

### Request Validation
- Validate `workspace-id` header before any DB read. Return `400` if missing.
- Return typed errors: `ValidationError` (400), `AuthenticationError` (401), `AppError(403)` (403), `AppError(404)` (404).
- Never return raw PostgreSQL errors or stack traces to clients.

### Response Shape
All success responses follow one of two shapes:

```js
// Single resource
{ "data": { ...resource } }

// Collection
{ "data": [...items], "total": N, "page": N }

// Action result
{ "success": true, "data": { ...result } }
```

Error responses always include `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`.

### SQL Rules
- **No string concatenation in SQL.** Every value goes through a parameterized placeholder (`$1`, `$2`, ...).
- **Always include `workspace_id` in WHERE clause** for any table that has it.
- **Use `pg.Pool` for intelligence data** (workspace_intel_chunks, flow_events, graph_nodes, etc.).
- **Use Prisma for identity data** (Org, Workspace, User, WorkspaceMember, ApiKey, Integration, AuditLog).
- **Never run `prisma migrate dev` on production schema changes.** Apply hand-crafted SQL with `psql -f`, then run `npx prisma generate`.

### Error Handling in Routes
```js
// Correct pattern
try {
  const result = await someService(workspaceId, params);
  res.json({ success: true, data: result });
} catch (err) {
  next(err); // Let the global errorHandler serialize it
}
```

Never catch-and-swallow in route handlers. Never catch and `res.json({ error: ... })` directly — use `next(err)`.

---

## Async and Concurrency

- All new functions are `async/await`. Never callbacks in new code.
- BullMQ jobs must be idempotent. The ingestion worker may retry.
- Use `Promise.allSettled()` (not `Promise.all()`) when making parallel calls that must not block each other on failure. Fault-isolation is mandatory for council/simulation parallel calls.
- Never block the event loop with synchronous file operations in request paths. Use `fs/promises`.

---

## Environment Variables

### Required at boot (validated in `envValidation.js`)
```
DATABASE_URL, REDIS_URL, JWT_SECRET (≥32 chars), COMPOSIO_API_KEY, GEMINI_API_KEY
```

### Adding a new environment variable
1. Add to `.env.example` with a descriptive comment.
2. Add to `src/utils/envValidation.js` — either required (exits if missing) or optional (warn only).
3. Add to Section 11 of `CLAUDE.md`.
4. Never hardcode a fallback for a required variable.

### JWT_SECRET
- Minimum 32 characters.
- Generate with `openssl rand -hex 32`.
- Known-insecure defaults are rejected at startup.
- Never log the value.

---

## AI / LLM Calls

Every Gemini call follows this pattern:

```js
if (!process.env.GEMINI_API_KEY) {
  return deterministicFallback(params);
}
try {
  const result = await gemini.generate(...);
  return result;
} catch (err) {
  logger.warn('gemini', 'Gemini call failed, using fallback', { err: err.message });
  return deterministicFallback(params);
}
```

**Rules:**
- Every LLM call has a local fallback that works without an API key.
- Fallbacks are not stubs — they must produce useful output (structured Markdown, heuristic scores, etc.).
- Never throw from a Gemini call path if the fallback can handle it.
- Model used for synthesis: `gemini-2.5-flash`. Model used for embeddings: `gemini-embedding-2` (768-dim).

---

## Logging

Use `src/utils/logger.js`. Do not use `console.log` in service files.

```js
import { logger } from '../utils/logger.js';

logger.info('brain', 'Briefing generated', { workspaceId, role });
logger.warn('connector', 'GitHub rate limit low', { remaining });
logger.error('queue', 'Job failed', { jobId, err: err.message });
```

**Never log:**
- PII (email body, message text, names with identifying context)
- JWT tokens, API keys, secrets
- Full SQL queries with real values
- Raw `PRIVATE_PERSONAL` content

**Channels:** `rag`, `vector`, `security`, `queue`, `brain`, `connector`, `graph`, `event`, `simulator`

Secret redaction is applied automatically to structured log objects in `LOG_FORMAT=json` mode.

---

## Performance Standards

See `docs/governance/09_PERFORMANCE_BUDGET.md` for full budgets. Key rules:

- **Route handlers that read DB must return in ≤200ms p95** (excluding AI calls).
- **AI calls are exempt from the 200ms budget** but must have the fallback path ≤50ms.
- **BFS graph traversal must complete in ≤35ms** for up to 1000 nodes (frontier cap 400).
- **Workspace cache reads must return in ≤5ms** (Redis hit) or ≤150ms (cold build).
- Do not add `process.exit()` calls on transient errors (database connection hiccup, etc.). They cascade to a full process crash in the middle of live requests.

---

## Security Rules (Summary)

Full standard: `docs/governance/08_SECURITY_STANDARD.md`

1. Never skip `tenantIsolation` middleware on protected routes.
2. Never return data from a workspace the JWT user does not own.
3. Never use `origin: '*'` in production (current tech debt TD-04 — scoped CORS before deploy).
4. WS connections require JWT in production (`WS_AUTH_REQUIRED=true`).
5. All `eval()`, `new Function()`, shell exec with user input, and `childProcess.exec` with interpolation are forbidden.
6. SSRF: all outbound URL fetches go through `crawlerService.js` (SSRF-safe fetcher). Never `fetch(userSuppliedUrl)` directly.

---

## Testing Standards

The integration suite runs as an HTTP client against a live server on `:5001`.

```bash
PORT=5001 node src/server.js &
npm run test:integration
```

Baseline: **66/74 pass, 8 pre-existing failures** (known: signup `name`/`fullName` mismatch, legacy lifecycle-schema assertions). A commit that causes new failures is not merged.

**Unit tests** (when written): pure functions only, no mocking the DB, no mocking the event bus. If a function requires infrastructure, write an integration test instead.

**Validation scripts** in `scripts/validate-*.js` are the acceptance test for each phase. Run them after any change that touches the relevant engine.
