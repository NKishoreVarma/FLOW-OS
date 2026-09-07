# FLOW OS — Known Limitations
**Architecture Version:** 1.0  
**Status:** FROZEN

This document records the current constraints, known technical debt, and items explicitly out of scope. It is intended to be honest — not minimizing limitations for commercial purposes.

---

## 1. Critical Technical Debt

### TD-01: In-Memory State Loss on Restart (HIGH)

**Affected stores:**
- `vectorDatabase[]` (vectorStoreService.js) — topic clusters for Synapse Engine
- `incidentDatabase[]` (incidentEngine.js) — detected incidents
- `decisionDatabase[]` (decisionMemoryService.js) — extracted decisions
- `topicClusters[]` (vectorStoreService.js) — cross-channel clusters
- Knowledge Graph nodes/edges (knowledgeGraphService.js) — the in-process KG
- `ingestionTraces`, `queryTraces[]` — pipeline observability
- AI request traces (requestTracer.js ring buffer)
- Connector action timeline (200-event ring buffer)

**Impact:** Every server restart loses all incident history, decision history, Synapse Engine clustering, and the in-process KG. The pgvector store and PostgreSQL tables survive restarts; only the in-memory overlays are lost.

**Note:** The Operational Graph (`graph_nodes`/`graph_edges` in PostgreSQL) is durable. The in-process KG (`knowledgeGraphService.js`) is a separate, older subsystem that is also maintained in parallel.

**Mitigation (none yet):** TD-01 remains unresolved in v1.0.

---

### TD-04: CORS Set to `*` (MEDIUM-HIGH in Production)

**Location:** `src/server.js`

**Description:** CORS allows all origins in development. This is a known tech-debt item, not a design choice.

**Required action before production:** Set `CORS_ORIGIN` environment variable to the exact domain of your frontend deployment.

---

### TD-06: Random Embedding Fallback Pollutes Vector Index (MEDIUM)

**Location:** `vectorStoreService.js:182`, `retrievalService.js:574`

**Description:** When `GEMINI_API_KEY` is absent, embeddings are replaced with random normalized 768-dim vectors. These are stored in `workspace_intel_chunks`. They match semantically random content on ANN queries, degrading RAG quality silently.

**Detection:** Monitor for `WARN: Using random embedding fallback` log lines. They indicate the Gemini embedding API is unavailable.

---

### TD-07: `generateEmbedding` Duplicated (MEDIUM)

**Location:** `src/services/vectorStoreService.js` and `src/services/retrievalService.js`

**Description:** Two independent implementations of the same function. Divergence risk — one may be updated without the other.

---

### TD-08: Dual Connection Pool (MEDIUM)

**Location:** `src/config/db.js` (pg.Pool) + `src/core/config/prisma.js`

**Description:** Both pg.Pool and Prisma connect simultaneously to the same PostgreSQL instance with their own connection pools. Under high load, the two pools compete for connections. Default: 10 + 10 = 20 concurrent connections.

---

### TD-09: Daily Summary Cron Hardcoded to `workspace_corp_alpha` (MEDIUM)

**Location:** `src/workers/summaryWorker.js:26`

**Description:** The midnight rolling summary only runs for one hardcoded workspace. Multi-tenant support not implemented.

---

### TD-10: Per-Instance Rate Limiting Only (MEDIUM)

**Location:** `src/core/middleware/rateLimiter.js`

**Description:** The HTTP rate limiter uses an in-process sliding window. In a multi-instance deployment, each instance has its own window, so effective rate limit is `N × configured_limit`.

**Mitigation:** The AI Platform rate limiter uses Redis and works correctly across instances. Add gateway-level rate limiting (e.g., nginx, AWS API Gateway) for HTTP.

---

### TD-11: Console Log on Every Job (LOW)

**Location:** `src/services/operationalScoringService.js:13-14`

**Description:** `console.log` fires on every ingestion job. In production, this creates significant log noise.

---

### TD-12: Empty Test Suite (LOW)

**Location:** `tests/`

**Description:** Directory exists but is empty. All validation is done via `scripts/validate-*.js` scripts (in-process, no live server required) and `tests/integration/` (requires live server on `:5001`).

---

### TD-13: Mixed `.jsx` and `.tsx` in Frontend (LOW)

**Location:** `src/components/ui/button.tsx`

**Description:** One TypeScript file in an otherwise JavaScript codebase. TypeScript is not configured (no `tsconfig.json`). The file type-checks by coincidence.

**Rule:** Do not add more `.tsx` files.

---

### TD-OG-01: `testContext` Helper Inserts Into Wrong Table Names (LOW)

**Location:** `src/validation/helpers/testContext.js`

**Description:** Inserts into `"Org"`/`"Workspace"` (PascalCase) but Prisma creates `organizations`/`workspaces` (snake_case). Inserts silently fail. Connector test suites only need the workspace-id string, so this is not a blocker. Graph/org-FK tests must seed via Prisma instead.

