-- Phase 15 — Enterprise GA
-- Idempotent. Apply: psql $DATABASE_URL -f scripts/migrate-phase15.sql
-- Then: npx prisma generate

-- ── SSO Configurations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_sso_configs (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          TEXT        NOT NULL,
  provider        TEXT        NOT NULL, -- 'saml' | 'oidc' | 'ldap'
  enabled         BOOLEAN     NOT NULL DEFAULT false,
  config          JSONB       NOT NULL DEFAULT '{}', -- provider-specific settings
  metadata_url    TEXT,
  entity_id       TEXT,
  acs_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_sso_configs_org ON enterprise_sso_configs(org_id);

-- ── MFA Configurations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_mfa_configs (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT        NOT NULL,
  org_id          TEXT        NOT NULL,
  method          TEXT        NOT NULL DEFAULT 'totp', -- 'totp' | 'sms' | 'email'
  secret          TEXT,        -- encrypted TOTP secret
  backup_codes    JSONB       NOT NULL DEFAULT '[]',
  verified        BOOLEAN     NOT NULL DEFAULT false,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, method)
);
CREATE INDEX IF NOT EXISTS idx_mfa_configs_user ON enterprise_mfa_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_configs_org  ON enterprise_mfa_configs(org_id);

-- ── Enterprise Sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_sessions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT        NOT NULL,
  org_id          TEXT        NOT NULL,
  workspace_id    TEXT,
  token_hash      TEXT        NOT NULL UNIQUE,
  ip_address      TEXT,
  user_agent      TEXT,
  device_id       TEXT,
  sso_session_id  TEXT,
  mfa_verified    BOOLEAN     NOT NULL DEFAULT false,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked         BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user      ON enterprise_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token     ON enterprise_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires   ON enterprise_sessions(expires_at);

-- ── IP Allowlists ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_ip_allowlists (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          TEXT        NOT NULL,
  cidr            TEXT        NOT NULL,
  label           TEXT,
  enabled         BOOLEAN     NOT NULL DEFAULT true,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ip_allowlists_org ON enterprise_ip_allowlists(org_id);

-- ── Custom Roles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_roles (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  display_name    TEXT        NOT NULL,
  description     TEXT,
  parent_role     TEXT,        -- for inheritance
  scope           TEXT        NOT NULL DEFAULT 'org',
  permissions     JSONB       NOT NULL DEFAULT '[]',
  is_system_role  BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_org ON enterprise_roles(org_id);

-- ── Role Assignments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_role_assignments (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  role_id         TEXT        NOT NULL REFERENCES enterprise_roles(id) ON DELETE CASCADE,
  scope_type      TEXT        NOT NULL DEFAULT 'org',
  scope_id        TEXT,
  granted_by      TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_role_assignments_user ON enterprise_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_org  ON enterprise_role_assignments(org_id);

-- ── SCIM Tokens ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_scim_tokens (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          TEXT        NOT NULL,
  token_hash      TEXT        NOT NULL UNIQUE,
  label           TEXT,
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scim_tokens_org ON enterprise_scim_tokens(org_id);

-- ── Compliance Reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_reports (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          TEXT        NOT NULL,
  workspace_id    TEXT,
  report_type     TEXT        NOT NULL, -- 'soc2' | 'iso27001' | 'audit' | 'access' | 'approval' | 'security'
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'GENERATING',
  evidence        JSONB       NOT NULL DEFAULT '{}',
  file_path       TEXT,
  generated_by    TEXT,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_org  ON compliance_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_type ON compliance_reports(report_type);

-- ── Backup Records ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_records (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          TEXT,
  backup_type     TEXT        NOT NULL, -- 'database' | 'workflow' | 'knowledge_graph' | 'config' | 'full'
  status          TEXT        NOT NULL DEFAULT 'RUNNING',
  region          TEXT,
  file_path       TEXT,
  file_size_bytes BIGINT,
  checksum        TEXT,
  retention_days  INTEGER     NOT NULL DEFAULT 30,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_backup_records_type   ON backup_records(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_records_status ON backup_records(status);
CREATE INDEX IF NOT EXISTS idx_backup_records_started ON backup_records(started_at DESC);

-- ── Upgrade Records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upgrade_records (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_version    TEXT        NOT NULL,
  to_version      TEXT        NOT NULL,
  strategy        TEXT        NOT NULL DEFAULT 'rolling', -- 'rolling' | 'blue_green' | 'canary'
  status          TEXT        NOT NULL DEFAULT 'PENDING',
  migration_ids   JSONB       NOT NULL DEFAULT '[]',
  validation_results JSONB    NOT NULL DEFAULT '{}',
  rollback_point  TEXT,
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_upgrade_records_status ON upgrade_records(status);

-- ── Leader Elections (HA) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leader_elections (
  service         TEXT        NOT NULL,
  env             TEXT        NOT NULL DEFAULT 'production',
  leader_id       TEXT        NOT NULL,
  leader_host     TEXT,
  elected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  renewed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (service, env)
);

-- ── Benchmark Results ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_results (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  suite           TEXT        NOT NULL,
  metric          TEXT        NOT NULL,
  value_ms        NUMERIC(12,3),
  value_ops       NUMERIC(12,3),
  p50_ms          NUMERIC(12,3),
  p95_ms          NUMERIC(12,3),
  p99_ms          NUMERIC(12,3),
  sample_size     INTEGER,
  passed          BOOLEAN     NOT NULL DEFAULT true,
  threshold_ms    NUMERIC(12,3),
  environment     TEXT        NOT NULL DEFAULT 'production',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_benchmark_suite ON benchmark_results(suite, recorded_at DESC);
