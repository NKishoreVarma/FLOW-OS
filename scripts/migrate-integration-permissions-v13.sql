-- Phase 13.1 — Integration Permissions Center (Governance)
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-integration-permissions-v13.sql
-- Then:       npx prisma generate    (NOT prisma migrate dev)
--
-- OAuth authenticates. These tables decide what FLOW is allowed to understand.
-- A resource with no row (or allowed = false) never enters the ingestion pipeline:
-- never stored, never embedded, never graphed, never replayed, never predicted.

-- ─── 1. dm_policy enum ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DmPolicy') THEN
    CREATE TYPE "DmPolicy" AS ENUM ('NEVER', 'BOT_ONLY', 'SELECTED', 'ALL');
  END IF;
END$$;

-- ─── 2. Resource permission catalog ──────────────────────────────────────────
-- One row per discovered resource (channel, repo, label, calendar, page, project).
-- workspace_id is the raw workspace-id header value (matches sync_state).

CREATE TABLE IF NOT EXISTS integration_permissions (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   TEXT        NOT NULL,
  connector      TEXT        NOT NULL,               -- 'slack' | 'github' | 'gmail' | ...
  resource_type  TEXT        NOT NULL,               -- 'channel' | 'repository' | 'label' | ...
  resource_id    TEXT        NOT NULL,               -- provider-native id
  resource_name  TEXT        NOT NULL,               -- display name
  parent_id      TEXT,                               -- parent resource_id (org → repo, team → channel)
  allowed        BOOLEAN     NOT NULL DEFAULT FALSE, -- deny-by-default
  metadata       JSONB       NOT NULL DEFAULT '{}',
  discovered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  updated_by     TEXT,                               -- user id of last permission change
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, connector, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_permissions_ws_connector
  ON integration_permissions (workspace_id, connector);
CREATE INDEX IF NOT EXISTS idx_integration_permissions_allowed
  ON integration_permissions (workspace_id, connector, allowed);

-- ─── 3. Per-connector permission settings ────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_permission_settings (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id         TEXT        NOT NULL,
  connector            TEXT        NOT NULL,
  auto_allow_new       BOOLEAN     NOT NULL DEFAULT FALSE, -- newly discovered resources stay hidden
  dm_policy            "DmPolicy"  NOT NULL DEFAULT 'NEVER',
  legacy_grandfathered BOOLEAN     NOT NULL DEFAULT FALSE, -- see §4
  last_discovered_at   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, connector)
);

CREATE INDEX IF NOT EXISTS idx_integration_permission_settings_ws
  ON integration_permission_settings (workspace_id);

-- ─── 4. Grandfather already-syncing connectors ───────────────────────────────
-- Deny-by-default would silently stop ingestion for every workspace that was
-- already connected before this migration. To avoid a breaking deploy, any
-- (workspace, connector) with existing sync history gets a settings row flagged
-- legacy_grandfathered = TRUE. On that connector's FIRST discovery, the catalog
-- is seeded allowed = TRUE and the flag is cleared — after which deny-by-default
-- governs normally. The UI surfaces these as "Ungoverned" until an admin reviews.

-- Guarded on table existence: a database that never ran the v10 integration
-- migration has nothing to grandfather, and must still apply this one cleanly.

DO $$
BEGIN
  IF to_regclass('public.sync_state') IS NOT NULL THEN
    INSERT INTO integration_permission_settings (workspace_id, connector, legacy_grandfathered)
    SELECT DISTINCT s.workspace_id, s.connector_id, TRUE
    FROM sync_state s
    ON CONFLICT (workspace_id, connector) DO NOTHING;
  END IF;

  IF to_regclass('public.connector_credentials') IS NOT NULL THEN
    INSERT INTO integration_permission_settings (workspace_id, connector, legacy_grandfathered)
    SELECT DISTINCT c.workspace_id, c.connector_id, TRUE
    FROM connector_credentials c
    WHERE c.revoked_at IS NULL
    ON CONFLICT (workspace_id, connector) DO NOTHING;
  END IF;
END$$;