---

## 2. Performance Limitations

### AI Call Latency (~28 seconds)

The Operational Brain pipeline (`/api/brain/copilot`, `/api/brain/reason`) typically takes 28–30 seconds end-to-end. This is because:
1. Context assembly (RAG + KG) takes ~2–5s
2. Gemini 2.5 Flash generates executive-quality prose in ~20–25s
3. Explanation envelope adds ~2–3s

**Mitigation:** The Workspace Intelligence Cache serves the Morning Briefing in ~5ms. The Brain is invoked only for interactive deep-reasoning.

**Not in scope for v1.0:** Speculative execution, streaming partial results to the UI before synthesis completes.

### Multi-Agent Council (~28s × parallelism)

The Executive Council runs 6 agents in parallel. Each agent calls `explainQuestion` (~28s). With `COUNCIL_AGENT_TIMEOUT_MS=60000`, the council completes in ~60s worst case. Fast agents answer within the window; slow ones are dropped gracefully.

### Benchmark Summary (from `docs/PERFORMANCE_REPORT.md`)

| Operation | Measured Latency |
|-----------|-----------------|
| Event publish | 3ms |
| Graph traverse (BFS) | 2ms |
| Impact analysis | 2ms |
| Graph neighbors | 1ms |
| Event search | 1ms |
| WIC snapshot build | 140ms cold / 13ms warm |
| WIC HTTP read | 5ms warm / 27ms cold |
| Prediction full-run | ~345ms |
| Simulation full-run | ~11ms |
| Brain copilot | ~28s |
| Council ask | ~60s worst case |

---

## 3. Scalability Limitations

### Single-Instance Only

The following features prevent horizontal scaling without changes:
- In-memory stores (TD-01)
- WebSocket connections are per-instance (no shared pub/sub)
- HTTP rate limiter is per-process (AI rate limiter is Redis-backed and cross-instance safe)
- Daily summary cron runs only on the instance that started the worker

### `model_requests` Metrics Under High Concurrency

At 1,000 concurrent requests, the `/api/metrics` endpoint (5 aggregate queries) becomes pool-bound (~12s response time). Mitigation options not implemented in v1.0: query result cache, read replica, or API gateway caching.

---

## 4. Feature Gaps (Explicitly Out of Scope for v1.0)

| Feature | Status |
|---------|--------|
| Real-time meeting transcription | Not implemented (LiveMeeting uses mock transcript stream) |
| Email sending infrastructure for invites | Not implemented (TeamInvite shows generated temp password) |
| Multi-tenant summary cron | Hardcoded to `workspace_corp_alpha` (TD-09) |
| Slack DM access in connectors | Governed by `dmPolicy` but Slack adapter is a skeleton |
| SharePoint, OneDrive, Dropbox, Google Drive | Adapter skeletons only — no fabricated resources in UI |
| Confluence | Adapter skeleton only |
| Salesforce | Adapter skeleton only |
| BambooHR | Adapter skeleton only |
| RAG evaluation harness | `src/evaluation/ragEval.js` exists but not wired to CI |
| Per-workspace privacy threshold | Global 0.85 only |
| Policy versioning and audit | Not implemented (Sprint 5.3-C candidate) |
| Multi-stage approval chains | Not implemented (Sprint 5.3-C candidate) |
| MFA/device conditions in governance | Not implemented (Sprint 5.3-C candidate) |

---

## 5. Security Known Gaps

| Gap | Risk | Mitigation |
|----|------|-----------|
| CORS `*` in development | MEDIUM — must be fixed in production | Set `CORS_ORIGIN` env var |
| Per-instance rate limiting | MEDIUM | Add gateway rate limiting |
| Vault path traversal | LOW | workspaceId validated before use; filesystem sandbox recommended |
| No email OTP / MFA for users | LOW | Future auth upgrade |
| Session revocation | LOW — JWTs have no server-side revocation | Short JWT TTL recommended |

---

## 6. Dependency Risks

| Dependency | Risk |
|-----------|------|
| Gemini 2.5 Flash | Primary LLM — outages degrade to heuristic fallback (acceptable) |
| pgvector | Required for semantic search — no fallback if extension unavailable |
| BullMQ / Redis | Worker queue — jobs survive Redis restarts if AOF enabled |
| Composio | OAuth proxy for some integrations — outage blocks connector auth flow |
| `pg` library | Two versions in tree (pg.Pool v8 + Prisma's internal pg) — potential version conflicts |

---

## 7. What v1.0 Does Not Attempt

- **Mobile application** — web only
- **Custom LLM fine-tuning** — all models used as-is
- **Real-time collaborative editing** — read-only workspace sharing
- **SAML / SSO** — JWT-only authentication
- **Multi-region deployment** — single-region only
- **Edge deployment** — standard Node.js, not Cloudflare Workers or Deno
- **AI agent autonomy** — FLOW recommends and executes with approval; it does not act autonomously without human oversight
