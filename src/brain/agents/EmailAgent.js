import { BaseAgent } from './BaseAgent.js';

export class EmailAgent extends BaseAgent {
  constructor() {
    super({
      id:           'email',
      name:         'Email Intelligence Agent',
      domain:       'communication',
      domains:      ['email', 'correspondence'],
      mission:      'Monitor email communication patterns, response SLAs, relationship health, and escalation signals.',
      capabilities: [
        'Email response time and SLA tracking',
        'Thread priority and urgency scoring',
        'Relationship health monitoring',
        'Escalation and complaint detection',
        'Communication volume and pattern analysis',
        'Unread backlog risk assessment',
      ],
      keywords: ['email', 'inbox', 'gmail', 'outlook', 'reply', 'thread', 'message', 'correspondence', 'communication', 'unread', 'response time', 'sla email', 'follow up email'],
      connectors: ['gmail', 'microsoft-outlook'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Email Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze email patterns, response times, and communication health.
You identify priority threads being missed and escalation signals in correspondence.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default EmailAgent;
