/**
 * ConfidenceBreakdown — decomposes confidence into six named, real-signal
 * dimensions so a user can see WHY the system is (un)sure:
 *
 *   data freshness · evidence quality · relationship confidence ·
 *   reasoning confidence · connector health · overall
 *
 * Each dimension is 0–100. None are LLM self-reports — they derive from evidence
 * timestamps, ranking scores, graph edge strength, the reasoning verifier, and
 * connector health.
 */

import { summarizeFreshness } from './EvidenceFormatter.js';

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Recency: fresh (≤2d) ≈ 100, decays to ~40 by 30d, ~15 by 90d.
function freshnessScore(formatted) {
  const f = summarizeFreshness(formatted);
  if (!f.known) return 45; // unknown dates → mild uncertainty, not zero
  const avg = f.avgDays;
  const base = 100 * Math.exp(-avg / 30);
  const undatedPenalty = (f.undatedCount / Math.max(1, formatted.length)) * 20;
  return clamp(base - undatedPenalty);
}

// Quality: quantity (diminishing after 8) × authority × source diversity.
function qualityScore(formatted, sourceAttribution) {
  if (!formatted.length) return 5;
  const quantity  = Math.min(1, formatted.length / 8);
  const avgScore  = formatted.reduce((s, e) => s + (e.score ?? 0.4), 0) / formatted.length;
  const avgAuth   = formatted.reduce((s, e) => s + (e.authority ?? 1), 0) / formatted.length;
  const diversity = Math.min(1, (sourceAttribution?.distinctSourceTypes || 1) / 3);
  return clamp(100 * (quantity * 0.35 + Math.min(1, avgScore) * 0.3 + Math.min(1, avgAuth / 1.5) * 0.15 + diversity * 0.2));
}

function reasoningScore(reasoningConfidence, verification) {
  if (Number.isFinite(reasoningConfidence)) return clamp(reasoningConfidence);
  if (!verification) return 55;
  const map = { high: 85, moderate: 60, low: 30, insufficient: 15 };
  const base = map[verification.trustLevel] ?? 55;
  const issuePenalty = (verification.issues?.filter(i => i.severity === 'high').length || 0) * 15;
  return clamp(base - issuePenalty);
}

/**
 * @param {Object} p
 *   formatted, sourceAttribution, reasoningConfidence (0-100|null),
 *   verification, relationshipConfidence (0-100|null), connectorHealth (0-100|null)
 */
export function buildConfidenceBreakdown(p = {}) {
  const dataFreshness         = freshnessScore(p.formatted || []);
  const evidenceQuality       = qualityScore(p.formatted || [], p.sourceAttribution);
  const relationshipConfidence = Number.isFinite(p.relationshipConfidence) ? clamp(p.relationshipConfidence) : 50;
  const reasoningConfidence   = reasoningScore(p.reasoningConfidence, p.verification);
  const connectorHealth       = Number.isFinite(p.connectorHealth) ? clamp(p.connectorHealth) : 80;

  const overall = clamp(
    dataFreshness          * 0.20 +
    evidenceQuality        * 0.30 +
    relationshipConfidence * 0.15 +
    reasoningConfidence    * 0.25 +
    connectorHealth        * 0.10,
  );

  const dims = { dataFreshness, evidenceQuality, relationshipConfidence, reasoningConfidence, connectorHealth, overall };
  return { ...dims, level: level(overall), weakest: weakest(dims), explanation: explain(dims) };
}

function level(s) { return s >= 85 ? 'very_high' : s >= 70 ? 'high' : s >= 50 ? 'moderate' : s >= 30 ? 'low' : 'very_low'; }

function weakest(dims) {
  const entries = Object.entries(dims).filter(([k]) => k !== 'overall');
  return entries.sort((a, b) => a[1] - b[1])[0][0];
}

function explain(d) {
  const label = { dataFreshness: 'data freshness', evidenceQuality: 'evidence quality', relationshipConfidence: 'relationship confidence', reasoningConfidence: 'reasoning confidence', connectorHealth: 'connector health' };
  return `Overall ${d.overall}/100 (${level(d.overall)}). Weakest dimension: ${label[weakest(d)]}.`;
}
