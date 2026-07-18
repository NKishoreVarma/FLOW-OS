-- Phase 10.1 — OAuth Completion supplement migration
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-oauth-completion-v10-1.sql

-- Add meta JSONB column to google_oauth_tokens for health status persistence
ALTER TABLE google_oauth_tokens
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';

-- Add health_checked_at index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_health
  ON google_oauth_tokens ((meta->>'healthCheckedAt'));

-- Ensure connector_credentials meta column exists (safety guard — created in v10 migration)
ALTER TABLE connector_credentials
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';

-- Add index for health status queries across all connectors
CREATE INDEX IF NOT EXISTS idx_connector_credentials_health_status
  ON connector_credentials ((meta->>'healthStatus'));

-- Ensure sync_state table exists (created in v10 migration, guard for fresh installs)
CREATE TABLE IF NOT EXISTS sync_state (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id     TEXT        NOT NULL,
  connector_id     TEXT        NOT NULL,
  resource_type    TEXT        NOT NULL DEFAULT 'default',
  cursor           TEXT,
  last_sync_at     TIMESTAMPTZ,
  next_sync_at     TIMESTAMPTZ,
  sync_count       INT         NOT NULL DEFAULT 0,
  meta             JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT uq_sync_state UNIQUE (workspace_id, connector_id, resource_type)
);

CREATE TABLE IF NOT EXISTS sync_records (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   TEXT        NOT NULL,
  connector_id   TEXT        NOT NULL,
  resource_type  TEXT        NOT NULL DEFAULT 'default',
  trigger        TEXT        NOT NULL DEFAULT 'scheduled',
  status         TEXT        NOT NULL DEFAULT 'pending',
  items_synced   INT         NOT NULL DEFAULT 0,
  items_failed   INT         NOT NULL DEFAULT 0,
  duration_ms    INT,
  error_message  TEXT,
  new_cursor     TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  meta           JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sync_records_workspace_connector
  ON sync_records (workspace_id, connector_id, started_at DESC);

CREATE TABLE IF NOT EXISTS connector_credentials (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id      TEXT        NOT NULL,
  connector_id      TEXT        NOT NULL,
  auth_strategy     TEXT        NOT NULL DEFAULT 'api_key',
  encrypted_payload TEXT        NOT NULL,
  scopes            TEXT,
  account_label     TEXT,
  account_email     TEXT,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  meta              JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT uq_connector_credentials UNIQUE (workspace_id, connector_id)
);

CREATE TABLE IF NOT EXISTS webhook_registrations (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id     TEXT        NOT NULL,
  connector_id     TEXT        NOT NULL,
  endpoint_url     TEXT        NOT NULL,
  event_types      TEXT[]      NOT NULL DEFAULT '{}',
  encrypted_secret TEXT        NOT NULL,
  secret_hash      TEXT        NOT NULL,
  platform_hook_id TEXT,
  status           TEXT        NOT NULL DEFAULT 'active',
  event_count      BIGINT      NOT NULL DEFAULT 0,
  last_event_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_webhook_registrations UNIQUE (workspace_id, connector_id)
);
