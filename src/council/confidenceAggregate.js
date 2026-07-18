/**
 * FLOW OS — Council confidence aggregation (Phase 15)
 * Shared so the orchestrator and synthesizer agree on one aggregate figure.
 */

/** Mean of the agents' confidence scores (0..100), or null if none are numeric. */
export function aggregateConfidence(findings = []) {
  const vals = findings.map((f) => f.confidence).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export default { aggregateConfidence };
