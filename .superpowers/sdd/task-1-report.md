# Task 1 Report — Prisma Schema: Phase 7 Brain Models

**Status:** DONE_WITH_CONCERNS

---

## Files Modified / Created

- **Modified:** `prisma/schema.prisma`
  - Added 4 new relations to `Organization` model: `orgMemory`, `graphNodes`, `goals`, `automationRules`
  - Appended 7 new models: `OrgMemoryRecord`, `GraphNode`, `GraphEdge`, `Goal`, `GoalMilestone`, `AutomationRule`, `AutomationRun`
  - Appended 2 new enums: `MemoryRecordType`, `GoalStatus`

- **Created:** `prisma/migrations/20260628000000_phase7_brain/migration.sql`
  - Hand-crafted SQL covering only the Phase 7 additions (enums, tables, indexes, foreign keys)

---

## Migration Outcome

**Skipped (DB drift detected)**

`npx prisma migrate dev --name phase7_brain` and `--create-only` both failed with:

> "Drift detected: Your database schema is not in sync with your migration history."

Root cause: the governance tables (`workspace_members`, `policies`, `pending_approvals`, plus `audit_logs` column additions) were applied via `scripts/migrate-governance-5-3-b.sql` directly to the database, bypassing Prisma's migration history. Prisma treats this as drift and refuses to proceed without a reset.

**Resolution applied:**
1. Used `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` to validate the full schema produces valid SQL.
2. Manually created `prisma/migrations/20260628000000_phase7_brain/migration.sql` containing only the Phase 7 net-new DDL.
3. Ran `npx prisma generate` — **succeeded** (Prisma Client v7.8.0 regenerated in 108ms).

**Command to apply when DB is available and drift is resolved:**

Option A — reset dev DB (destructive, loses data):
```bash
npx prisma migrate reset
```

Option B — mark the drift as resolved, then apply Phase 7 migration (safe for production-like envs):
```bash
# 1. Baseline the existing state into migration history
npx prisma migrate resolve --applied 20260620132028_init_platform_foundation
# 2. Apply governance SQL manually if not already done
psql $DATABASE_URL -f scripts/migrate-governance-5-3-b.sql
# 3. Mark governance migration as applied (create a migration entry)
# 4. Apply Phase 7 migration
psql $DATABASE_URL -f prisma/migrations/20260628000000_phase7_brain/migration.sql
```

---

## Self-Review Findings

1. **No conflicts with existing models.** New table names (`org_memory_records`, `graph_nodes`, `graph_edges`, `goals`, `goal_milestones`, `automation_rules`, `automation_runs`) do not collide with any existing Prisma-managed tables.

2. **Enum isolation verified.** New enums `MemoryRecordType` and `GoalStatus` do not overlap with existing enums (`Role`, `PolicyEffect`, `ApprovalStatus`, `AgentType`).

3. **Both sides of all relations declared.** Every back-relation is present:
   - `Organization` → `orgMemory: OrgMemoryRecord[]` / `graphNodes: GraphNode[]` / `goals: Goal[]` / `automationRules: AutomationRule[]`
   - `GraphNode.outEdges`/`inEdges` named relations `"EdgeSource"` / `"EdgeTarget"` match `GraphEdge.source`/`target`
   - `Goal.milestones ↔ GoalMilestone.goal`
   - `AutomationRule.runs ↔ AutomationRun.rule`

4. **`GoalStatus.BLOCKED` enum value.** The brief defines this value. Note it is a string, not a collision with `PendingApproval`'s `ApprovalStatus` enum — they are distinct types.

5. **`GraphNode.id` is caller-supplied** (no `@default(cuid())`). This is intentional: IDs like `"user:github:davidO"` are constructed by the graph service. Services consuming this model must supply the ID; Prisma will not auto-generate it.

6. **`AutomationRun.status` is a plain `String`** rather than an enum. This matches the brief's design intent (extensible status strings without a migration to add values) and is consistent with existing patterns in the codebase (`syncStatus`, `provider` fields).

---

## Concerns

1. **DB drift is a growing tech debt item.** Three migrations now exist outside Prisma history (`scripts/migrate-governance-5-3-b.sql` + the Phase 7 manual SQL). Recommend scheduling a `prisma migrate resolve` baseline pass before the next sprint.

2. **`GoalStatus.BLOCKED` conflicts semantically with PendingApproval status names** but not structurally (different enum types). Worth noting for future schema readers.

3. **`GraphNode.updatedAt` requires `@updatedAt`** — Prisma handles this automatically, but since `graph_nodes` is often upserted (not just inserted), the service layer should use `prisma.graphNode.upsert()` not raw `INSERT` to get auto-timestamps.

---

## Fix Applied

- Added orgId + Organization relation to GraphEdge
- Added orgId + Organization relation to AutomationRun
- Added graphEdges and automationRuns back-relations to Organization
- Updated migration SQL with ALTER TABLE statements for both tables
- npx prisma generate: success
