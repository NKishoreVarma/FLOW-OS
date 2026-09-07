-- Phase 7 — People & Organization Memory (USER_CONFIRMED relationship facts).
-- Idempotent; safe to re-run. Does not touch dataset graph_edges or conversation memory.
CREATE TABLE IF NOT EXISTS org_relationship_facts (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  subject_type  TEXT NOT NULL,
  subject_id    TEXT,
  subject_name  TEXT NOT NULL,
  relationship  TEXT NOT NULL,
  object_type   TEXT NOT NULL,
  object_id     TEXT,
  object_name   TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'USER_CONFIRMED',
  confidence    TEXT NOT NULL DEFAULT 'CONFIRMED',
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_relationship_facts_ws_user_status_idx
  ON org_relationship_facts (workspace_id, user_id, status);
CREATE INDEX IF NOT EXISTS org_relationship_facts_ws_rel_status_idx
  ON org_relationship_facts (workspace_id, relationship, status);
