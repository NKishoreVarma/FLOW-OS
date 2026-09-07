-- Migration: Action Registry v1.0
-- Phase 7 — Gmail + Jira Workflow Pack
--
-- Creates three tables:
--   action_definitions      — canonical action metadata (one row per action id)
--   action_versions_active  — view: latest GA/BETA row per id
--   action_usage_stats      — per-action execution counters
--
-- Safe to re-run (all DDL is idempotent via IF NOT EXISTS / OR REPLACE).

-- ── 1. action_definitions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS action_definitions (
  id               TEXT        NOT NULL,
  version          TEXT        NOT NULL,
  lifecycle        TEXT        NOT NULL DEFAULT 'GA',      -- GA | BETA | DEPRECATED | REMOVED
  connector        TEXT        NOT NULL,
  category         TEXT        NOT NULL,
  display_name     TEXT        NOT NULL,
  description      TEXT        NOT NULL DEFAULT '',
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  risk_level       TEXT        NOT NULL DEFAULT 'LOW',     -- LOW | MEDIUM | HIGH | CRITICAL
  approval_policy  JSONB       NOT NULL DEFAULT '{}',
  required_permissions TEXT[]  NOT NULL DEFAULT '{}',
  required_scopes  TEXT[]      NOT NULL DEFAULT '{}',
  execution_mode   TEXT        NOT NULL DEFAULT 'SYNC',    -- SYNC | ASYNC | STREAMING
  estimated_duration_ms INT    NOT NULL DEFAULT 0,
  timeout_ms       INT         NOT NULL DEFAULT 30000,
  retry_strategy   JSONB       NOT NULL DEFAULT '{}',
  rollback_strategy JSONB      NOT NULL DEFAULT '{}',
  verification_strategy JSONB  NOT NULL DEFAULT '{}',
  required_inputs  JSONB       NOT NULL DEFAULT '[]',
  optional_inputs  JSONB       NOT NULL DEFAULT '[]',
  output_schema    JSONB       NOT NULL DEFAULT '{}',
  audit_metadata   JSONB       NOT NULL DEFAULT '{}',
  telemetry_metadata JSONB     NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_action_definitions_connector  ON action_definitions(connector);
CREATE INDEX IF NOT EXISTS idx_action_definitions_category   ON action_definitions(category);
CREATE INDEX IF NOT EXISTS idx_action_definitions_risk_level ON action_definitions(risk_level);
CREATE INDEX IF NOT EXISTS idx_action_definitions_lifecycle  ON action_definitions(lifecycle);

-- ── 2. active view (latest non-removed version per id) ───────────────────────

CREATE OR REPLACE VIEW action_versions_active AS
SELECT DISTINCT ON (id)
  id, version, lifecycle, connector, category,
  display_name, description, tags, risk_level,
  approval_policy, required_permissions, required_scopes,
  execution_mode, estimated_duration_ms, timeout_ms,
  retry_strategy, rollback_strategy, verification_strategy,
  required_inputs, optional_inputs, output_schema,
  audit_metadata, telemetry_metadata,
  created_at, updated_at
FROM action_definitions
WHERE lifecycle != 'REMOVED'
ORDER BY id, version DESC;

-- ── 3. action_usage_stats ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS action_usage_stats (
  action_id        TEXT        NOT NULL,
  workspace_id     TEXT        NOT NULL,
  total_executions BIGINT      NOT NULL DEFAULT 0,
  total_successes  BIGINT      NOT NULL DEFAULT 0,
  total_failures   BIGINT      NOT NULL DEFAULT 0,
  total_denials    BIGINT      NOT NULL DEFAULT 0,
  avg_duration_ms  DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (action_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_action_usage_workspace ON action_usage_stats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_action_usage_action    ON action_usage_stats(action_id);

-- ── 4. updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_action_definitions_updated_at ON action_definitions;
CREATE TRIGGER trg_action_definitions_updated_at
  BEFORE UPDATE ON action_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_action_usage_updated_at ON action_usage_stats;
CREATE TRIGGER trg_action_usage_updated_at
  BEFORE UPDATE ON action_usage_stats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Done.
-- Apply: psql $DATABASE_URL -f scripts/migrate-action-registry.sql
