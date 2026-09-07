-- Phase 10.2 — Real Synchronization Engine
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-sync-engine-v10-2.sql
-- Prerequisite: migrate-integrations-v10.sql (sync_state, sync_records already exist)

-- ─── 1. Item-level dedup tracker ─────────────────────────────────────────────
-- Prevents re-ingesting unchanged items into the vector store.
-- etag is a provider value (GitHub SHA, Gmail historyId hash, etc.) or a content hash.

CREATE TABLE IF NOT EXISTS sync_items (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  TEXT        NOT NULL,
  connector_id  TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  external_id   TEXT        NOT NULL,    -- provider's unique ID for this item
  etag          TEXT,                    -- content fingerprint; NULL = always re-ingest
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sync_items UNIQUE (workspace_id, connector_id, resource_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_items_lookup
  ON sync_items (workspace_id, connector_id, resource_type);

-- ─── 2. Dead-letter queue ─────────────────────────────────────────────────────
-- Jobs that exceeded BullMQ max retry attempts land here for operator review.

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  TEXT        NOT NULL,
  connector_id  TEXT        NOT NULL,
  resource_type TEXT        NOT NULL DEFAULT 'default',
  trigger       TEXT        NOT NULL DEFAULT 'scheduled',
  error_message TEXT        NOT NULL,
  job_data      JSONB       NOT NULL DEFAULT '{}',
  attempts      INT         NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'pending',   -- 'pending' | 'retrying' | 'resolved' | 'dismissed'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retried_at    TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dlq_workspace
  ON dead_letter_queue (workspace_id, status, created_at DESC);

-- ─── 3. Sync conflict log ─────────────────────────────────────────────────────
-- Recorded when an item was modified locally AND remotely between syncs.

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  TEXT        NOT NULL,
  connector_id  TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  external_id   TEXT        NOT NULL,
  local_etag    TEXT,
  remote_etag   TEXT,
  resolution    TEXT        NOT NULL DEFAULT 'remote_wins',  -- 'local_wins' | 'remote_wins' | 'merged' | 'pending'
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  meta          JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_workspace
  ON sync_conflicts (workspace_id, connector_id, detected_at DESC);

-- ─── 4. Sync schedules ────────────────────────────────────────────────────────
-- Tracks active BullMQ repeat jobs so the scheduler can manage them.

CREATE TABLE IF NOT EXISTS sync_schedules (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  TEXT        NOT NULL,
  connector_id  TEXT        NOT NULL,
  resource_type TEXT        NOT NULL DEFAULT 'default',
  interval_ms   INT         NOT NULL,
  bullmq_key    TEXT,                    -- BullMQ repeat job key for removal
  enabled       BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sync_schedules UNIQUE (workspace_id, connector_id, resource_type)
);

-- ─── 5. Sync state status column guard ───────────────────────────────────────
-- The status column may already exist with different constraints depending on
-- which migration ran first. This is a no-op if already present.

ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';

-- ─── 6. Sync records improvements ────────────────────────────────────────────
ALTER TABLE sync_records ADD COLUMN IF NOT EXISTS items_new     INT NOT NULL DEFAULT 0;
ALTER TABLE sync_records ADD COLUMN IF NOT EXISTS items_updated INT NOT NULL DEFAULT 0;
ALTER TABLE sync_records ADD COLUMN IF NOT EXISTS items_skipped INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sync_records_trigger
  ON sync_records (workspace_id, trigger, started_at DESC);
