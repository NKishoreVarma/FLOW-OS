-- scripts/migrate-pilot-analytics-v18.sql
-- Phase 18 — Pilot Analytics tables. Idempotent (IF NOT EXISTS). Additive only.

CREATE TABLE IF NOT EXISTS pilot_events (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT        NOT NULL,
  user_id      TEXT,
  event        TEXT        NOT NULL,
  properties   JSONB       NOT NULL DEFAULT '{}',
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pilot_events_workspace_ts
  ON pilot_events (workspace_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_pilot_events_workspace_event
  ON pilot_events (workspace_id, event, ts DESC);

CREATE TABLE IF NOT EXISTS pilot_feedback (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT        NOT NULL,
  user_id      TEXT,
  thumbs       TEXT        NOT NULL CHECK (thumbs IN ('up','down')),
  text         TEXT,
  context      TEXT,
  reported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pilot_feedback_workspace
  ON pilot_feedback (workspace_id, reported_at DESC);
