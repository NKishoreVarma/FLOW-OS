/**
 * FLOW OS — Adaptive Workday Engine · Prioritizer (Sprint 2.2)
 *
 * The deterministic Chief-of-Staff scoring core. Given a normalized WorkItem and the
 * user's current context, it answers "should Rahul care, and how much?" via a
 * transparent weighted sum — NOT keywords, NOT an LLM. Pure and side-effect-free, so it
 * is fully testable.
 *
 * Dimensions (0..1): ownership · blocking · timeSensitivity · risk · businessImpact ·
 * department importance · prediction confidence.
 */

export const Tier = Object.freeze({ NOW: 'NOW', NEXT: 'NEXT', LATER: 'LATER', FYI: 'FYI', IGNORE: 'IGNORE' });

const WEIGHTS = {
  ownership:            0.22,
  blocking:             0.20,
  timeSensitivity:      0.18,
  risk:                 0.14,
  businessImpact:       0.12,
  department:           0.08,
  predictionConfidence: 0.06,
};

const IMPACT = { critical: 1, high: 0.8, medium: 0.5, low: 0.3 };
const DEPT_IMPORTANCE = { engineering: 1.0, security: 0.9, sales: 0.8, operations: 0.7, finance: 0.65, hr: 0.6 };

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function lc(x) { return String(x || '').toLowerCase(); }

/** Does the user own / is directly involved in this item? */
function ownershipDim(item, ctx) {
  const ids = new Set((ctx.userIdentity || []).map(lc).filter(Boolean));
  if (!ids.size) return 0.4; // unknown viewer → neutral
  const owners = [...(item.owners || []), item.assignee, ...(item.participants || [])].map(lc).filter(Boolean);
  if (owners.some((o) => ids.has(o) || [...ids].some((id) => o.includes(id) || id.includes(o)))) return 1;
  if (lc(item.requester) && ids.has(lc(item.requester))) return 0.55;
  // Explicitly someone else's completed/merged work the user wasn't part of → dampen.
  if (owners.length && (item.type === 'execution' || /merged|completed|closed/i.test(item.title || ''))) return 0.12;
  return owners.length ? 0.3 : 0.45; // owned by others (but actionable) / no owner info
}

function timeDim(item, ctx) {
  const now = ctx.now?.getTime?.() ?? Date.now();
  const t = item.startAt || item.dueAt;
  if (!t) return 0.3;
  const mins = (new Date(t).getTime() - now) / 60000;
  if (mins < 0) return 1;         // overdue / in progress
  if (mins <= 20) return 1;       // imminent
  if (mins <= 60) return 0.8;
  if (mins <= 180) return 0.6;
  if (mins <= 24 * 60) return 0.4;
  return 0.25;
}

/**
 * @returns {{ score:number, tier:string, dims:object, reasons:string[] }}
 */
export function score(item, ctx = {}) {
  const dims = {
    ownership:            ownershipDim(item, ctx),
    blocking:             item.blocking ? clamp01(item.blocking / 3) : 0,
    timeSensitivity:      timeDim(item, ctx),
    risk:                 clamp01((item.riskScore ?? 0) / 100),
    businessImpact:       typeof item.businessImpact === 'number' ? clamp01(item.businessImpact) : (IMPACT[lc(item.businessImpact)] ?? 0.4),
    department:           DEPT_IMPORTANCE[lc(item.department)] ?? 0.6,
    predictionConfidence: clamp01((item.predictionConfidence ?? 0) / 100),
  };

  let raw = 0;
  for (const k of Object.keys(WEIGHTS)) raw += WEIGHTS[k] * dims[k];

  // Noise penalty — a generic notification the user doesn't own, with no impact,
  // blocking, or risk, is exactly the "you can safely ignore this" case.
  const isNoise = item.type === 'notification' && dims.ownership < 0.5 && dims.businessImpact <= 0.3 && !item.blocking && !(item.riskScore > 0);
  if (isNoise) raw *= 0.6;

  const scoreVal = Math.round(100 * clamp01(raw));

  // Tier — blocking + owned work jumps to NOW even at a moderate score.
  let tier;
  if (scoreVal >= 70 || (item.blocking > 0 && dims.ownership >= 0.5 && scoreVal >= 52)) tier = Tier.NOW;
  else if (scoreVal >= 52) tier = Tier.NEXT;
  else if (scoreVal >= 38) tier = Tier.LATER;
  else if (scoreVal >= 24) tier = Tier.FYI;
  else tier = Tier.IGNORE;

  return { score: scoreVal, tier, dims, reasons: reasonsFor(item, dims, ctx) };
}

// The Chief-of-Staff explanation lines — why this matters.
function reasonsFor(item, dims, ctx) {
  const r = [];
  if (item.blocking > 0) r.push(`Blocking ${item.blocking} ${item.blocking === 1 ? 'person' : 'people'}.`);
  if (dims.ownership >= 1) r.push('You own this.');
  const t = item.startAt || item.dueAt;
  if (t) {
    const mins = Math.round((new Date(t).getTime() - (ctx.now?.getTime?.() ?? Date.now())) / 60000);
    if (mins >= 0 && mins <= 60) r.push(`Starts in ${mins} min.`);
    else if (mins < 0) r.push('Overdue.');
  }
  if ((item.riskScore ?? 0) >= 65) r.push(`${item.riskScore}% risk.`);
  if (lc(item.businessImpact) === 'critical') r.push('Critical business impact.');
  return r.slice(0, 3);
}

export default { score, Tier };
