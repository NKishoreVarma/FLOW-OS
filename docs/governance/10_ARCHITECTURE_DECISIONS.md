# FLOW OS — Architecture Decision Records
**Document:** GOV-10  
**Status:** Mandatory  
**Applies to:** All architectural changes  
**Last updated:** 2026-07-18

---

## Purpose

Architecture Decision Records (ADRs) capture the why behind architectural choices in FLOW. Code tells you what was done. ADRs tell you why.

An ADR is written when a decision is made that:
- Changes the data model
- Adds or removes a foundational dependency
- Establishes a new cross-cutting pattern (new middleware, new event type, new connector interface)
- Contradicts or supersedes a previous decision
- Has significant long-term implications (schema migration strategy, caching topology, AI model choice)

ADRs are **not** written for feature implementations, bug fixes, or local refactors.

---

## ADR Template

Save new ADRs at `docs/decisions/ADR-{NNN}-{kebab-case-title}.md`.

```markdown
# ADR-{NNN}: {Title}

**Date:** YYYY-MM-DD  
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-{NNN}  
**Deciders:** {Names or roles}

---

## Context

What is the situation that requires a decision? What forces are at play?
(Background, constraints, the problem being solved)

## Decision

What decision was made?
(Be specific — not "we'll use caching" but "we store workspace snapshots in Redis with a 1-hour TTL, keyed by `wic:snapshot:{workspaceId}`")

## Rationale

Why this decision over the alternatives?

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| {Alternative 1} | {Reason} |
| {Alternative 2} | {Reason} |

## Consequences

### Positive
- {What becomes easier}

### Negative
- {What becomes harder or is now a constraint}
- {Technical debt introduced, if any}

## Related ADRs
- Supersedes: ADR-{NNN} (if applicable)
- Related: ADR-{NNN} (if applicable)
```

---

## Decision Log

The following ADRs are accepted and in force. They represent the authoritative record of why FLOW is built the way it is.

---

### ADR-001: ESM-Only Codebase

**Status:** Accepted  
**Date:** 2026-01-10

**Decision:** All backend code uses ES Modules (`import`/`export`). `require()` is forbidden in new code.

**Rationale:** Node 20+ supports native ESM. ESM enables static analysis, better tree-shaking, and eliminates the dual-module hazard. The project was started on ESM — there is no migration cost.

**Consequences:** Dynamic `import()` is required to break circular dependencies (see GmailAdapter lazy-importing the ingestion queue). Third-party CJS-only packages require wrapper shims.

---

### ADR-002: pg.Pool + Prisma Dual-Database Client

**Status:** Accepted (Tech Debt TD-08)  
**Date:** 2026-01-15

**Decision:** Use `pg.Pool` for raw SQL (intelligence tables: `workspace_intel_chunks`, `flow_events`, `graph_nodes`, etc.) and Prisma for identity tables (Org, Workspace, User, WorkspaceMember, etc.).

**Rationale:** pgvector ANN queries and complex `flow_events` queries are easier to express in parameterized SQL than Prisma's query builder. Prisma provides type safety and migration tooling for the identity schema.

**Consequences (negative):** Two connection pools (TD-08). Must maintain the discipline of which client accesses which tables. Risk of inconsistency if a feature crosses the boundary.

---

### ADR-003: Never `prisma migrate dev` in Production

**Status:** Accepted  
**Date:** 2026-02-01

**Decision:** Schema changes are applied via hand-crafted idempotent SQL (`scripts/migrate-*.sql`) on production, not `prisma migrate dev`. After SQL is applied, `npx prisma generate` regenerates the Prisma client.

**Rationale:** `prisma migrate dev` is an interactive development tool — it creates shadow databases, may apply partial migrations, and is not safe for production. Hand-crafted SQL is explicit, reviewable, and idempotent.

**Consequences:** Every schema change requires a corresponding SQL migration file. Schema changes are additive-only in production (no dropping columns without a two-phase migration).

---

### ADR-004: Unified Event Platform as the Single Event Bus

**Status:** Accepted  
**Date:** 2026-05-10 (Phase 11.0)

**Decision:** All activity from all connectors flows through `src/events/` (publish → PostgreSQL `flow_events` → fan-out to subscribers). There is exactly one event bus. The legacy in-process `core/events/eventBus.js` EventEmitter is retained as the internal primitive only.

**Rationale:** Before Phase 11, events were produced in 3 places (ingestion worker, webhook processor, governance subscribers) with different schemas. A single bus allows replay, search, metrics, retention, and fan-out with one write.

**Consequences:** All new connectors must publish to the event bus, not directly to DB. Event deduplication is on `(workspace_id, connector, source_event_id)` — connector code must generate distinct source_event_ids per state change (not reuse IDs for updates).

---

### ADR-005: Bounded BFS for Graph Traversal

**Status:** Accepted  
**Date:** 2026-05-15 (Phase 11.1)

**Decision:** Graph traversal uses iterative BFS with a frontier cap of 400 nodes and a total node cap of 1000. No recursive CTEs in PostgreSQL.

