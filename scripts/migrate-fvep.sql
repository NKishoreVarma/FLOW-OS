-- FVEP — Validation & Evaluation Platform migration
-- Safe to re-run (idempotent). Does NOT touch any existing tables.

CREATE TABLE IF NOT EXISTS fvep_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   TEXT NOT NULL,
  run_type       TEXT NOT NULL DEFAULT 'manual', -- manual | scheduled | regression | release
  status         TEXT NOT NULL DEFAULT 'running', -- running | passed | failed | error
  quality_score  NUMERIC(5,2),
  domains_passed INT DEFAULT 0,
  domains_total  INT DEFAULT 0,
  release_version TEXT,
  triggered_by   TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  summary        JSONB
);

CREATE INDEX IF NOT EXISTS fvep_runs_workspace_idx ON fvep_runs (workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS fvep_runs_status_idx    ON fvep_runs (status);

CREATE TABLE IF NOT EXISTS fvep_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES fvep_runs(id) ON DELETE CASCADE,
  domain         TEXT NOT NULL,
  status         TEXT NOT NULL, -- passed | warning | failed | insufficient_data
  score          NUMERIC(5,2),
  threshold      NUMERIC(5,2),
  metrics        JSONB NOT NULL DEFAULT '{}',
  findings       TEXT[] DEFAULT '{}',
  evaluated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fvep_results_run_idx    ON fvep_results (run_id);
CREATE INDEX IF NOT EXISTS fvep_results_domain_idx ON fvep_results (domain, evaluated_at DESC);

-- Trend view: last 10 scores per domain across all workspaces
CREATE OR REPLACE VIEW fvep_domain_trends AS
SELECT
  r.workspace_id,
  res.domain,
  res.score,
  res.status,
  res.evaluated_at,
  ROW_NUMBER() OVER (PARTITION BY r.workspace_id, res.domain ORDER BY res.evaluated_at DESC) AS rn
FROM fvep_results res
JOIN fvep_runs r ON r.id = res.run_id
WHERE r.status IN ('passed', 'failed');
