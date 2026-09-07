-- FLOW OS — Long-Running Workflow Orchestration (Phase 9)
-- Idempotent — safe to re-run.
-- Apply: psql $DATABASE_URL -f scripts/migrate-workflow-orchestration.sql
--
-- New tables:
--   workflow_wait_states       — durable wait registrations (event/timer/callback/date)
--   workflow_timers            — BullMQ-backed timer registry
--   workflow_compensation_log  — Saga compensation audit trail
--   workflow_checkpoint_history — append-only checkpoint history
--
-- Extends:
--   workflow_executions.status CHECK — adds WAITING_TIMER, WAITING_CALLBACK,
--                                       WAITING_DATE, WAITING_MULTI_EVENT

BEGIN;

-- ── 1. Extend workflow_executions status to include new wait states ─────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_executions'
  ) THEN
    ALTER TABLE workflow_executions
      DROP CONSTRAINT IF EXISTS workflow_executions_status_check;

    ALTER TABLE workflow_executions
      ADD CONSTRAINT workflow_executions_status_check
      CHECK (status IN (
        'PLANNING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'WAITING_APPROVAL',
        'WAITING_EVENT',
        'WAITING_TIMER',
        'WAITING_CALLBACK',
        'WAITING_DATE',
        'WAITING_MULTI_EVENT',
        'CANCELLED',
        'PAUSED'
      ));
  END IF;
END $$;

-- ── 2. workflow_wait_states ────────────────────────────────────────────────────
-- One row per active wait for each execution.
-- A workflow can have at most one PENDING wait at a time.
-- wait_type: EVENT | TIMER | CALLBACK | DATE | DURATION | BUSINESS_HOURS | MULTI_EVENT

CREATE TABLE IF NOT EXISTS workflow_wait_states (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  execution_id     TEXT        NOT NULL
                               REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workspace_id     TEXT        NOT NULL,
  step_id          TEXT        NOT NULL,
  wait_type        TEXT        NOT NULL,
  -- EVENT waits
  event_type       TEXT,
  event_filter     JSONB,
  -- DATE / DURATION / TIMER waits
  resume_after     TIMESTAMPTZ,
  -- CALLBACK waits
  callback_token   TEXT        UNIQUE,
  -- MULTI_EVENT waits
  required_events  JSONB,   -- array of {eventType, filter}
  received_events  JSONB    NOT NULL DEFAULT '[]',
  -- Lifecycle
  status           TEXT        NOT NULL DEFAULT 'PENDING',
    -- PENDING | RESOLVED | EXPIRED | CANCELLED
  timeout_at       TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  resolved_with    JSONB,
  -- BullMQ timer job that will fire when resume_after / timeout_at is reached
  timer_job_id     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_wait_states_wait_type_check CHECK (
    wait_type IN ('EVENT','TIMER','CALLBACK','DATE','DURATION','BUSINESS_HOURS','MULTI_EVENT')
  ),
  CONSTRAINT workflow_wait_states_status_check CHECK (
    status IN ('PENDING','RESOLVED','EXPIRED','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_wws_execution
  ON workflow_wait_states(execution_id);
CREATE INDEX IF NOT EXISTS idx_wws_workspace_status
  ON workflow_wait_states(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_wws_event_type
  ON workflow_wait_states(event_type) WHERE status = 'PENDING' AND event_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wws_resume_after
  ON workflow_wait_states(resume_after) WHERE status = 'PENDING' AND resume_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wws_callback_token
  ON workflow_wait_states(callback_token) WHERE callback_token IS NOT NULL;

-- ── 3. workflow_timers ─────────────────────────────────────────────────────────
-- Durable registry of all scheduled timers.
-- BullMQ is the scheduler; this table is the audit trail + recovery source.
-- timer_type: RESUME | TIMEOUT | REMINDER | ESCALATION | RECURRING

CREATE TABLE IF NOT EXISTS workflow_timers (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  execution_id   TEXT        NOT NULL
                             REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workspace_id   TEXT        NOT NULL,
  wait_state_id  TEXT        REFERENCES workflow_wait_states(id) ON DELETE CASCADE,
  timer_type     TEXT        NOT NULL DEFAULT 'RESUME',
  fire_at        TIMESTAMPTZ NOT NULL,
  recurrence_cron TEXT,
  max_recurrences INT,
  fire_count     INT         NOT NULL DEFAULT 0,
  bull_job_id    TEXT,
  status         TEXT        NOT NULL DEFAULT 'PENDING',
    -- PENDING | FIRED | CANCELLED | EXPIRED
  fired_at       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_timers_type_check CHECK (
    timer_type IN ('RESUME','TIMEOUT','REMINDER','ESCALATION','RECURRING')
  ),
  CONSTRAINT workflow_timers_status_check CHECK (
    status IN ('PENDING','FIRED','CANCELLED','EXPIRED')
  )
);

CREATE INDEX IF NOT EXISTS idx_wt_execution   ON workflow_timers(execution_id);
CREATE INDEX IF NOT EXISTS idx_wt_fire_at     ON workflow_timers(fire_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_wt_bull_job_id ON workflow_timers(bull_job_id) WHERE bull_job_id IS NOT NULL;

-- ── 4. workflow_compensation_log ────────────────────────────────────────────────
-- Saga pattern: every reversible step registers its compensation action here.
-- On failure, CompensationManager executes them in reverse order.

CREATE TABLE IF NOT EXISTS workflow_compensation_log (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  execution_id   TEXT        NOT NULL
                             REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workspace_id   TEXT        NOT NULL,
  step_id        TEXT        NOT NULL,
  step_name      TEXT        NOT NULL,
  -- The compensation action (connector action to undo the step)
  connector_id   TEXT        NOT NULL,
  action_type    TEXT        NOT NULL,
  payload        JSONB,
  -- Execution outcome
  status         TEXT        NOT NULL DEFAULT 'REGISTERED',
    -- REGISTERED | EXECUTING | COMPLETED | FAILED | SKIPPED
  error          TEXT,
  -- Ordering: compensations run in reverse sequence_num order
  sequence_num   INT         NOT NULL,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at    TIMESTAMPTZ,
  CONSTRAINT workflow_comp_status_check CHECK (
    status IN ('REGISTERED','EXECUTING','COMPLETED','FAILED','SKIPPED')
  )
);

CREATE INDEX IF NOT EXISTS idx_wcl_execution
  ON workflow_compensation_log(execution_id, sequence_num DESC);
CREATE INDEX IF NOT EXISTS idx_wcl_status
  ON workflow_compensation_log(execution_id, status);

-- ── 5. workflow_checkpoint_history ─────────────────────────────────────────────
-- Append-only history of all checkpoints (workflow_runtime_checkpoints keeps only latest).
-- Used by WorkflowInspector for timeline reconstruction.

CREATE TABLE IF NOT EXISTS workflow_checkpoint_history (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  execution_id   TEXT        NOT NULL
                             REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workspace_id   TEXT        NOT NULL,
  sequence_num   INT         NOT NULL,
  step_id        TEXT,
  context        JSONB       NOT NULL,
  saved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wch_execution
  ON workflow_checkpoint_history(execution_id, sequence_num ASC);
CREATE INDEX IF NOT EXISTS idx_wch_saved_at
  ON workflow_checkpoint_history(saved_at DESC);

-- ── 6. updated_at function (shared) ──────────────────────────────────────────
-- Reuse if the function already exists.

CREATE OR REPLACE FUNCTION orch_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Apply: psql $DATABASE_URL -f scripts/migrate-workflow-orchestration.sql
-- Then:  npx prisma generate (NOT prisma migrate dev)
