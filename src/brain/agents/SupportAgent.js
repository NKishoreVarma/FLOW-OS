import { BaseAgent } from './BaseAgent.js';

export class SupportAgent extends BaseAgent {
  constructor() {
    super({
      id:           'support',
      name:         'Support Intelligence Agent',
      domain:       'support',
      domains:      ['customers', 'service'],
      mission:      'Monitor support ticket volume, response times, escalations, and customer satisfaction.',
      capabilities: [
        'Support ticket volume and trend analysis',
        'First response and resolution time tracking',
        'Escalation pattern detection',
        'Customer issue categorization',
        'Support team capacity assessment',
        'Product bug vs user-error classification',
      ],
      keywords: ['ticket', 'support', 'bug report', 'escalation', 'response time', 'sla breach', 'customer complaint', 'csat', 'resolution', 'helpdesk', 'zendesk', 'intercom'],
      connectors: ['zendesk', 'intercom', 'freshdesk', 'jira'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Support Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze support ticket patterns, escalation signals, and team capacity.
You identify product areas generating the most support load.
You escalate recurring bug patterns to the Engineering Agent.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default SupportAgent;
