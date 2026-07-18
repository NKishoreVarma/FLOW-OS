/**
 * FLOW OS — Executive Council agent registry (Phase 15)
 *
 * Config-driven definitions of the six executive agents. Each agent is *only* a
 * domain prompt + capability scope + routing keywords; its reasoning is the existing
 * Operational Brain (via explainQuestion). No agent reimplements reasoning.
 */

export const AGENT_CONFIGS = Object.freeze([
  {
    id: 'engineering',
    title: 'Engineering COO',
    role: 'MANAGER',
    capabilities: ['engineering'],
    keywords: ['deploy', 'deployment', 'release', 'pr', 'pull request', 'merge', 'commit', 'repo', 'repository', 'branch', 'ci', 'build', 'code', 'engineering', 'incident', 'outage', 'bug', 'velocity', 'sprint', 'technical debt'],
    domainPrompt:
      'You are the Engineering COO. Assess engineering health, delivery risk, code quality, deployment readiness, incidents, and technical debt. Focus only on engineering signals (PRs, commits, deployments, repos, incidents). Be direct about delivery risk.',
  },
  {
    id: 'operations',
    title: 'Operations COO',
    role: 'MANAGER',
    capabilities: ['knowledge', 'communications', 'memory'],
    keywords: ['operations', 'process', 'meeting', 'workflow', 'ops', 'reliability', 'sla', 'onboarding', 'coordination', 'blocked', 'bottleneck', 'capacity', 'efficiency', 'runbook', 'knowledge'],
    domainPrompt:
      'You are the Operations COO. Assess operational efficiency, coordination, process bottlenecks, meeting/communication load, knowledge gaps, and cross-team blockers. Focus on how work flows across the company.',
  },
  {
    id: 'sales',
    title: 'Sales COO',
    role: 'MANAGER',
    capabilities: ['customers'],
    keywords: ['sales', 'customer', 'deal', 'pipeline', 'revenue', 'churn', 'account', 'opportunity', 'crm', 'renewal', 'upsell', 'quota', 'lead', 'prospect', 'contract'],
    domainPrompt:
      'You are the Sales COO. Assess pipeline health, deal risk, churn signals, customer sentiment, and revenue opportunities. Focus only on customer/CRM signals.',
  },
  {
    id: 'hr',
    title: 'HR COO',
    role: 'MANAGER',
    capabilities: ['people'],
    keywords: ['hr', 'people', 'employee', 'team', 'hiring', 'attrition', 'headcount', 'burnout', 'workload', 'org chart', 'performance', 'retention', 'morale', 'onboarding', 'pto', 'bus factor'],
    domainPrompt:
      'You are the HR COO. Assess workforce health: workload/burnout risk, retention, hiring needs, key-person (bus-factor) risk, and team morale. Focus only on people signals.',
  },
  {
    id: 'security',
    title: 'Security COO',
    role: 'MANAGER',
    capabilities: ['engineering', 'memory'],
    keywords: ['security', 'vulnerability', 'breach', 'threat', 'compliance', 'audit', 'access', 'permission', 'secret', 'leak', 'incident', 'risk', 'exposure', 'cve', 'authentication', 'authorization', 'privacy', 'gdpr'],
    domainPrompt:
      'You are the Security COO. Assess security posture, exposure, access/permission risk, compliance gaps, and incident/threat signals. Be conservative — flag risk even on weak evidence, and say so.',
  },
  {
    id: 'finance',
    title: 'Finance COO',
    role: 'MANAGER',
    capabilities: ['customers', 'memory'],
    keywords: ['finance', 'cost', 'budget', 'spend', 'burn', 'runway', 'revenue', 'margin', 'forecast', 'expense', 'arr', 'mrr', 'cash', 'profitability', 'roi', 'pricing'],
    domainPrompt:
      'You are the Finance COO. Assess financial health: cost/burn, revenue trajectory, budget risk, and ROI of major initiatives. Be explicit about financial assumptions and their basis.',
  },
]);

export function getAgentConfig(id) {
  return AGENT_CONFIGS.find((a) => a.id === id) || null;
}

export const AGENT_IDS = AGENT_CONFIGS.map((a) => a.id);

export default { AGENT_CONFIGS, getAgentConfig, AGENT_IDS };
