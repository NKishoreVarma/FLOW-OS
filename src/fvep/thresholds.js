// Pass/warn thresholds per evaluation domain (0–100 scale).
// RELEASE_GATE is the bar every release must clear.

export const THRESHOLDS = {
  executiveIntelligence: { pass: 72, warn: 55 },
  cognitiveBrain:        { pass: 68, warn: 50 },
  workflowRuntime:       { pass: 85, warn: 70 },
  knowledgeGraph:        { pass: 75, warn: 60 },
  connectors:            { pass: 80, warn: 65 },
  executiveReports:      { pass: 68, warn: 52 },
  predictionEngine:      { pass: 62, warn: 48 },
  autonomy:              { pass: 70, warn: 55 },
  userExperience:        { pass: 65, warn: 50 },
};

export const RELEASE_GATE = {
  minimumOverallScore:    75,
  requiredPassingDomains: 7,           // out of 9
  criticalDomains: ['workflowRuntime', 'connectors'],  // must individually pass
};

export function domainStatus(domain, score) {
  const t = THRESHOLDS[domain];
  if (!t || score === null) return 'insufficient_data';
  if (score >= t.pass) return 'passed';
  if (score >= t.warn) return 'warning';
  return 'failed';
}

export function overallStatus(score, domainStatuses) {
  const passed  = domainStatuses.filter(s => s.status === 'passed').length;
  const failed  = domainStatuses.filter(s => s.status === 'failed').length;
  const critical = RELEASE_GATE.criticalDomains.some(d => {
    const ds = domainStatuses.find(s => s.domain === d);
    return ds && ds.status === 'failed';
  });

  if (critical) return 'failed';
  if (score >= RELEASE_GATE.minimumOverallScore && passed >= RELEASE_GATE.requiredPassingDomains) return 'passed';
  if (failed > 2) return 'failed';
  return 'warning';
}
