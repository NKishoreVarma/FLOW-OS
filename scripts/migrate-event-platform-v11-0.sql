-- Phase 11.0 — Unified Event Platform
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-event-platform-v11-0.sql
-- Creates the canonical durable event store (flow_events) + per-subscriber delivery log.
-- Does NOT touch workspace_intel_chunks, webhook_events, or any prior table.

-- ─── 1. Canonical durable event store ─────────────────────────────────────────
-- Every activity in FLOW lands here exactly once. All replay, search, retention,
-- and the Inspector read from this single table. Tenant isolation is enforced at
-- the query layer (workspace_id is required on every read path).

CREATE TABLE IF NOT EXISTS flow_events (
  event_id        TEXT        PRIMARY KEY,
  event_type      TEXT        NOT NULL,
  connector       TEXT,
  workspace_id    TEXT        NOT NULL,
  organization_id TEXT,
  actor           JSONB       NOT NULL DEFAULT '{}',
  entity          JSONB       NOT NULL DEFAULT '{}',
  title           TEXT,
  summary         TEXT,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload         JSONB       NOT NULL DEFAULT '{}',
  metadata        JSONB       NOT NULL DEFAULT '{}',
  importance      REAL        NOT NULL DEFAULT 0.5,
  confidence      REAL        NOT NULL DEFAULT 70,
  priority        TEXT        NOT NULL DEFAULT 'low',
  correlation_id  TEXT,
  causation_id    TEXT,
  parent_event_id TEXT,
  source_event_id TEXT,
  version         TEXT        NOT NULL DEFAULT '1.0',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider idempotency: at most one row per (workspace, connector, provider event id)
-- when the source assigned one. event_id PK covers internally-generated events.
CREATE UNIQUE INDEX IF NOT EXISTS uq_flow_events_source
  ON flow_events (workspace_id, connector, source_event_id)
  WHERE source_event_id IS NOT NULL;

-- Workspace-scoped chronological reads (feed, timeline, replay windows).
CREATE INDEX IF NOT EXISTS idx_flow_events_ws_ts
  ON flow_events (workspace_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_flow_events_ws_type
  ON flow_events (workspace_id, event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_flow_events_ws_connector
  ON flow_events (workspace_id, connector, ts DESC);
CREATE INDEX IF NOT EXISTS idx_flow_events_correlation
  ON flow_events (workspace_id, correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flow_events_causation
  ON flow_events (causation_id) WHERE causation_id IS NOT NULL;

-- BRIN over the append-only timestamp — cheap, effective for wide replay/retention scans.
CREATE INDEX IF NOT EXISTS brin_flow_events_ts
  ON flow_events USING BRIN (ts);
-- Structured metadata lookups (Inspector filters).
CREATE INDEX IF NOT EXISTS gin_flow_events_metadata
  ON flow_events USING GIN (metadata);

-- ─── 2. Per-subscriber delivery log ───────────────────────────────────────────
-- One row per (event, subscriber) delivery attempt outcome. Powers Inspector
-- failure/retry/dead-letter views and subscriber-level observability.

CREATE TABLE IF NOT EXISTS flow_event_deliveries (
  id            BIGSERIAL   PRIMARY KEY,
  event_id      TEXT        NOT NULL,
  workspace_id  TEXT        NOT NULL,
  subscriber    TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'delivered',  -- delivered | failed | dead_letter
  attempts      INT         NOT NULL DEFAULT 1,
  error_message TEXT,
  latency_ms    INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_deliveries_event
  ON flow_event_deliveries (event_id);
CREATE INDEX IF NOT EXISTS idx_flow_deliveries_status
  ON flow_event_deliveries (workspace_id, status, created_at DESC);
