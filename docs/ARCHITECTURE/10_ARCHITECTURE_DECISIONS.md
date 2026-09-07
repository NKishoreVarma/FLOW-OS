# FLOW OS — Architecture Decisions
**Architecture Version:** 1.0  
**Status:** FROZEN

Each decision is recorded as: **what was decided**, **why**, **alternatives considered**, **trade-offs**, and **future implications**.

---

## ADR-001: ESM Modules Throughout

**Decision:** All files use `import`/`export`. No `require()` anywhere.

**Why:** Node 20+ supports native ESM with top-level `await`, named exports, and strict resolution. CommonJS interop hacks add complexity. ESM is the standard.

**Alternatives considered:** CommonJS (eliminated — prevents top-level await); Hybrid (eliminated — dual-mode complexity).

**Trade-offs:** Some legacy packages require `.default` workaround for default-export compatibility. Dynamic `import()` required for optional circular-dependency-breaking (Memory Platform in AIPlatform.js).

**Future:** ESM is permanent. Any added dependency must support ESM natively.

---

## ADR-002: Two Database Clients (Prisma + pg.Pool)

**Decision:** Prisma manages schema for identity/governance/intelligence tables. Raw `pg.Pool` handles the vector store and event platform.

**Why:** pgvector `VECTOR(768)` columns and `ivfflat` indexes cannot be managed by Prisma 7.x's migration system. Raw SQL is also faster for high-throughput append paths (`flow_events`, `workspace_intel_chunks`).

