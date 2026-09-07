-- Migration: Extension System (Phase 14)
-- Idempotent — safe to re-run.
-- Apply with: psql $DATABASE_URL -f scripts/migrate-extensions-v14.sql
-- Then: npx prisma generate (NOT prisma migrate dev)

-- Extension installations table
CREATE TABLE IF NOT EXISTS extension_installations (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  extension_id    TEXT        NOT NULL,
  workspace_id    TEXT,                           -- NULL = global installation
  version         TEXT        NOT NULL,
  manifest_json   JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'enabled', -- enabled | disabled | error
  installed_by    TEXT,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per (extension_id, workspace_id) — coalesce NULL to empty string for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_install_unique
  ON extension_installations (extension_id, COALESCE(workspace_id, ''));

CREATE INDEX IF NOT EXISTS idx_ext_install_workspace
  ON extension_installations (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ext_install_status
  ON extension_installations (status);

CREATE INDEX IF NOT EXISTS idx_ext_install_extension_id
  ON extension_installations (extension_id);

-- Extension audit log (separate from the main AuditLog for extension lifecycle events)
CREATE TABLE IF NOT EXISTS extension_audit_log (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  extension_id  TEXT        NOT NULL,
  workspace_id  TEXT,
  action        TEXT        NOT NULL,  -- installed | enabled | disabled | upgraded | uninstalled | error
  actor_id      TEXT,
  from_version  TEXT,
  to_version    TEXT,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_audit_extension_id
  ON extension_audit_log (extension_id);

CREATE INDEX IF NOT EXISTS idx_ext_audit_workspace
  ON extension_audit_log (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ext_audit_created
  ON extension_audit_log (created_at DESC);

-- Widget registry (backend metadata only; frontend components resolved at runtime)
CREATE TABLE IF NOT EXISTS extension_widgets (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  widget_id        TEXT        NOT NULL UNIQUE,
  extension_id     TEXT        NOT NULL REFERENCES extension_installations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  category         TEXT        NOT NULL,
  size             TEXT        NOT NULL DEFAULT 'md',
  data_source_spec JSONB,
  component_path   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_widgets_extension
  ON extension_widgets (extension_id);