**Rationale:** Recursive CTEs exploded on dense hubs (38 seconds vs. 30ms with bounded BFS). The caps prevent runaway traversal while covering meaningful 2–4 hop relationships for all observed graph shapes.

**Consequences:** Very large graphs may not return the full subgraph within 1 traversal call. The caps are explicit product constraints — they are documented, not hidden.

---

### ADR-006: Workspace Intelligence Cache for Instant UI

**Status:** Accepted  
**Date:** 2026-07-01 (Phase 16.1)

**Decision:** The Home page and Chief of Staff page read from a pre-built workspace snapshot (in-memory Map + Redis write-through, keyed `wic:snapshot:{workspaceId}`), not from the AI reasoning layer. The snapshot builds in ≤150ms from deterministic sources (predictions, health score, graph metrics).

**Rationale:** The Executive Council takes ~90 seconds. The WIC takes ~140ms. The Morning Briefing must feel instant. The Council is reserved for deep interactive reasoning.

**Consequences:** The snapshot is not real-time. It is rebuilt on event bus activity (debounced 10s) and on a 5-minute cron. A workspace that has been idle for 5+ minutes may show a slightly stale snapshot.

---

### ADR-007: Risk-Tiered Approval with Two-Person CRITICAL Rule

**Status:** Accepted  
**Date:** 2026-07-14 (Phase 14)

**Decision:** Actions are classified LOW/MEDIUM/HIGH/CRITICAL. LOW auto-executes. MEDIUM requires requester confirmation. HIGH requires one ADMIN/OWNER approval. CRITICAL requires two distinct ADMIN/OWNER approvals. Self-approval is forbidden at all tiers.

**Rationale:** Enterprise customers require a two-person rule for high-stakes actions (merging to production, deleting data, sending mass communications). Single-approver HIGH aligns with standard enterprise change management.

**Consequences:** CRITICAL actions are slower (must wait for two humans). The two-person constraint is enforced in `approvalEngine.js` — it cannot be configured away by a policy. The automation engine is fixed at MEMBER role so it cannot initiate HIGH or CRITICAL actions.

---

### ADR-008: Single Writer for the Knowledge Graph

**Status:** Accepted  
**Date:** 2026-05-15 (Phase 11.1)

**Decision:** The graph has exactly one writer: the `graph` event bus subscriber in `src/graph/`. All other code reads the graph. No service writes directly to `graph_nodes` or `graph_edges` outside this subscriber.

**Rationale:** Multiple writers cause race conditions and duplicate nodes. A single subscriber processes events in order and applies `ON CONFLICT DO UPDATE` cleanly.

**Consequences:** New connectors automatically populate the graph by publishing events (no graph code needed). If the graph subscriber lags, the graph is slightly stale — acceptable given typical event volumes.

---

### ADR-009: Deny-by-Default Integration Permissions

**Status:** Accepted  
**Date:** 2026-07-05 (Phase 13.1)

**Decision:** When a connector is first authenticated, all resources default to EXCLUDED. Resources must be explicitly ALLOWED via the Trust Center before FLOW reads them. "Unknown" resources (not yet discoverable) follow the `autoAllowNew` setting (default: false → DENY).

**Rationale:** Enterprise customers require explicit consent before organizational data is ingested. Fail-open (read everything by default) creates compliance and trust risks.

**Consequences:** Onboarding requires a Trust Center permission step. Grandfathering (`legacy_grandfathered`) makes the initial deploy non-breaking for existing workspaces.

---

## Migration Process

When an existing architectural decision needs to change:

1. Write a new ADR explaining the motivation for the change.
2. The new ADR's status is `Proposed` until it is accepted in an engineering review.
3. The old ADR's status is updated to `Superseded by ADR-{NNN}`.
4. The migration is planned in phases — never a big-bang replacement.
5. Both old and new approaches coexist during migration (shims/adapters as needed).
6. The old approach is removed only after the new approach is fully validated in production.

---

## Breaking Changes

A breaking change is any change that requires:
- A database migration that cannot be rolled back instantly
- A change to the WebSocket event schema that existing clients depend on
- Removal of an API endpoint that is documented in `CLAUDE.md` §5.7
- A change to the JWT structure or validation logic

Breaking changes require:
1. An ADR
2. A migration plan with rollback steps
3. CTO approval
4. A version bump (minor or major)
5. A minimum 2-sprint deprecation period for breaking API changes (unless a security fix forces immediate removal)

---

## Deprecation Policy

### API Endpoints

A deprecated endpoint:
1. Returns the same response for one release cycle (backward-compatible shim).
2. Logs a deprecation warning in the server when called.
3. Is removed in the following release.
4. Is documented in the release notes.

Never remove an endpoint between two releases without a shim.

### Components

A deprecated frontend component:
1. Is listed in the deprecation schedule in `docs/bible/18_COMPONENT_LIBRARY.md`.
2. Remains functional for one sprint (not broken, just scheduled for removal).
3. Is replaced in the same PR as its removal (never leave callers broken).

### Database Columns

A deprecated column:
1. Is marked with a comment in the schema: `-- DEPRECATED: use {new_column} instead`.
2. Remains present for two release cycles.
3. Is removed via a migration that first confirms no active queries reference it.
