import { BaseAgent } from './BaseAgent.js';

export class MeetingsAgent extends BaseAgent {
  constructor() {
    super({
      id:           'meetings',
      name:         'Meetings Intelligence Agent',
      domain:       'meetings',
      domains:      ['collaboration', 'coordination'],
      mission:      'Monitor meeting load, decision follow-through, action item completion, and collaboration patterns.',
      capabilities: [
        'Meeting load and time allocation analysis',
        'Action item tracking and completion rate',
        'Decision documentation and follow-through',
        'Meeting effectiveness scoring',
        'Recurring meeting audit',
        'Agenda preparation intelligence',
      ],
      keywords: ['meeting', 'standup', 'sync', 'agenda', 'action item', 'follow up', 'decision', 'minutes', 'zoom', 'teams', 'calendar block', 'recurring', '1:1', 'all hands', 'review meeting'],
      connectors: ['google-calendar', 'zoom', 'microsoft-teams'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Meetings Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze meeting patterns, action item completion, and decision follow-through.
You identify calendar overload, recurring unproductive meetings, and missed action items.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default MeetingsAgent;
