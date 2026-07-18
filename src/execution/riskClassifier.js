/**
 * FLOW OS — Risk Classifier (Phase 14)
 *
 * Deterministic mapping of a connector action to a risk level. This drives the
 * Approval Engine tier (auto / confirm / manager / two-person). It is intentionally
 * rule-based (no LLM) so risk is explainable and reproducible, and it is
 * policy-overridable — a workspace Policy can raise (never silently lower) the tier.
 *
 * Levels:
 *   LOW      → auto-execute
 *   MEDIUM   → the requesting user confirms in FLOW
 *   HIGH     → one ADMIN/OWNER approves
 *   CRITICAL → two distinct ADMIN/OWNER approve
 */

export const RiskLevel = Object.freeze({
  LOW:      'LOW',
  MEDIUM:   'MEDIUM',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL',
});

const ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/** Higher of two levels. */
export function maxRisk(a, b) {
  return (ORDER[a] ?? 0) >= (ORDER[b] ?? 0) ? a : b;
}

// Read-only actions never mutate external state.
const READ_ACTIONS = new Set(['read', 'search', 'health', 'audit', 'list', 'get']);

// Low-impact writes: safe to let the user just confirm.
const LOW_WRITE = new Set(['draft', 'label', 'comment', 'note', 'addNote']);

// High-impact / externally-visible / hard-to-undo writes.
const HIGH_WRITE = new Set([
  'merge', 'send', 'reply', 'replyAll', 'forward', 'requestChanges',
  'assign', 'cancel', 'transition', 'close',
]);

// Always the top tier — irreversible or bulk/destructive.
const CRITICAL_WRITE = new Set(['delete', 'purge', 'bulkDelete', 'lockdown']);

/**
 * Classify a single action step.
 * @param {object} step { connector, connectorId, actionType, payload }
 * @param {object} [opts] { policyLevel?: RiskLevel }  — a policy may raise the tier
 * @returns {{ level: string, reasons: string[] }}
 */
export function classifyAction(step = {}, opts = {}) {
  const action  = String(step.actionType || '').trim();
  const base    = action.split(/[._:]/)[0].toLowerCase(); // "merge.pr" → "merge"
  const payload = step.payload || {};
  const reasons = [];

  let level = RiskLevel.MEDIUM; // default for unrecognized writes

  if (READ_ACTIONS.has(base)) {
    level = RiskLevel.LOW;
    reasons.push('Read-only action — no external state changes.');
  } else if (CRITICAL_WRITE.has(base) || CRITICAL_WRITE.has(action)) {
    level = RiskLevel.CRITICAL;
    reasons.push('Irreversible or destructive action.');
  } else if (LOW_WRITE.has(base) || LOW_WRITE.has(action)) {
    level = RiskLevel.LOW;
    reasons.push('Low-impact write (draft/comment/label).');
  } else if (HIGH_WRITE.has(base) || HIGH_WRITE.has(action)) {
    level = RiskLevel.HIGH;
    reasons.push('Externally visible or hard-to-undo action.');
  } else if (base === 'create') {
    level = RiskLevel.MEDIUM;
    reasons.push('Creates a new item — reversible, so user confirmation suffices.');
  } else if (base === 'update') {
    level = RiskLevel.HIGH;
    reasons.push('Updates existing state.');
  }

  // ── Context escalations ──────────────────────────────────────────────────────
  if (base === 'merge' && (payload.base === 'main' || payload.base === 'master' || payload.protected)) {
    level = maxRisk(level, RiskLevel.CRITICAL);
    reasons.push('Merge targets a protected branch.');
  }
  if (base === 'send' && isExternalRecipient(payload)) {
    level = maxRisk(level, RiskLevel.HIGH);
    reasons.push('Message goes to an external recipient.');
  }
  if (payload.bulk || (Array.isArray(payload.ids) && payload.ids.length > 5)) {
    level = maxRisk(level, RiskLevel.CRITICAL);
    reasons.push('Bulk operation across many items.');
  }

  // ── Policy override (may only raise) ─────────────────────────────────────────
  if (opts.policyLevel && ORDER[opts.policyLevel] > ORDER[level]) {
    level = opts.policyLevel;
    reasons.push(`Workspace policy raised the risk to ${opts.policyLevel}.`);
  }

  return { level, reasons };
}

/** Classify a whole plan — the plan risk is the highest of its steps. */
export function classifyPlan(steps = [], opts = {}) {
  let level = RiskLevel.LOW;
  const perStep = steps.map((s) => {
    const r = classifyAction(s, opts);
    level = maxRisk(level, r.level);
    return { step: s, ...r };
  });
  return { level, steps: perStep };
}

function isExternalRecipient(payload) {
  const to = []
    .concat(payload.to || [], payload.recipients || [], payload.cc || [])
    .map((r) => (typeof r === 'string' ? r : r?.address || r?.email || ''))
    .filter(Boolean);
  const internalDomain = process.env.INTERNAL_EMAIL_DOMAIN || null;
  if (!to.length) return false;
  if (!internalDomain) return false; // unknown → don't over-escalate
  return to.some((addr) => !addr.toLowerCase().endsWith(`@${internalDomain.toLowerCase()}`));
}

export default { RiskLevel, classifyAction, classifyPlan, maxRisk };
