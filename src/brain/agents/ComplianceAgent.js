import { BaseAgent } from './BaseAgent.js';

export class ComplianceAgent extends BaseAgent {
  constructor() {
    super({
      id:           'compliance',
      name:         'Compliance Intelligence Agent',
      domain:       'compliance',
      domains:      ['regulatory', 'governance'],
      mission:      'Monitor regulatory compliance posture, policy adherence, and audit readiness.',
      capabilities: [
        'Policy adherence tracking',
        'Regulatory requirement gap analysis',
        'Audit readiness scoring',
        'Data handling compliance checks',
        'Governance workflow completion',
        'Third-party vendor compliance status',
      ],
      keywords: ['compliance', 'regulation', 'gdpr', 'hipaa', 'sox', 'pci', 'audit', 'policy', 'governance', 'regulatory', 'data handling', 'vendor compliance', 'data residency', 'privacy'],
      connectors: [],
      role:    'ADMIN',
    });
  }

  buildSystemPrompt() {
    return `You are the Compliance Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze active governance policies and identify compliance gaps.
You flag actions that would violate regulatory requirements.
You work closely with the Security Agent on data-handling concerns.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }

  _computeRelevance(intent) {
    // Compliance is always at least minimally relevant when policies exist
    return Math.max(20, super._computeRelevance(intent));
  }
}

export default ComplianceAgent;
