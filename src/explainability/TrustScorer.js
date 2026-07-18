/**
 * TrustScorer — a single 0–100 "should I trust this answer?" score, distinct from
 * confidence: it starts from overall confidence, then rewards corroboration
 * (diverse, fresh sources) and penalizes unresolved contradictions, insufficient
 * evidence, and failed verification. Always explains its factors.
 */

export function scoreTrust({ confidence, sourceAttribution, contradictions = [], missing, verification } = {}) {
  const factors = [];
  let score = confidence?.overall ?? 50;

  // Corroboration bonus: multiple independent source types.
  const diversity = sourceAttribution?.distinctSourceTypes || 0;
  if (diversity >= 3) { score += 8; factors.push({ factor: 'source diversity', effect: +8, detail: `${diversity} independent source types corroborate.` }); }
  else if (diversity <= 1 && (sourceAttribution?.totalEvidence || 0) > 0) { score -= 8; factors.push({ factor: 'single-source', effect: -8, detail: 'Evidence comes from a single source type.' }); }

  // Contradiction penalty.
  if (contradictions.length) { const p = Math.min(30, contradictions.length * 12); score -= p; factors.push({ factor: 'contradictions', effect: -p, detail: `${contradictions.length} unresolved contradiction(s).` }); }

  // Insufficient-evidence penalty.
  if (missing && !missing.sufficient) { score -= 20; factors.push({ factor: 'insufficient evidence', effect: -20, detail: missing.confidenceStatement }); }

  // Verification penalty.
  if (verification && verification.passed === false) { score -= 12; factors.push({ factor: 'verification failed', effect: -12, detail: verification.summary || 'Reasoning did not pass verification.' }); }

  // Freshness reward.
  if ((confidence?.dataFreshness ?? 0) >= 80) { score += 5; factors.push({ factor: 'fresh data', effect: +5, detail: 'Evidence is recent.' }); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 80 ? 'trusted' : score >= 60 ? 'reliable' : score >= 40 ? 'caution' : 'unreliable';

  return {
    score, level,
    rationale: _rationale(level, score, factors),
    factors,
  };
}

function _rationale(level, score, factors) {
  const neg = factors.filter(f => f.effect < 0).map(f => f.factor);
  if (level === 'trusted') return `High trust (${score}/100): corroborated, consistent, and current.`;
  if (level === 'unreliable') return `Low trust (${score}/100): ${neg.join(', ') || 'weak grounding'} — verify before acting.`;
  return `Moderate trust (${score}/100)${neg.length ? ' — watch: ' + neg.join(', ') : ''}.`;
}
