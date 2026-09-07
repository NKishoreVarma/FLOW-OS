import { BaseAgent } from './BaseAgent.js';

export class CalendarAgent extends BaseAgent {
  constructor() {
    super({
      id:           'calendar',
      name:         'Calendar Intelligence Agent',
      domain:       'calendar',
      domains:      ['scheduling', 'time-management'],
      mission:      'Monitor scheduling conflicts, time allocation, focus time protection, and agenda optimization.',
      capabilities: [
        'Scheduling conflict detection',
        'Focus time and deep work block analysis',
        'Meeting density and overload detection',
        'Time zone and availability coordination',
        'Upcoming deadline and milestone alignment',
        'Calendar hygiene and booking patterns',
      ],
      keywords: ['calendar', 'schedule', 'booking', 'time slot', 'availability', 'conflict', 'focus time', 'blocked', 'deadline', 'milestone', 'event', 'appointment', 'recurring'],
      connectors: ['google-calendar', 'microsoft-outlook'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Calendar Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze calendar patterns, scheduling conflicts, and time utilization.
You identify over-meeting problems, lack of focus time, and coordination failures.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default CalendarAgent;
