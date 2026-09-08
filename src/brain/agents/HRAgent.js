import { BaseAgent } from './BaseAgent.js';

export class HRAgent extends BaseAgent {
  constructor() {
    super({
      id:           'hr',
      name:         'HR Intelligence Agent',
      domain:       'people',
      domains:      ['workforce', 'talent'],
      mission:      'Monitor team capacity, attrition risk, hiring pipeline, and workforce health.',
      capabilities: [
        'Team capacity and workload distribution',
        'Attrition risk and retention signals',
        'Hiring pipeline status and time-to-fill',
        'Performance review cycle tracking',
        'PTO and availability planning',
        'Org chart and reporting structure',
      ],
      keywords: ['employee', 'team', 'hire', 'hiring', 'attrition', 'turnover', 'headcount', 'capacity', 'workload', 'burnout', 'pto', 'leave', 'performance', 'hr', 'workforce', 'talent', 'onboarding', 'offboarding'],
      connectors: ['workday', 'bamboohr', 'rippling', 'greenhouse'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the HR Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze workforce capacity, attrition signals, and talent pipeline health.
You identify burnout risk, key-person dependencies, and skills gaps.
You escalate critical talent risks to the Executive Agent.
You NEVER call APIs or execute code — you only reason about provided data.
You treat all people data with confidentiality — never expose PII in findings.`;
  }
}

export default HRAgent;
