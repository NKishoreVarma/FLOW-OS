-- FLOW OS — Sprint 5.3-B Governance Schema Migration
-- Safe to run multiple times (all statements use IF NOT EXISTS)
-- Does NOT touch workspace_intel_chunks or any existing tables.

-- ── Enums ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PolicyEffect" AS ENUM ('ALLOW', 'DENY', 'REQUIRE_APPROVAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── WorkspaceMember ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_members (
  id           TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id      TEXT        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id)  ON DELETE CASCADE,
  role         "Role"      NOT NULL DEFAULT 'MEMBER',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_idx ON workspace_members(workspace_id);

-- ── Policy ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS policies (
  id               TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id           TEXT          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id     TEXT,
  connector_id     TEXT,
  capability       TEXT,
  action_type      TEXT,
  subject_role     "Role",
  subject_user_id  TEXT,
  effect           "PolicyEffect" NOT NULL,
  conditions       JSONB         NOT NULL DEFAULT '{}',
  priority         INTEGER       NOT NULL DEFAULT 100,
  enabled          BOOLEAN       NOT NULL DEFAULT TRUE,
  description      TEXT,
  created_by       TEXT          NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS policies_org_workspace_enabled_idx ON policies(org_id, workspace_id, enabled);
CREATE INDEX IF NOT EXISTS policies_org_priority_idx          ON policies(org_id, priority);

-- ── PendingApproval ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_approvals (
  id              TEXT            NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id          TEXT            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id    TEXT            NOT NULL,
  requester_id    TEXT            NOT NULL REFERENCES users(id),
  connector_id    TEXT            NOT NULL,
  capability      TEXT            NOT NULL,
  action_type     TEXT            NOT NULL,
  payload_ref     JSONB           NOT NULL DEFAULT '{}',
  policy_id       TEXT,
  status          "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  approver_id     TEXT            REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  rejection_note  TEXT,
  audit_log_id    TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_approvals_org_status_idx       ON pending_approvals(org_id, status);
CREATE INDEX IF NOT EXISTS pending_approvals_workspace_status_idx ON pending_approvals(workspace_id, status);
CREATE INDEX IF NOT EXISTS pending_approvals_requester_idx        ON pending_approvals(requester_id);

-- ── AuditLog additions ────────────────────────────────────────────────────────
-- Add workspace_id, approval_id, policy_id columns if they don't exist.
-- All nullable for backward compat with existing rows.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS approval_id  TEXT,
  ADD COLUMN IF NOT EXISTS policy_id    TEXT;

CREATE INDEX IF NOT EXISTS audit_logs_workspace_created_idx ON audit_logs(workspace_id, created_at);
