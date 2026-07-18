-- Phase 11.1 — Operational Graph Engine (Digital Twin)
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-graph-engine-v11-1.sql
-- Additively extends the existing graph_nodes / graph_edges (Phase 7). Does NOT
-- drop or rename anything. Run `npx prisma generate` afterwards (NOT migrate dev).

-- ─── Edge strength + recency (RelationshipScorer, temporal traversal) ─────────
ALTER TABLE graph_edges
  ADD COLUMN IF NOT EXISTS observation_count INT         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_observed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ─── Node recency (staleness queries: "which documents are stale") ────────────
ALTER TABLE graph_nodes
  ADD COLUMN IF NOT EXISTS last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ─── Traversal indexes ────────────────────────────────────────────────────────
-- Recursive-CTE traversal expands by (workspace_id, source_id) and
-- (workspace_id, target_id); these composites keep each hop index-only.
CREATE INDEX IF NOT EXISTS idx_graph_edges_ws_source
  ON graph_edges (workspace_id, source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_ws_target
  ON graph_edges (workspace_id, target_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_ws_type
  ON graph_edges (workspace_id, relationship_type);
-- Node search / staleness scans.
CREATE INDEX IF NOT EXISTS idx_graph_nodes_ws_stale
  ON graph_nodes (workspace_id, last_observed_at);
