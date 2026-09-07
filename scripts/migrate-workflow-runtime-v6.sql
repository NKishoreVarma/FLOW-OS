-- FLOW OS — Universal Workflow Runtime Migration (Phase 6)
-- Idempotent — safe to re-run.
-- Apply: psql $DATABASE_URL -f scripts/migrate-workflow-runtime-v6.sql
--
-- Changes:
--   1. Extend workflow_executions status check to include PAUSED
--   2. Add workflow_runtime_checkpoints table (one row per live execution)

BEGIN;

-- ── 1. Extend status enum on workflow_executions ─────────────────────────────
-- Drop + recreate CHECK constraint to add PAUSED (PostgreSQL doesn't have ALTER CONSTRAINT).
-- workflow_executions was created in migrate-workflows-v5.sql.

DO $$
BEGIN
  -- Only run if the table exists (idempotency)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_executions') THEN
    -- Drop the existing status check (name matches what v5 created)
    ALTER TABLE workflow_executions
      DROP CONSTRAINT IF EXISTS workflow_executions_status_check;

    -- Re-add with PAUSED included
    ALTER TABLE workflow_executions
      ADD CONSTRAINT workflow_executions_status_check
      CHECK (status IN (
        'PLANNING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'WAITING_APPROVAL',
        'CANCELLED',
        'PAUSED'
      ));
  END IF;
END $$;

-- ── 2. workflow_runtime_checkpoints ──────────────────────────────────────────
-- Stores the full RuntimeContext JSON for each live execution.
-- Written after every step; deleted when the execution reaches a terminal state.
-- Used by recoverStaleExecutions() on server restart.

CREATE TABLE IF NOT EXISTS workflow_runtime_checkpoints (
  execution_id  TEXT        PRIMARY KEY
                            REFERENCES workflow_executions(id) ON DELETE CASCADE,
  context       JSONB       NOT NULL,
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wrc_saved_at
  ON workflow_runtime_checkpoints(saved_at DESC);

COMMIT;
