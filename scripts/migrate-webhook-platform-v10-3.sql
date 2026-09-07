-- Phase 10.3 — Universal Webhook Platform
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-webhook-platform-v10-3.sql
-- Prerequisites: migrate-integrations-v10.sql (webhook_registrations exists)

-- ─── 1. Webhook event log ─────────────────────────────────────────────────────
-- Stores every inbound event for replay, audit, and deduplication.
-- delivery_id is the provider-assigned idempotency key.

CREATE TABLE IF NOT EXISTS webhook_events (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id     TEXT        NOT NULL,
  connector_id     TEXT        NOT NULL,
  delivery_id      TEXT        NOT NULL,           -- provider's idempotency key
  event_type       TEXT        NOT NULL,           -- FLOW canonical type (pr.opened, etc.)
  resource_type    TEXT        NOT NULL DEFAULT 'unknown',
  resource_id      TEXT,
  actor_name       TEXT,
  actor_email      TEXT,
  summary          TEXT,
  urgency          TEXT        NOT NULL DEFAULT 'low',  -- 'high' | 'medium' | 'low'
  sequence_number  BIGINT,
  raw_payload      JSONB       NOT NULL DEFAULT '{}',
  normalized       JSONB       NOT NULL DEFAULT '{}',
  processing_status TEXT       NOT NULL DEFAULT 'queued',  -- queued|processing|completed|failed|replayed
  error_message    TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  CONSTRAINT uq_webhook_event_delivery UNIQUE (workspace_id, connector_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_workspace
  ON webhook_events (workspace_id, connector_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type
  ON webhook_events (workspace_id, event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON webhook_events (processing_status, received_at DESC);

-- ─── 2. Delivery attempts (retry tracking) ───────────────────────────────────
-- Each processing attempt for an event is logged here.

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id         TEXT        NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  workspace_id     TEXT        NOT NULL,
  connector_id     TEXT        NOT NULL,
  attempt          INT         NOT NULL DEFAULT 1,
  status           TEXT        NOT NULL DEFAULT 'pending',  -- pending|success|failed
  error_message    TEXT,
  duration_ms      INT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event
  ON webhook_deliveries (event_id, attempt);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace
  ON webhook_deliveries (workspace_id, connector_id, started_at DESC);

-- ─── 3. Replay protection index ──────────────────────────────────────────────
-- Secondary DB-layer guard (primary is Redis TTL).
-- Covers cases where Redis is flushed.

CREATE INDEX IF NOT EXISTS idx_webhook_events_dedup
  ON webhook_events (workspace_id, connector_id, delivery_id)
  WHERE processing_status NOT IN ('failed');

-- ─── 4. Extend webhook_registrations ─────────────────────────────────────────
-- Add Google and Notion connector support + verification fields.

ALTER TABLE webhook_registrations
  ADD COLUMN IF NOT EXISTS verification_token  TEXT,
  ADD COLUMN IF NOT EXISTS channel_id          TEXT,        -- Google push notification channel ID
  ADD COLUMN IF NOT EXISTS expiration          TIMESTAMPTZ, -- Google channel expiration
  ADD COLUMN IF NOT EXISTS delivery_count      BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count        BIGINT NOT NULL DEFAULT 0;

-- ─── 5. Notification log ─────────────────────────────────────────────────────
-- Records WebSocket + in-app notifications generated from webhook events.

CREATE TABLE IF NOT EXISTS webhook_notifications (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT        NOT NULL,
  event_id     TEXT        REFERENCES webhook_events(id) ON DELETE SET NULL,
  connector_id TEXT        NOT NULL,
  event_type   TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  body         TEXT,
  urgency      TEXT        NOT NULL DEFAULT 'low',
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_notifications_workspace
  ON webhook_notifications (workspace_id, read_at NULLS FIRST, created_at DESC);
