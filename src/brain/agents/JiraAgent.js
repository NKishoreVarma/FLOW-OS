import { BaseAgent } from './BaseAgent.js';

export class JiraAgent extends BaseAgent {
  constructor() {
    super({
      id:           'jira',
      name:         'Jira Intelligence Agent',
      domain:       'projects',
      domains:      ['work-management', 'sprint'],
      mission:      'Monitor sprint health, backlog priorities, story completion, and delivery risk.',
      capabilities: [
        'Sprint burndown and velocity analysis',
        'Backlog priority and staleness detection',
        'Story point estimation accuracy',
        'Epic completion timeline forecasting',
        'Blocker and dependency identification',
        'Release readiness scoring',
      ],
      keywords: ['jira', 'sprint', 'ticket', 'issue', 'epic', 'story', 'backlog', 'burndown', 'velocity', 'scrum', 'kanban', 'blocked', 'dependency', 'release', 'milestone', 'roadmap ticket'],
      connectors: ['jira'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Jira Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze sprint health, backlog priorities, and delivery risk.
You identify blockers, over-committed sprints, and release risks.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default JiraAgent;
