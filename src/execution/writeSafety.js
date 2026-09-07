/**
 * writeSafety (Phase 9) — real-execution safety primitives. Deterministic, no external
 * calls of their own. Used by the governed pipeline to make REAL provider executions:
 *   - honestly LABELED (never mistakable for SANDBOX),
 *   - VERIFIED only after provider read-back (never on a raw API success),
 *   - IDEMPOTENT (same approved step → one external side effect),
 *   - BOUND to the exact approved payload (any mutation invalidates the approval).
 *
 * SANDBOX executions keep their own labels (set by SandboxAdapter) and are left untouched.
 */

import crypto from 'crypto';

// Stable stringify → deterministic hash independent of key order.
function _stable(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(_stable).join(',')}]`;
  return `{${Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + _stable(obj[k])).join(',')}}`;
}
export function payloadHash(payload = {}) {
  return crypto.createHash('sha256').update(_stable(payload)).digest('hex').slice(0, 32);
}

/**
 * Idempotency key for one approved execution step. Derived from the execution IDENTITY
 * (workspace, connector, action, approval) + the payload content — NOT a timestamp — so a
 * retry of the same approved step dedupes, while a different approval/action does not.
 */
export function idempotencyKey({ workspaceId, connectorId, actionType, approvalId = null, payload = {} }) {
  const parts = [String(workspaceId), String(connectorId), String(actionType), String(approvalId || 'none'), payloadHash(payload)];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

// Fields whose change between approval and execution must INVALIDATE the approval.
const BOUND_FIELDS = ['title', 'summary', 'date', 'start', 'startTime', 'start_time', 'end', 'endTime',
  'time', 'to', 'recipient', 'recipients', 'attendee', 'attendees', 'channel', 'channelId',
  'number', 'owner', 'repo', 'base', 'mergeMethod', 'body', 'text', 'subject', 'target', 'id'];

/**
 * Verify the payload about to execute matches what the approver approved. Returns
 * { ok, changed } — changed lists the bound fields that differ. Provider/workspace/action
 * are checked by the caller (they live outside the payload).
 */
export function verifyApprovalBinding(approvedPayload = {}, executingPayload = {}) {
  const changed = [];
  for (const f of BOUND_FIELDS) {
    const a = approvedPayload[f], b = executingPayload[f];
    if (a === undefined && b === undefined) continue;
    if (_stable(a) !== _stable(b)) changed.push(f);
  }
  return { ok: changed.length === 0, changed };
}

// Extract a provider-side resource id from a raw adapter response (best-effort, per shape).
function _externalResourceId(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw.id || raw.eventId || raw.messageId || raw.message?.id || raw.ts || raw.number ||
    raw.sha || raw.key || raw.resourceId || null;
}

/**
 * Wrap a REAL adapter result in the standardized LIVE receipt envelope. Sandbox results
 * (already labeled executionMode:'SANDBOX') are returned unchanged. `verified` starts FALSE
 * and is only set true by a successful post-execution read-back (verifyExecution).
 */
export function buildLiveReceipt({ connectorId, actionType, rawResult, workspaceId, approvalId = null }) {
  // Sandbox adapter already sets its own honest labels — never re-wrap it.
  if (rawResult && rawResult.executionMode === 'SANDBOX') return rawResult;
  return {
    executionMode:         'LIVE',
    external:              true,
    contactedExternalApi:  true,
    provider:              connectorId,
    receiptType:           'REAL_PROVIDER',
    isRealProviderReceipt: true,
    externalResourceId:    _externalResourceId(rawResult),
    workspaceId:           String(workspaceId),
    actionType,
    approvalId,
    verified:              false,               // ← stays false until provider read-back succeeds
    verificationResult:    'PENDING',
    processedAt:           new Date().toISOString(),
    providerResponse:      rawResult ?? null,
  };
}

/**
 * Post-execution provider verification (Stage 3) — Google Calendar CREATE only for now.
 * Reads the created event back by its provider id and compares essential fields. Returns a
 * receipt with verified true/false and a verificationResult. NEVER sets verified:true unless
 * the read-back actually returns a matching resource. `readBack` is injected so this is unit-
 * testable without a live provider (production passes the real adapter read).
 *
 * @param receipt   the LIVE receipt from buildLiveReceipt
 * @param expected  the approved payload (fields we expect to see back)
 * @param readBack  async (externalResourceId) => providerEvent | null   (may throw/timeout)
 */
export async function verifyCalendarWrite(receipt, expected = {}, readBack) {
  const out = { ...receipt };
  const id = receipt.externalResourceId;
  if (!id) { out.verified = false; out.verificationResult = 'MISSING_EXTERNAL_ID'; return out; }
  let ev;
  try { ev = await readBack(id); }
  catch (e) { out.verified = false; out.verificationResult = /timeout|deadline/i.test(e?.message || '') ? 'READBACK_TIMEOUT' : 'READBACK_ERROR'; return out; }
  if (!ev) { out.verified = false; out.verificationResult = 'READBACK_NOT_FOUND'; return out; }
  // Compare essential fields that were part of the approval.
  const evTitle = ev.title || ev.summary || '';
  const wantTitle = expected.title || expected.summary || '';
  const titleOk = !wantTitle || evTitle.trim().toLowerCase() === String(wantTitle).trim().toLowerCase();
  const idOk = (ev.id || ev.eventId) ? String(ev.id || ev.eventId) === String(id) : true;
  if (titleOk && idOk) { out.verified = true; out.verificationResult = 'VERIFIED'; }
  else { out.verified = false; out.verificationResult = 'VERIFICATION_MISMATCH'; }
  return out;
}

export default { payloadHash, idempotencyKey, verifyApprovalBinding, buildLiveReceipt, verifyCalendarWrite };
