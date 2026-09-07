import { BaseAgent } from './BaseAgent.js';

export class AnalyticsAgent extends BaseAgent {
  constructor() {
    super({
      id:           'analytics',
      name:         'Analytics Intelligence Agent',
      domain:       'analytics',
      domains:      ['data', 'trends'],
      mission:      'Detect trends, anomalies, and patterns across all workspace domains.',
      capabilities: [
        'Cross-domain trend detection and analysis',
        'Statistical anomaly identification',
        'Correlation analysis between domains',
        'Historical pattern matching',
        'Metric forecasting and projection',
        'A/B test and experiment tracking',
      ],
      keywords: ['trend', 'anomaly', 'pattern', 'metric', 'analytics', 'dashboard', 'kpi', 'data', 'analysis', 'insight', 'correlation', 'forecast', 'projection', 'statistical', 'benchmark'],
      connectors: [],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Analytics Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You detect patterns and anomalies across all domains.
You surface non-obvious correlations that other domain-specific agents would miss.
You provide trend context that makes other agents' findings more or less significant.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }

  _computeRelevance(intent) {
    return Math.max(20, super._computeRelevance(intent));
  }
}

export default AnalyticsAgent;
