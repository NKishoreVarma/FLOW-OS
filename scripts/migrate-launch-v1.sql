-- scripts/migrate-launch-v1.sql
-- v1.0 Launch Program tables. Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). Additive only.

-- ── Design Partners (Program 1) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_partners (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        TEXT         NOT NULL,
  industry            TEXT         NOT NULL DEFAULT 'SaaS',
  contact_name        TEXT,
  contact_email       TEXT,
  status              TEXT         NOT NULL DEFAULT 'pre-pilot'
                      CHECK (status IN ('pre-pilot','onboarding','pilot','converting','converted','churned')),
  health_score        INT          DEFAULT 80 CHECK (health_score BETWEEN 0 AND 100),
  tool_stack          TEXT[]       NOT NULL DEFAULT '{}',
  business_goals      TEXT[]       NOT NULL DEFAULT '{}',
  pain_points         TEXT[]       NOT NULL DEFAULT '{}',
  success_metrics     TEXT[]       NOT NULL DEFAULT '{}',
  deployment_timeline TEXT,
  workspace_id        TEXT,
  mrr_usd             INT          DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_partners_status
  ON design_partners (status, created_at DESC);

-- ── Partner Weekly Reviews (Program 1) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_reviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    UUID        NOT NULL REFERENCES design_partners(id) ON DELETE CASCADE,
  week_of       DATE        NOT NULL,
  summary       TEXT,
  dau           INT         DEFAULT 0,
  actions_taken INT         DEFAULT 0,
  sentiment     TEXT        DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative')),
  blockers      TEXT[]      DEFAULT '{}',
  next_steps    TEXT[]      DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_reviews_partner
  ON partner_reviews (partner_id, week_of DESC);

-- ── Extended Feedback (Program 9) ─────────────────────────────────────────────
-- Adds typed/prioritized feedback on top of the existing pilot_feedback table.
CREATE TABLE IF NOT EXISTS feedback_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT        NOT NULL,
  user_id       TEXT,
  type          TEXT        NOT NULL DEFAULT 'general'
                CHECK (type IN ('bug','feature_request','conversation_rating','workflow_rating',
                                'recommendation_rating','brief_rating','general','complaint')),
  subject       TEXT        NOT NULL DEFAULT '',
  description   TEXT,
  rating        INT         CHECK (rating BETWEEN 1 AND 5),
  priority      TEXT        NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('critical','high','medium','low')),
  status        TEXT        NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','triaged','in_progress','resolved','wont_fix')),
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_workspace
  ON feedback_items (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_items_priority
  ON feedback_items (priority, status, created_at DESC);

-- ── ROI Reports (Program 7) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roi_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT        NOT NULL,
  period_type   TEXT        NOT NULL CHECK (period_type IN ('weekly','monthly','quarterly')),
  period_label  TEXT        NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  report        JSONB       NOT NULL DEFAULT '{}',
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roi_reports_workspace
  ON roi_reports (workspace_id, period_type, period_start DESC);

-- ── Connector Certification (Program 2) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS connector_certifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id    TEXT        NOT NULL,
  workspace_id    TEXT        NOT NULL,
  score           INT         NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  grade           TEXT        NOT NULL DEFAULT 'F'
                  CHECK (grade IN ('A+','A','B','C','D','F')),
  checks          JSONB       NOT NULL DEFAULT '{}',
  certified       BOOLEAN     NOT NULL DEFAULT FALSE,
  certified_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_cert_unique
  ON connector_certifications (connector_id, workspace_id);

-- ── AI Quality Metrics (Program 3) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_quality_runs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          TEXT        NOT NULL,
  run_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hallucination_rate    NUMERIC(5,4) DEFAULT 0,
  citation_accuracy     NUMERIC(5,4) DEFAULT 0,
  recommendation_acc    NUMERIC(5,4) DEFAULT 0,
  workflow_success_rate NUMERIC(5,4) DEFAULT 0,
  false_positive_rate   NUMERIC(5,4) DEFAULT 0,
  false_negative_rate   NUMERIC(5,4) DEFAULT 0,
  reasoning_latency_ms  INT          DEFAULT 0,
  agent_agreement_rate  NUMERIC(5,4) DEFAULT 0,
  sample_size           INT          DEFAULT 0,
  metrics               JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ai_quality_workspace
  ON ai_quality_runs (workspace_id, run_at DESC);
