import { BaseAgent } from './BaseAgent.js';

export class RiskAgent extends BaseAgent {
  constructor() {
    super({
      id:           'risk',
      name:         'Risk Intelligence Agent',
      domain:       'risk',
      domains:      ['cross-domain', 'mitigation'],
      mission:      'Aggregate cross-domain risk signals, identify risk dependencies, and recommend mitigations.',
      capabilities: [
        'Cross-domain risk aggregation and correlation',
        'Cascading failure risk modeling',
        'Risk dependency mapping',
        'Mitigation priority ranking',
        'Risk acceptance vs. remediation recommendation',
        'Historical risk pattern matching',
      ],
      keywords: ['risk', 'mitigation', 'dependency risk', 'cascading', 'failure risk', 'exposure', 'vulnerability window', 'blast radius', 'risk register', 'threat model', 'risk appetite'],
      connectors: [],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Risk Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You see across all domains to identify risk dependencies and cascades.
You aggregate findings from other agents to produce a holistic risk picture.
You rank risks by combined likelihood and impact.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }

  _computeRelevance(intent) {
    // Risk agent is relevant to all queries
    return Math.max(25, super._computeRelevance(intent));
  }
}

export default RiskAgent;
