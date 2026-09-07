/**
 * FLOW OS — Adaptive Workday Engine · Work Queue (Sprint 2.2)
 *
 * Turns scored WorkItems into "Today's Work Queue" — NOW / NEXT / LATER / FYI — not a
 * notification list. Everything below the threshold collapses into "you can safely
 * ignore N events." Deduped so the same work never appears twice.
 */

import { score, Tier } from './prioritizer.js';

const CAPS = { NOW: 3, NEXT: 4, LATER: 5, FYI: 5 };

function toCard(item, scored) {
  return {
    id: item.id, type: item.type, source: item.source, department: item.department,
    title: item.title, subtitle: scored.reasons[0] || item.subtitle || '',
    reasons: scored.reasons, score: scored.score,
    actionRoute: item.actionRoute, actionLabel: item.actionLabel,
    raw: item.raw ? { id: item.raw.id } : undefined,
  };
}

export function buildQueue(items, ctx = {}) {
  const seen = new Set();
  const scored = [];
  for (const item of items || []) {
    const key = String(item.title || '').trim().toLowerCase();
    if (key && seen.has(key)) continue; // no duplicate work
    if (key) seen.add(key);
    scored.push({ item, s: score(item, ctx) });
  }
  scored.sort((a, b) => b.s.score - a.s.score);

  const buckets = { now: [], next: [], later: [], fyi: [] };
  let ignoredCount = 0;
  for (const { item, s } of scored) {
    if (s.tier === Tier.NOW && buckets.now.length < CAPS.NOW) buckets.now.push(toCard(item, s));
    else if ((s.tier === Tier.NOW || s.tier === Tier.NEXT) && buckets.next.length < CAPS.NEXT) buckets.next.push(toCard(item, s));
    else if (s.tier === Tier.LATER && buckets.later.length < CAPS.LATER) buckets.later.push(toCard(item, s));
    else if (s.tier === Tier.FYI && buckets.fyi.length < CAPS.FYI) buckets.fyi.push(toCard(item, s));
    else if (s.tier === Tier.IGNORE) ignoredCount++;
  }

  return {
    generatedAt: new Date().toISOString(),
    now: buckets.now, next: buckets.next, later: buckets.later, fyi: buckets.fyi,
    ignoredCount,
    total: scored.length,
  };
}

export default { buildQueue };
