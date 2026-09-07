-- Google OAuth Token Storage (Phase 9.1)
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-google-oauth.sql

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id                 TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id       TEXT        NOT NULL UNIQUE,   -- externalId (workspace-id header value)
  encrypted_tokens   TEXT        NOT NULL,          -- AES-256-GCM: iv:tag:ciphertext
  email              TEXT,                          -- Google account email (for display)
  scopes             TEXT,                          -- space-separated granted scopes
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at  TIMESTAMPTZ,
  CONSTRAINT google_oauth_tokens_workspace_id_check CHECK (workspace_id <> '')
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_workspace_id
  ON google_oauth_tokens (workspace_id);
