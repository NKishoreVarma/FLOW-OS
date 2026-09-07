-- Phase 13 — Autonomous Enterprise Engine
-- Idempotent: safe to re-run. Does not touch any existing tables.
-- Apply: psql $DATABASE_URL -f scripts/migrate-autonomy-v13.sql
-- Then:  npx prisma generate

-- ── autonomy_goals ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomy_goals (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT        NOT NULL,
  org_id          TEXT        NOT NULL DEFAULT '',
  title           TEXT        NOT NULL,
  description     TEXT,
  category        TEXT        NOT NULL DEFAULT 'general',
  priority        TEXT        NOT NULL DEFAULT 'MEDIUM',
  owner           TEXT,
  current_progress NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (current_progress BETWEEN 0 AND 100),
  target_value    NUMERIC(12,2),
  current_value   NUMERIC(12,2),
  unit            TEXT,
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  deadline        TIMESTAMPTZ,
  success_metrics JSONB        NOT NULL DEFAULT '[]',
  dependencies    JSONB        NOT NULL DEFAULT '[]',
  status          TEXT        NOT NULL DEFAULT 'ACTIVE',
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_goals_workspace ON autonomy_goals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_goals_status    ON autonomy_goals(status);
CREATE INDEX IF NOT EXISTS idx_autonomy_goals_category  ON autonomy_goals(category);

-- ── autonomy_opportunities ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomy_opportunities (
  id                     TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id           TEXT         NOT NULL,
  title                  TEXT         NOT NULL,
  description            TEXT,
  category               TEXT         NOT NULL DEFAULT 'general',
  estimated_value_usd    NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_hours_saved  NUMERIC(8,2)  NOT NULL DEFAULT 0,
  confidence             NUMERIC(4,3)  NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  status                 TEXT         NOT NULL DEFAULT 'OPEN',
  suggested_workflow_id  TEXT,
  suggested_workflow     JSONB        NOT NULL DEFAULT '{}',
  business_impact        TEXT,
  owner                  TEXT,
  evidence               JSONB        NOT NULL DEFAULT '[]',
  discovered_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ,
  actioned_at            TIMESTAMPTZ,
  metadata               JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_autonomy_opportunities_workspace ON autonomy_opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_opportunities_status    ON autonomy_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_autonomy_opportunities_category  ON autonomy_opportunities(category);

-- ── autonomy_learning_records ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomy_learning_records (
  id                      TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id            TEXT         NOT NULL,
  recommendation_id       TEXT,
  recommendation_type     TEXT         NOT NULL,
  recommendation_summary  TEXT,
  decision                TEXT         NOT NULL DEFAULT 'PENDING',
  executed_workflow_id    TEXT,
  outcome                 TEXT,
  success_score           NUMERIC(4,3),
  business_impact_usd     NUMERIC(12,2),
  time_saved_minutes      INTEGER,
  confidence_before       NUMERIC(4,3),
  confidence_after        NUMERIC(4,3),
  feedback                TEXT,
  tags                    JSONB        NOT NULL DEFAULT '[]',
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autonomy_learning_workspace ON autonomy_learning_records(workspace_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_learning_type      ON autonomy_learning_records(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_autonomy_learning_outcome   ON autonomy_learning_records(outcome);

-- ── autonomy_policies ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomy_policies (
  id                    TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id          TEXT          NOT NULL,
  scope                 TEXT          NOT NULL DEFAULT 'workspace',
  scope_id              TEXT,
  autonomy_level        INTEGER       NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 5),
  max_risk_level        TEXT          NOT NULL DEFAULT 'LOW',
  require_human_review  BOOLEAN       NOT NULL DEFAULT TRUE,
  max_cost_per_run_usd  NUMERIC(10,2) NOT NULL DEFAULT 0,
  allowed_connectors    JSONB         NOT NULL DEFAULT '[]',
  blocked_action_ids    JSONB         NOT NULL DEFAULT '[]',
  schedule_cron         TEXT,
  run_interval_ms       INTEGER       NOT NULL DEFAULT 900000,
  enabled               BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_autonomy_policies_ws_scope
  ON autonomy_policies(workspace_id, scope, COALESCE(scope_id, ''));

CREATE INDEX IF NOT EXISTS idx_autonomy_policies_workspace ON autonomy_policies(workspace_id);

-- ── autonomy_runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomy_runs (
  id                        TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id              TEXT        NOT NULL,
  triggered_by              TEXT        NOT NULL DEFAULT 'schedule',
  status                    TEXT        NOT NULL DEFAULT 'RUNNING',
  opportunities_found       INTEGER     NOT NULL DEFAULT 0,
  risks_found               INTEGER     NOT NULL DEFAULT 0,
  recommendations_generated INTEGER     NOT NULL DEFAULT 0,
  workflows_submitted       INTEGER     NOT NULL DEFAULT 0,
  workflows_completed       INTEGER     NOT NULL DEFAULT 0,
  duration_ms               INTEGER,
  error                     TEXT,
  summary                   JSONB       NOT NULL DEFAULT '{}',
  started_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autonomy_runs_workspace   ON autonomy_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_runs_status      ON autonomy_runs(status);
CREATE INDEX IF NOT EXISTS idx_autonomy_runs_started_at  ON autonomy_runs(started_at DESC);

-- ── Default workspace-level policy (level 1 = recommend only) ─────────────────
-- Insert only if no policy exists for a workspace (handled by app at first run,
-- not pre-seeded here since workspace IDs are runtime values).
