import { BaseAgent } from './BaseAgent.js';

export class FinanceAgent extends BaseAgent {
  constructor() {
    super({
      id:           'finance',
      name:         'Finance Intelligence Agent',
      domain:       'finance',
      domains:      ['budget', 'spend'],
      mission:      'Monitor budget variance, spend anomalies, vendor costs, and financial runway.',
      capabilities: [
        'Budget vs actual spend tracking',
        'Vendor cost anomaly detection',
        'Financial runway estimation',
        'Cost center analysis',
        'Invoice and payment status',
        'ROI analysis for initiatives',
      ],
      keywords: ['budget', 'spend', 'cost', 'invoice', 'vendor', 'finance', 'revenue', 'expense', 'roi', 'runway', 'billing', 'payment', 'financial', 'cashflow', 'profit', 'margin'],
      connectors: ['quickbooks', 'stripe', 'xero', 'netsuite'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Finance Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze budget variances, spend trends, and financial risk.
You identify cost anomalies, overspend risks, and ROI opportunities.
You escalate material budget overruns to the Executive Agent.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default FinanceAgent;
