-- Migration: Event-Driven Automation Platform (Phase 8)
-- Creates 4 tables for the automation platform.
-- Idempotent via IF NOT EXISTS — safe to re-run.
-- Apply: psql $DATABASE_URL -f scripts/migrate-automation-platform.sql

-- ── 1. automation_triggers ────────────────────────────────────────────────────
-- One row per trigger: maps an event_id to a workflow_id with optional conditions.

CREATE TABLE IF NOT EXISTS automation_triggers (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  event_id     TEXT        NOT NULL,           -- e.g. 'github.pr.opened'
  workflow_id  TEXT        NOT NULL,           -- e.g. 'pr-review'
  enabled      BOOLEAN     NOT NULL DEFAULT true,
  conditions   JSONB       NOT NULL DEFAULT '{}',   -- ConditionEvaluator format
  param_mapping JSONB      NOT NULL DEFAULT '{}',   -- PayloadTransformer format
  priority     TEXT        NOT NULL DEFAULT 'NORMAL',
  rate_limit   JSONB       NOT NULL DEFAULT '{}',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_triggers_workspace ON automation_triggers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_event     ON automation_triggers(event_id);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_enabled   ON automation_triggers(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_automation_triggers_workflow  ON automation_triggers(workflow_id);

-- ── 2. automation_executions ──────────────────────────────────────────────────
-- Event Timeline: every trigger evaluation is recorded here.

CREATE TABLE IF NOT EXISTS automation_executions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_id      UUID        REFERENCES automation_triggers(id) ON DELETE SET NULL,
  workspace_id    TEXT        NOT NULL,
  event_id        TEXT        NOT NULL,
  event_source_id TEXT,                        -- Provider delivery ID
  workflow_id     TEXT        NOT NULL,
  execution_id    TEXT,                        -- RuntimeEngine execution ID
  status          TEXT        NOT NULL DEFAULT 'PENDING',
    -- PENDING | STARTED | COMPLETED | FAILED | SKIPPED | RATE_LIMITED
  params          JSONB       NOT NULL DEFAULT '{}',
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_exec_workspace  ON automation_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_exec_trigger    ON automation_executions(trigger_id);
CREATE INDEX IF NOT EXISTS idx_automation_exec_status     ON automation_executions(status);
CREATE INDEX IF NOT EXISTS idx_automation_exec_started    ON automation_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_exec_exec_id    ON automation_executions(execution_id) WHERE execution_id IS NOT NULL;

-- ── 3. webhook_deliveries ─────────────────────────────────────────────────────
-- Audit log for every incoming webhook — persisted before processing.

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id        TEXT,
  connector           TEXT        NOT NULL,
  delivery_id         TEXT,                    -- Provider's delivery/event ID
  signature_verified  BOOLEAN     NOT NULL DEFAULT false,
  payload             JSONB       NOT NULL DEFAULT '{}',
  headers             JSONB       NOT NULL DEFAULT '{}',
  event_id            TEXT,
  status              TEXT        NOT NULL DEFAULT 'RECEIVED',
    -- RECEIVED | PROCESSED | FAILED | DUPLICATE
  error               TEXT,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_connector   ON webhook_deliveries(connector);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace   ON webhook_deliveries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivery_id ON webhook_deliveries(delivery_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_received    ON webhook_deliveries(received_at DESC);

-- ── 4. scheduled_jobs ─────────────────────────────────────────────────────────
-- Durable records for automation scheduled jobs (BullMQ-backed).

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id        TEXT        NOT NULL,
  name                TEXT        NOT NULL,
  event_id            TEXT        NOT NULL,    -- Which automation event to publish
  payload             JSONB       NOT NULL DEFAULT '{}',
  schedule_type       TEXT        NOT NULL,    -- CRON | DELAY | RECURRING
  cron_expression     TEXT,
  delay_ms            BIGINT,
  timezone            TEXT        NOT NULL DEFAULT 'UTC',
  business_hours_only BOOLEAN     NOT NULL DEFAULT false,
  enabled             BOOLEAN     NOT NULL DEFAULT true,
  last_fired_at       TIMESTAMPTZ,
  next_fire_at        TIMESTAMPTZ,
  bull_job_id         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_workspace ON scheduled_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled   ON scheduled_jobs(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_event     ON scheduled_jobs(event_id);

-- ── 5. updated_at triggers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION automation_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_automation_triggers_updated_at    ON automation_triggers;
CREATE TRIGGER trg_automation_triggers_updated_at
  BEFORE UPDATE ON automation_triggers FOR EACH ROW EXECUTE FUNCTION automation_set_updated_at();

DROP TRIGGER IF EXISTS trg_automation_executions_updated_at  ON automation_executions;
CREATE TRIGGER trg_automation_executions_updated_at
  BEFORE UPDATE ON automation_executions FOR EACH ROW EXECUTE FUNCTION automation_set_updated_at();

DROP TRIGGER IF EXISTS trg_scheduled_jobs_updated_at         ON scheduled_jobs;
CREATE TRIGGER trg_scheduled_jobs_updated_at
  BEFORE UPDATE ON scheduled_jobs FOR EACH ROW EXECUTE FUNCTION automation_set_updated_at();

-- Done.
-- Apply: psql $DATABASE_URL -f scripts/migrate-automation-platform.sql
-- Then:  npx prisma generate (NOT prisma migrate dev)
