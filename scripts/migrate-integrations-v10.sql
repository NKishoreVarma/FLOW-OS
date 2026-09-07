-- Phase 10.0 — Real Integration Platform
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-integrations-v10.sql

-- ─── 1. Unified connector credential store ───────────────────────────────────
-- Replaces the in-memory authManager for all non-Google connectors.
-- Google uses the existing google_oauth_tokens table.
-- Encryption: AES-256-GCM, key derived from JWT_SECRET via scrypt.

CREATE TABLE IF NOT EXISTS connector_credentials (
  id                 TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id       TEXT        NOT NULL,
  connector_id       TEXT        NOT NULL,               -- 'github' | 'slack' | 'jira' | 'notion' | etc.
  auth_strategy      TEXT        NOT NULL,               -- 'oauth2' | 'api_key' | 'pat' | 'service_account'
  encrypted_payload  TEXT        NOT NULL,               -- AES-256-GCM: iv:tag:ciphertext of JSON credential
  scopes             TEXT,                               -- space-separated granted OAuth scopes
  account_label      TEXT,                               -- display name (GitHub login, Slack team, etc.)
  account_email      TEXT,
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at  TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,                        -- null = non-expiring (PAT / API key)
  revoked_at         TIMESTAMPTZ,                        -- non-null = disconnected
  meta               JSONB       NOT NULL DEFAULT '{}',
  UNIQUE (workspace_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_credentials_workspace
  ON connector_credentials (workspace_id);
CREATE INDEX IF NOT EXISTS idx_connector_credentials_connector
  ON connector_credentials (connector_id);

-- ─── 2. Sync state (incremental sync cursors) ────────────────────────────────
-- Stores the "high water mark" for each connector so syncs are incremental.

CREATE TABLE IF NOT EXISTS sync_state (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   TEXT        NOT NULL,
  connector_id   TEXT        NOT NULL,
  resource_type  TEXT        NOT NULL DEFAULT 'default', -- 'emails' | 'issues' | 'messages' | etc.
  cursor         TEXT,                                   -- platform-native cursor (history_token, page_cursor, etc.)
  last_sync_at   TIMESTAMPTZ,
  next_sync_at   TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'idle',    -- 'idle' | 'running' | 'failed'
  error_message  TEXT,
  item_count     INTEGER     NOT NULL DEFAULT 0,         -- items processed in last sync
  UNIQUE (workspace_id, connector_id, resource_type)
);

CREATE INDEX IF NOT EXISTS idx_sync_state_workspace
  ON sync_state (workspace_id, connector_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_next
  ON sync_state (next_sync_at) WHERE status = 'idle';

-- ─── 3. Sync history (per-run audit log) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_records (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT        NOT NULL,
  connector_id    TEXT        NOT NULL,
  resource_type   TEXT        NOT NULL DEFAULT 'default',
  status          TEXT        NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed' | 'partial'
  trigger         TEXT        NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'manual' | 'webhook'
  items_synced    INTEGER     NOT NULL DEFAULT 0,
  items_failed    INTEGER     NOT NULL DEFAULT 0,
  cursor_before   TEXT,
  cursor_after    TEXT,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,
  meta            JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sync_records_workspace
  ON sync_records (workspace_id, connector_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_records_status
  ON sync_records (status, started_at DESC);

-- ─── 4. Webhook registrations ────────────────────────────────────────────────
-- Tracks webhooks registered with external platforms.

CREATE TABLE IF NOT EXISTS webhook_registrations (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id      TEXT        NOT NULL,
  connector_id      TEXT        NOT NULL,
  platform_hook_id  TEXT,                    -- ID from the platform (GitHub hook_id, Slack hook_id, etc.)
  event_types       TEXT[]      NOT NULL DEFAULT '{}',
  endpoint_url      TEXT        NOT NULL,    -- public URL FLOW exposes to receive events
  secret_hash       TEXT        NOT NULL,    -- HMAC-SHA256 of secret stored here (never the raw secret)
  encrypted_secret  TEXT        NOT NULL,    -- AES-256-GCM encrypted raw secret (for validation)
  status            TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'inactive' | 'failed'
  last_event_at     TIMESTAMPTZ,
  event_count       INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_registrations_workspace
  ON webhook_registrations (workspace_id, connector_id);

-- ─── 5. Extend existing Integration model ────────────────────────────────────
-- Add columns that the Prisma Integration model is missing.
-- Safe: all additions use IF NOT EXISTS / DEFAULT.

ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS connector_id       TEXT,
  ADD COLUMN IF NOT EXISTS health_status      TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS health_checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_cursor        TEXT,
  ADD COLUMN IF NOT EXISTS error_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_synced       INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_integrations_workspace_platform
  ON integrations (workspace_id, platform);