**Alternatives considered:** Prisma only (blocked on pgvector column type); pg.Pool only (loses Prisma's type safety and migration management for relational tables).

**Trade-offs:** TD-08 — two connection pools compete for PostgreSQL connections. Prisma default pool + `pg.Pool` default pool = 20 concurrent connections. Configured via `DATABASE_URL` parameters.

**Future:** When Prisma natively supports pgvector, raw queries for schema management could be eliminated. The `pg.Pool` for high-throughput paths is likely to remain.

---

## ADR-003: Single Event Bus (`src/events/`)

**Decision:** All connector activity is published through one canonical event bus. No module publishes events directly to database tables or other modules.

**Why:** Before Phase 11.0, each connector wrote to its own table. Adding a new intelligence module required updating every connector. A single bus inverts this — connectors publish once; consumers subscribe independently.

**Alternatives considered:** Per-connector event queues (eliminated — N×M coupling); direct service-to-service calls (eliminated — tight coupling, no replay).

**Trade-offs:** All consumers must handle idempotency (the bus may re-deliver). The `(workspace_id, connector, source_event_id)` dedup key prevents most duplicates at storage, but downstream subscribers must be idempotent.

**Future invariant:** The brain subscriber must never re-publish events that originated from ingestion (`metadata.origin === 'ingestion'`). This is a loop-prevention rule that must be maintained.

---

## ADR-004: Single Graph Writer

**Decision:** Only the Event Platform `graph` subscriber calls `GraphEngine.applyEvent`. No other code writes to `graph_nodes` or `graph_edges`.

**Why:** Multiple writers cause race conditions on edge `observation_count` and upsert conflicts. Before Phase 11.1, both the old `operationalGraphService` and connector sync paths wrote graph data independently, causing duplicate edges and inconsistent counts.

**Alternatives considered:** Graph CRDT (too complex for current scale); per-connector graph writers with locking (still causes conflicts under load).

**Trade-offs:** Any new data source that needs graph representation must publish a FLOW Event and register graph derivation rules in `GraphSchema.deriveGraph()`.

**Future invariant:** The graph subscriber must not publish events (it reads the bus, never writes to it). This prevents feedback loops.

---

## ADR-005: Bounded BFS (Not Recursive CTE)

**Decision:** Graph traversal uses iterative BFS with per-hop indexed queries, frontier cap 400, node cap 1000 — not a PostgreSQL recursive CTE.

**Why:** Recursive CTEs explode on dense hubs. Early testing showed: hub node with 200+ edges → 38-second query with recursive CTE → 30ms with bounded BFS at the same data volume.

**Alternatives considered:** Recursive CTE (eliminated — 38s vs 30ms); in-memory DFS from cached graph (eliminated — memory explosion at scale; cache invalidation complexity).

**Trade-offs:** Traversal is approximate for very deep graphs (frontier cap means some distant nodes may be missed). For FLOW's use cases (impact analysis, context assembly), this trade-off is acceptable.

---

## ADR-006: Provider Isolation in AI Platform

**Decision:** No module outside `src/ai/` may import `@google/genai`, `openai`, or `@anthropic-ai/sdk`. All AI requests route through `AIPlatform.request()`.

**Why:** Before Phase AI Platform, 20+ services imported Gemini directly. Switching providers required updating all 20 files. Provider outages caused service failures with no fallback. PII could reach providers without guardrails.

**Alternatives considered:** Thin wrapper per provider in each service (eliminated — guardrails and fallback still duplicated); shared utility function without platform layers (eliminated — no observability, no rate limiting, no caching).

**Trade-offs:** The platform adds ~5ms overhead per request. For latency-sensitive paths (ingestion Stage 9), the heuristic fallback bypasses the platform.

**Future invariant:** Verified by `scripts/validate-ai-platform.js` on every build.

---

## ADR-007: Governance Never Bypassed

**Decision:** All connector actions, automation steps, and AI tool calls route through `executeAction()`. No connector method is called directly without governance evaluation.

**Why:** Before Phase 5.3, adapters could be called directly from services. This meant PII could flow to external services without approval, and no audit trail existed.

**Alternatives considered:** Per-connector governance checks (eliminated — missed cases guaranteed); audit-after-the-fact (eliminated — doesn't prevent unauthorized actions).

**Trade-offs:** Every action has overhead from policy evaluation + audit persistence. The 60-second policy cache (`policyStore`) minimizes DB round-trips.

**Future invariant:** `CONNECTOR_ACTION_EXECUTED` must never be an automation trigger. Automation already runs through `executeAction()` — adding it as a trigger would create an infinite loop.

---

## ADR-008: Privacy Gate as Hard Drop (Not Soft Filter)

**Decision:** When `privacy_score > 0.85`, the ingestion pipeline terminates. The text is set to `null`. Nothing is stored, logged, or vectorized.

**Why:** A soft filter (store with redaction) still creates a retrievable record. An enterprise security posture requires that private personal communications never appear in any query result.

**Alternatives considered:** Store with PII redacted (eliminated — redaction is imperfect; the record still exists); store in a separate private vault (eliminated — retrieval always risks cross-contamination).

**Trade-offs:** Operational intelligence hidden behind personal communications is also lost. This is the intended behavior.

**Future:** The 0.85 threshold is configurable but not currently a per-workspace setting. A future version could allow workspace-level privacy thresholds.

---

## ADR-009: Deterministic Fallback for Every LLM Call

**Decision:** Every Gemini call has a deterministic non-LLM fallback. The system must boot and operate without `GEMINI_API_KEY`.

**Why:** During early development, Gemini API outages caused complete data ingestion failure. The system stopped processing all messages.

**Pattern:**
```javascript
if (!process.env.GEMINI_API_KEY) { return heuristicFallback(); }
try { return await geminiCall(); } catch { return heuristicFallback(); }
```

**Trade-offs:** Heuristic fallbacks are lower quality (keyword-based classification vs. LLM classification). Operators should monitor `MEMORY_DISCARDED` events — a spike may indicate the heuristic misclassifying content.

---

## ADR-010: Workspace-Scoped Roles (workspace_members)

**Decision:** Workspace-level roles are stored in `workspace_members`, separate from org-level roles in `users`.

**Why:** An OWNER at the org level might be a MEMBER in a specific workspace (e.g., a compliance officer). The org role is the fallback when no workspace membership record exists.

**Alternatives considered:** Org role only (eliminated — no workspace-level access control); policy-only (eliminated — too complex for common role-based access).

**Trade-offs:** Two role lookups per authenticated request (JWT for org role + DB query for workspace role). Mitigated by the fact that `tenantIsolation` already does a DB query for workspace ownership.

---

## ADR-011: Onboarding State in Redis (Not PostgreSQL)

**Decision:** First-run onboarding state is stored in Redis (`onboarding:state:{workspaceId}`), not a PostgreSQL table.

**Why:** Onboarding is ephemeral per workspace (complete once, then irrelevant). A Redis key avoids a schema migration and keeps the happy-path simple. `localStorage` provides a client-side backup.

**Trade-offs:** If Redis is flushed, onboarding state is lost (user sees the wizard again). The `flow_onboarding_complete` localStorage flag prevents most re-runs. The gate is designed to fail-open — a lost Redis key never traps a session.

---

## ADR-012: Morning Briefing from Cache (Not Council)

**Decision:** The Morning Briefing (landing page) reads from the Workspace Intelligence Cache (`/api/workspace/snapshot`), not the Multi-Agent Council.

**Why:** The Council makes ~28s Brain calls. The Workspace Intelligence Cache serves in ~5ms (warm) from pre-built snapshots. The landing page must feel instant.

**Alternatives considered:** Council on page load (eliminated — 28s blank page is unusable); pre-generated council output (eliminated — staleness concerns; Council is for interactive deep-reasoning).

**Trade-offs:** The Morning Briefing snapshot may be up to 10 minutes stale (WIC debounce + 5-min cron). This is acceptable for executive-level status.

---

## ADR-013: Integration Permissions as Deny-by-Default Gate

**Decision:** Resources not explicitly allowed are never ingested. The gate runs before any data touches FLOW's stores.

**Why:** "Allow by default, let users remove later" means PII and sensitive channels are ingested before anyone reviews permissions. Enterprise customers require explicit allow lists.

**Alternatives considered:** Allow by default (eliminated — PII risk, enterprise blocker); user-reviewed after ingestion (eliminated — data already in stores, damage done).

**Trade-offs:** New connector deployments require a resource discovery step before any data flows. Grandfathering solves the non-breaking deploy problem for existing workspaces.

---

## ADR-014: Workspace Intelligence Cache Never Calls Brain/Council

**Decision:** `SnapshotBuilder` uses only fast data sources: Prediction Engine (~22 predictions), Health Score, Graph metrics, PostgreSQL counts. It never calls `copilotService`, `briefingEngine`, or the Executive Council.

**Why:** Cache rebuilds are triggered by events (potentially many per minute). Calling the Brain (~28s) on every event would saturate AI rate limits.

**Trade-offs:** The snapshot doesn't contain narrative AI reasoning. Users who want deep AI insight navigate to the Council or the Briefing. The snapshot provides signal (health, predictions, top actions); AI provides synthesis.
