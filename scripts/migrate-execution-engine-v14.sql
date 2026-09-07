-- FLOW OS — Phase 14 Operational Execution Engine migration
-- Idempotent. Apply with:  psql "$DATABASE_URL" -f scripts/migrate-execution-engine-v14.sql
-- Then:  npx prisma generate   (do NOT run prisma migrate dev)
-- Does not touch workspace_intel_chunks.

-- ── pending_approvals: risk-tiered approval (additive) ───────────────────────
ALTER TABLE "pending_approvals"
  ADD COLUMN IF NOT EXISTS "risk_level"         TEXT,
  ADD COLUMN IF NOT EXISTS "required_approvals" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "approval_votes"     JSONB   NOT NULL DEFAULT '[]';

-- ── execution_records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "execution_records" (
  "id"                 TEXT PRIMARY KEY,
  "org_id"             TEXT NOT NULL,
  "workspace_id"       TEXT NOT NULL,
  "plan_id"            TEXT,
  "requested_by_id"    TEXT,
  "executed_by_id"     TEXT,
  "approver_ids"       JSONB NOT NULL DEFAULT '[]',
  "connector"          TEXT NOT NULL,
  "action_type"        TEXT NOT NULL,
  "risk_level"         TEXT NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'PENDING',
  "summary"            TEXT,
  "result"             JSONB NOT NULL DEFAULT '{}',
  "duration_ms"        INTEGER,
  "rollback_available" BOOLEAN NOT NULL DEFAULT false,
  "rolled_back"        BOOLEAN NOT NULL DEFAULT false,
  "approval_id"        TEXT,
  "timeline_event_id"  TEXT,
  "audit_log_id"       TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "execution_records_ws_created_idx" ON "execution_records" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "execution_records_org_status_idx" ON "execution_records" ("org_id", "status");

-- ── notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"              TEXT PRIMARY KEY,
  "org_id"          TEXT NOT NULL,
  "workspace_id"    TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "priority"        INTEGER NOT NULL DEFAULT 50,
  "title"           TEXT NOT NULL,
  "body"            TEXT,
  "actions"         JSONB NOT NULL DEFAULT '[]',
  "dedupe_key"      TEXT,
  "recipients"      JSONB NOT NULL DEFAULT '[]',
  "read_by"         JSONB NOT NULL DEFAULT '[]',
  "source_event_id" TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "notifications_ws_created_idx" ON "notifications" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "notifications_ws_dedupe_idx" ON "notifications" ("workspace_id", "dedupe_key");
