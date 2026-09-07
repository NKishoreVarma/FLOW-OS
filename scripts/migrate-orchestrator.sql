-- Model Orchestrator migration — idempotent, safe to re-run.
-- Tables: prompt_versions, model_requests
-- Run with: psql $DATABASE_URL -f scripts/migrate-orchestrator.sql

-- ── Prompt Versions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  version     INT         NOT NULL,
  content     TEXT        NOT NULL,
  description TEXT,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  active      BOOLEAN     NOT NULL DEFAULT false,
  ab_weight   NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prompt_versions_name_version_unique UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS prompt_versions_name_active_idx
  ON prompt_versions (name, active) WHERE active = true;

-- ── Model Requests (per-request telemetry) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       TEXT        NOT NULL,
  model          TEXT,
  task_type      TEXT,
  workspace_id   TEXT,
  latency_ms     INT,
  input_tokens   INT,
  output_tokens  INT,
  cost_usd       NUMERIC(12,8),
  status         TEXT        NOT NULL DEFAULT 'success', -- success | error | fallback | cached
  cached         BOOLEAN     NOT NULL DEFAULT false,
  fallback_from  TEXT,                                   -- original provider that failed
  prompt_id      UUID        REFERENCES prompt_versions(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS model_requests_provider_created_idx
  ON model_requests (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS model_requests_workspace_created_idx
  ON model_requests (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS model_requests_task_created_idx
  ON model_requests (task_type, created_at DESC)
  WHERE task_type IS NOT NULL;

-- Hourly cost summary view for the dashboard trend chart
CREATE OR REPLACE VIEW model_requests_hourly AS
  SELECT
    DATE_TRUNC('hour', created_at)  AS hour,
    provider,
    COUNT(*)::int                   AS requests,
    SUM(cost_usd)::numeric          AS cost_usd,
    AVG(latency_ms)::int            AS avg_latency_ms,
    SUM(CASE WHEN status = 'error'  THEN 1 ELSE 0 END)::int AS errors,
    SUM(CASE WHEN cached            THEN 1 ELSE 0 END)::int AS cache_hits
  FROM model_requests
  GROUP BY 1, 2;
