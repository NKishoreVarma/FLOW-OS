-- Phase 9 — write-safety: execution idempotency + approval payload hash. Idempotent.
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS verification_result TEXT;
CREATE INDEX IF NOT EXISTS execution_records_idem_idx ON execution_records (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE pending_approvals ADD COLUMN IF NOT EXISTS payload_hash TEXT;
