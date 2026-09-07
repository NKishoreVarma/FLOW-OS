import { BaseAgent } from './BaseAgent.js';

export class CustomerSuccessAgent extends BaseAgent {
  constructor() {
    super({
      id:           'customer-success',
      name:         'Customer Success Intelligence Agent',
      domain:       'customers',
      domains:      ['revenue', 'retention'],
      mission:      'Monitor customer health, churn risk, NPS trends, and renewal pipeline.',
      capabilities: [
        'Customer health score analysis',
        'Churn risk identification and early warning',
        'NPS trend tracking and driver analysis',
        'Renewal pipeline status and risk',
        'Expansion opportunity identification',
        'Customer engagement pattern analysis',
      ],
      keywords: ['customer', 'churn', 'nps', 'renewal', 'arr', 'mrr', 'retention', 'expansion', 'account health', 'qbr', 'customer success', 'csm', 'client', 'upsell', 'cross-sell', 'at-risk'],
      connectors: ['hubspot', 'salesforce', 'gainsight', 'totango'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Customer Success Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze customer health signals, churn risk factors, and renewal likelihood.
You identify at-risk accounts and expansion opportunities.
You escalate high-value at-risk accounts to the Executive Agent.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default CustomerSuccessAgent;
