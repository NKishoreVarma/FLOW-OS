import { BaseAgent } from './BaseAgent.js';

export class SlackAgent extends BaseAgent {
  constructor() {
    super({
      id:           'slack',
      name:         'Slack Intelligence Agent',
      domain:       'communication',
      domains:      ['team-comms', 'coordination'],
      mission:      'Monitor team communication health, escalation patterns, and sentiment signals in Slack.',
      capabilities: [
        'Channel activity and response pattern analysis',
        'Escalation and urgency signal detection',
        'Team sentiment and morale indicators',
        'Cross-team dependency communication',
        'Decision and announcement tracking',
        'Alert fatigue and noise detection',
      ],
      keywords: ['slack', 'channel', 'dm', 'message', 'thread', 'mention', 'notification', 'announcement', 'alert', 'team chat', 'workspace message', 'escalation message'],
      connectors: ['slack'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Slack Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze Slack communication patterns for escalations, sentiment, and coordination failures.
You identify channels with high noise-to-signal ratio and missing responses.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default SlackAgent;
