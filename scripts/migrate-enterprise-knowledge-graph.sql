-- Enterprise Knowledge Graph — Phase 10
-- Apply: psql $DATABASE_URL -f scripts/migrate-enterprise-knowledge-graph.sql
-- Idempotent: safe to re-run

BEGIN;

-- ── Entity nodes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kg_nodes (
  id              TEXT          PRIMARY KEY,
  workspace_id    TEXT          NOT NULL,
  entity_type     TEXT          NOT NULL,
  external_id     TEXT          NOT NULL,
  canonical_id    TEXT,
  name            TEXT          NOT NULL,
  display_name    TEXT,
  description     TEXT,
  properties      JSONB         NOT NULL DEFAULT '{}',
  source          TEXT,
  confidence      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT kg_nodes_entity_type_check CHECK (entity_type IN (
    'PERSON','TEAM','DEPARTMENT','PROJECT','REPOSITORY','SERVICE',
    'CUSTOMER','VENDOR','DOCUMENT','MEETING','EMAIL','SLACK_CHANNEL',
    'JIRA_ISSUE','PULL_REQUEST','INCIDENT','DEPLOYMENT','ENVIRONMENT',
    'BUSINESS_GOAL','KPI','RISK','APPROVAL','POLICY','ASSET'
  ))
);

CREATE INDEX IF NOT EXISTS kg_nodes_workspace_idx     ON kg_nodes (workspace_id);
CREATE INDEX IF NOT EXISTS kg_nodes_type_idx          ON kg_nodes (workspace_id, entity_type);
CREATE INDEX IF NOT EXISTS kg_nodes_ext_id_idx        ON kg_nodes (workspace_id, entity_type, external_id);
CREATE INDEX IF NOT EXISTS kg_nodes_canonical_idx     ON kg_nodes (canonical_id) WHERE canonical_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS kg_nodes_source_idx        ON kg_nodes (workspace_id, source);
CREATE INDEX IF NOT EXISTS kg_nodes_confidence_idx    ON kg_nodes (workspace_id, confidence DESC);
CREATE INDEX IF NOT EXISTS kg_nodes_properties_idx    ON kg_nodes USING gin (properties);
CREATE INDEX IF NOT EXISTS kg_nodes_name_fts_idx      ON kg_nodes USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS kg_nodes_last_seen_idx     ON kg_nodes (workspace_id, last_seen_at DESC);

-- ── Relationships ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kg_edges (
  id                TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id      TEXT          NOT NULL,
  source_id         TEXT          NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  target_id         TEXT          NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT          NOT NULL,
  properties        JSONB         NOT NULL DEFAULT '{}',
  confidence        DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  weight            DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  observation_count INTEGER       NOT NULL DEFAULT 1,
  source_system     TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_observed_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT kg_edges_unique UNIQUE (workspace_id, source_id, target_id, relationship_type),
  CONSTRAINT kg_edges_rel_type_check CHECK (relationship_type IN (
    'owns','reports_to','member_of','assigned_to','depends_on',
    'blocks','created_by','reviewed_by','approves','participates_in',
    'references','affects','supports','serves','linked_to',
    'related_to','implements','belongs_to'
  ))
);

CREATE INDEX IF NOT EXISTS kg_edges_workspace_idx     ON kg_edges (workspace_id);
CREATE INDEX IF NOT EXISTS kg_edges_source_idx        ON kg_edges (workspace_id, source_id);
CREATE INDEX IF NOT EXISTS kg_edges_target_idx        ON kg_edges (workspace_id, target_id);
CREATE INDEX IF NOT EXISTS kg_edges_type_idx          ON kg_edges (workspace_id, relationship_type);
CREATE INDEX IF NOT EXISTS kg_edges_confidence_idx    ON kg_edges (workspace_id, confidence DESC);
CREATE INDEX IF NOT EXISTS kg_edges_observed_idx      ON kg_edges (workspace_id, observation_count DESC);
CREATE INDEX IF NOT EXISTS kg_edges_last_obs_idx      ON kg_edges (workspace_id, last_observed_at DESC);

-- ── Sync state ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kg_sync_state (
  id              TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT          NOT NULL,
  entity_type     TEXT          NOT NULL,
  source          TEXT          NOT NULL,
  last_synced_at  TIMESTAMPTZ,
  sync_cursor     TEXT,
  node_count      INTEGER       NOT NULL DEFAULT 0,
  edge_count      INTEGER       NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'PENDING',
  error           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  CONSTRAINT kg_sync_state_unique   UNIQUE (workspace_id, entity_type, source),
  CONSTRAINT kg_sync_state_status   CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED'))
);

CREATE INDEX IF NOT EXISTS kg_sync_state_ws_idx  ON kg_sync_state (workspace_id);

-- ── Entity resolution log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kg_resolution_log (
  id                TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id      TEXT          NOT NULL,
  candidate_id      TEXT          NOT NULL,
  resolved_to       TEXT,
  resolution_method TEXT,
  confidence        DOUBLE PRECISION,
  metadata          JSONB         NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kg_resolution_log_ws_idx   ON kg_resolution_log (workspace_id);
CREATE INDEX IF NOT EXISTS kg_resolution_log_cand_idx ON kg_resolution_log (candidate_id);
CREATE INDEX IF NOT EXISTS kg_resolution_log_to_idx   ON kg_resolution_log (resolved_to) WHERE resolved_to IS NOT NULL;

-- ── updated_at triggers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION kg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kg_nodes_updated_at') THEN
    CREATE TRIGGER kg_nodes_updated_at
      BEFORE UPDATE ON kg_nodes
      FOR EACH ROW EXECUTE FUNCTION kg_set_updated_at();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kg_edges_updated_at') THEN
    CREATE TRIGGER kg_edges_updated_at
      BEFORE UPDATE ON kg_edges
      FOR EACH ROW EXECUTE FUNCTION kg_set_updated_at();
  END IF;
END; $$;

COMMIT;
