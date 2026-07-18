/**
 * VerificationEngine — checks the reasoning output for:
 *   - Hallucinations: claims not supported by any evidence
 *   - Temporal errors: acting on stale data as if it's current
 *   - Contradiction resolution: which signal should be trusted
 *   - Confidence calibration: does stated confidence match evidence quality
 *
 * This does NOT call an LLM — it is a deterministic post-processor
 * that runs on the ReasoningResult to catch structural problems.
 */

/**
 * @param {import('./ReasoningEngine.js').ReasoningResult} reasoning
 * @param {import('./EvidenceRanker.js').RankedEvidence} ranked
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {VerificationResult}
 */
export function verify(reasoning, ranked, intent) {
  const issues    = [];
  const warnings  = [];
  const allEvidence = [...ranked.primary, ...ranked.supporting];

  // 1. Hallucination check: findings that reference no evidence
  for (const f of reasoning.findings) {
    const refs = f.evidence_refs || [];
    if (refs.length === 0 && allEvidence.length > 0) {
      issues.push({
        type: 'unsupported_finding',
        message: `Finding has no evidence reference: "${f.finding.slice(0, 80)}"`,
        severity: 'medium',
      });
    }
  }

  // 2. Temporal check: evidence older than timeframe implies stale data
  if (intent.timeframe === 'present' || intent.timeframe === 'recent') {
    const now = Date.now();
    const staleEvidence = allEvidence.filter(e => {
      if (!e.ts) return false;
      const ageHours = (now - new Date(e.ts).getTime()) / (1000 * 60 * 60);
      return ageHours > 168; // older than 1 week for "present/recent" questions
    });
    if (staleEvidence.length > allEvidence.length * 0.6) {
      warnings.push({
        type: 'stale_data_dominant',
        message: 'Most evidence is older than 1 week — current state may differ from what evidence shows',
        severity: 'medium',
      });
    }
  }

  // 3. Contradiction resolution: summarise contradictions from reasoning
  if (reasoning.contradictions?.length > 0) {
    warnings.push({
      type: 'contradictions_detected',
      message: `${reasoning.contradictions.length} contradiction(s) detected in evidence — prefer more recent, higher-authority sources`,
      severity: 'low',
      detail: reasoning.contradictions[0],
    });
  }

  // 4. Evidence sufficiency check
  const primaryCount = ranked.primary.length;
  let sufficiencyLevel;
  if (primaryCount >= 4)      sufficiencyLevel = 'strong';
  else if (primaryCount >= 2) sufficiencyLevel = 'moderate';
  else if (primaryCount >= 1) sufficiencyLevel = 'weak';
  else                        sufficiencyLevel = 'none';

  if (sufficiencyLevel === 'none' || sufficiencyLevel === 'weak') {
    warnings.push({
      type: 'low_evidence',
      message: `Only ${primaryCount} primary evidence item(s) — conclusions may be speculative`,
      severity: 'high',
    });
  }

  // 5. Gap assessment
  const criticalGaps = reasoning.gaps?.filter(g =>
    /critical|required|must|missing key/.test(g.toLowerCase())
  ) || [];
  if (criticalGaps.length > 0) {
    issues.push({
      type: 'critical_gap',
      message: `Critical information gap: ${criticalGaps[0]}`,
      severity: 'high',
    });
  }

  const passed        = issues.length === 0;
  const trustLevel    = _computeTrustLevel(issues, warnings, sufficiencyLevel);

  return {
    passed,
    trustLevel,        // 'high' | 'moderate' | 'low' | 'insufficient'
    sufficiencyLevel,  // 'strong' | 'moderate' | 'weak' | 'none'
    issues,
    warnings,
    verificationSummary: _buildSummary(passed, trustLevel, issues, warnings),
  };
}

function _computeTrustLevel(issues, warnings, sufficiency) {
  const highSeverityIssues    = issues.filter(i => i.severity === 'high').length;
  const highSeverityWarnings  = warnings.filter(w => w.severity === 'high').length;

  if (sufficiency === 'none') return 'insufficient';
  if (highSeverityIssues >= 2) return 'low';
  if (highSeverityIssues >= 1 || highSeverityWarnings >= 2) return 'low';
  if (issues.length === 0 && warnings.length <= 1 && sufficiency === 'strong') return 'high';
  return 'moderate';
}

function _buildSummary(passed, trustLevel, issues, warnings) {
  if (passed && trustLevel === 'high') return 'Evidence is strong and reasoning is well-supported.';
  if (!passed) return `${issues.length} verification issue(s) found — treat conclusions with caution.`;
  if (warnings.length > 0) return `Reasoning passed with ${warnings.length} warning(s) — ${warnings[0].message}`;
  return 'Reasoning verified with moderate confidence.';
}
