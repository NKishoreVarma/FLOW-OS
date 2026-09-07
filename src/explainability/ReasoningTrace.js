/**
 * ReasoningTrace — turns the reasoning result into an ordered, inspectable chain
 * of steps so a user can follow HOW the conclusion was reached (the "how?" and
 * "why?" queries).
 */

export function buildReasoningTrace(reasoning = {}, capabilities = {}, formatted = []) {
  const steps = [];
  let n = 0;

  steps.push({
    step: ++n, phase: 'intent',
    description: `Interpreted the question as a ${reasoning.questionType || 'general'} query in the ${reasoning.domain || 'operations'} domain (${reasoning.timeframe || 'unspecified'} timeframe).`,
  });

  if (capabilities.queried?.length || capabilities.planned?.length) {
    const q = capabilities.queried || capabilities.planned || [];
    steps.push({
      step: ++n, phase: 'retrieval',
      description: `Queried ${q.length} capabilit${q.length === 1 ? 'y' : 'ies'} (${q.slice(0, 6).join(', ')}) and gathered ${formatted.length} pieces of evidence.`,
      inputs: q,
    });
  }

  for (const c of (reasoning.chain || []).slice(0, 8)) {
    steps.push({
      step: ++n, phase: 'inference',
      description: typeof c === 'string' ? c : (c.text || c.step || c.description || JSON.stringify(c)),
    });
  }

  if (reasoning.findings?.length) {
    steps.push({ step: ++n, phase: 'findings', description: `Derived ${reasoning.findings.length} finding(s).`, findings: reasoning.findings.slice(0, 6) });
  }

  if (reasoning.verification) {
    steps.push({
      step: ++n, phase: 'verification',
      description: reasoning.verification.summary || `Verification: ${reasoning.verification.trustLevel} trust.`,
      passed: reasoning.verification.passed,
    });
  }

  return {
    steps,
    chainLength: steps.length,
    gaps: reasoning.gaps || [],
  };
}
