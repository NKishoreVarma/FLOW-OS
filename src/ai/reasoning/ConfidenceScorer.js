/**
 * ConfidenceScorer — produces a calibrated, explainable confidence score 0-100.
 *
 * Components (weights sum to 1.0):
 *   - Evidence quality:   0.35  (how many, how relevant, how authoritative)
 *   - Reasoning coherence:0.25  (gap count, contradiction count, finding support)
 *   - Verification:       0.25  (pass/fail, trust level)
 *   - Intent match:       0.15  (do we have the right evidence type for the question)
 */

/**
 * @param {import('./EvidenceRanker.js').RankedEvidence} ranked
 * @param {import('./ReasoningEngine.js').ReasoningResult} reasoning
 * @param {import('./VerificationEngine.js').VerificationResult} verification
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {ConfidenceResult}
 */
export function scoreConfidence(ranked, reasoning, verification, intent) {
  const evidenceScore     = _scoreEvidence(ranked, intent);
  const coherenceScore    = _scoreCoherence(reasoning);
  const verificationScore = _scoreVerification(verification);
  const intentMatchScore  = _scoreIntentMatch(ranked, intent);

  const rawScore =
    evidenceScore     * 0.35 +
    coherenceScore    * 0.25 +
    verificationScore * 0.25 +
    intentMatchScore  * 0.15;

  const score        = Math.round(rawScore * 100);
  const level        = _scoreToLevel(score);
  const explanation  = _buildExplanation(score, evidenceScore, coherenceScore, verificationScore, intentMatchScore, ranked, reasoning, verification);

  return {
    score,           // 0-100
    level,           // 'very_high' | 'high' | 'moderate' | 'low' | 'very_low'
    explanation,     // human-readable breakdown
    components: {
      evidence:     Math.round(evidenceScore * 100),
      coherence:    Math.round(coherenceScore * 100),
      verification: Math.round(verificationScore * 100),
      intentMatch:  Math.round(intentMatchScore * 100),
    },
    recommendation: _scoreToRecommendation(level, ranked.total, reasoning.gaps),
  };
}

// ── Component scorers ─────────────────────────────────────────────────────────

function _scoreEvidence(ranked, intent) {
  if (ranked.total === 0) return 0.05;

  // Quantity: more is better, diminishing returns after 8
  const quantityScore = Math.min(1.0, ranked.total / 8);

  // Quality: average ranked score of primary evidence
  const qualityScore = ranked.primary.length > 0
    ? ranked.primary.reduce((sum, e) => sum + (e.rankedScore || 0), 0) / ranked.primary.length
    : 0;

  // Authority: high-authority sources boost confidence
  const highAuthority = ranked.primary.filter(e => (e.authority || 1) >= 1.3).length;
  const authorityBoost = Math.min(0.2, highAuthority * 0.05);

  return Math.min(1.0, (quantityScore * 0.5 + qualityScore * 0.5) + authorityBoost);
}

function _scoreCoherence(reasoning) {
  let score = 0.8; // start optimistic

  // Each unsupported finding reduces score
  const unsupported = reasoning.findings.filter(f => !f.evidence_refs?.length).length;
  score -= unsupported * 0.1;

  // Contradictions reduce score
  score -= (reasoning.contradictions?.length || 0) * 0.08;

  // Gaps reduce score
  const gapCount = reasoning.gaps?.length || 0;
  score -= gapCount * 0.05;

  // Reasoning chain depth adds confidence
  const chainDepth = reasoning.chain?.length || 0;
  score += Math.min(0.15, chainDepth * 0.03);

  return Math.max(0.05, Math.min(1.0, score));
}

function _scoreVerification(verification) {
  const base = { high: 1.0, moderate: 0.75, low: 0.45, insufficient: 0.1 };
  let score  = base[verification.trustLevel] ?? 0.5;

  // Issues reduce score more than warnings
  score -= verification.issues.length    * 0.08;
  score -= verification.warnings.length  * 0.04;

  return Math.max(0.05, Math.min(1.0, score));
}

function _scoreIntentMatch(ranked, intent) {
  if (!ranked.primary.length) return 0.1;

  // Check that we have the right evidence types for the question
  const evidenceTypes = new Set(ranked.primary.map(e => e.type));

  const idealTypes = {
    diagnostic:   ['memory', 'timeline'],
    status:       ['rag', 'memory'],
    forecast:     ['rag', 'memory'],
    action:       ['rag', 'memory'],
    attribution:  ['memory', 'timeline'],
    discovery:    ['rag', 'entity'],
    relationship: ['entity', 'rag'],
    summary:      ['rag', 'memory'],
    comparative:  ['rag', 'memory'],
  };

  const ideal    = idealTypes[intent.questionType] || ['rag'];
  const matches  = ideal.filter(t => evidenceTypes.has(t)).length;

  return matches / ideal.length;
}

// ── Output helpers ────────────────────────────────────────────────────────────

function _scoreToLevel(score) {
  if (score >= 85) return 'very_high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'moderate';
  if (score >= 30) return 'low';
  return 'very_low';
}

function _buildExplanation(score, ev, coh, ver, intent, ranked, reasoning, verification) {
  const parts = [];
  parts.push(`Evidence quality: ${Math.round(ev * 100)}% (${ranked.total} items found)`);
  parts.push(`Reasoning coherence: ${Math.round(coh * 100)}% (${reasoning.gaps?.length || 0} gaps)`);
  parts.push(`Verification: ${Math.round(ver * 100)}% (${verification.trustLevel})`);
  parts.push(`Intent match: ${Math.round(intent * 100)}%`);
  return parts.join(' | ');
}

function _scoreToRecommendation(level, evidenceCount, gaps) {
  if (level === 'very_high' || level === 'high') {
    return 'High confidence — this analysis can be acted upon directly.';
  }
  if (level === 'moderate') {
    return evidenceCount < 3
      ? 'Moderate confidence — consider gathering more data before acting.'
      : 'Moderate confidence — validate key findings before executing actions.';
  }
  if (level === 'low') {
    const gapNote = gaps?.length ? ` Missing: ${gaps[0]}.` : '';
    return `Low confidence — insufficient evidence.${gapNote} Manual investigation recommended.`;
  }
  return 'Very low confidence — do not act on this analysis without independent verification.';
}
