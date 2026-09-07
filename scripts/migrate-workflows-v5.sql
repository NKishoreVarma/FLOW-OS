-- FLOW OS — Workflow Engine Migration (Phase 5)
-- Idempotent — safe to re-run.
-- Apply: psql $DATABASE_URL -f scripts/migrate-workflows-v5.sql

BEGIN;

-- ── workflow_executions ───────────────────────────────────────────────────────
-- One row per workflow run. The plan is stored as JSONB for replay/audit.

CREATE TABLE IF NOT EXISTS workflow_executions (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   TEXT        NOT NULL,
  org_id         TEXT,
  workflow_id    TEXT        NOT NULL,
  workflow_name  TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'PLANNING',
  plan           JSONB,
  results        JSONB,
  approval_id    TEXT,
  started_by     TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  error          TEXT,
  CONSTRAINT workflow_executions_status_check CHECK (
    status IN ('PLANNING','RUNNING','COMPLETED','FAILED','WAITING_APPROVAL','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workspace
  ON workflow_executions(workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
  ON workflow_executions(workspace_id, status);

-- ── workflow_step_executions ──────────────────────────────────────────────────
-- One row per step within a workflow run.

CREATE TABLE IF NOT EXISTS workflow_step_executions (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id   TEXT        NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id       TEXT        NOT NULL,
  step_name     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'PENDING',
  input         JSONB,
  output        JSONB,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  duration_ms   INTEGER,
  approval_id   TEXT,
  CONSTRAINT workflow_step_status_check CHECK (
    status IN ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED','RETRYING')
  )
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_executions_workflow
  ON workflow_step_executions(workflow_id, started_at ASC NULLS LAST);

COMMIT;
