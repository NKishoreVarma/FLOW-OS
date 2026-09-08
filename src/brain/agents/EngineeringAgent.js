import { BaseAgent } from './BaseAgent.js';

export class EngineeringAgent extends BaseAgent {
  constructor() {
    super({
      id:           'engineering',
      name:         'Engineering Intelligence Agent',
      domain:       'engineering',
      domains:      ['technical', 'development'],
      mission:      'Monitor engineering health, code quality, deployment risk, and developer velocity.',
      capabilities: [
        'PR review status and merge readiness',
        'Deployment pipeline health and risk scoring',
        'Code quality trends and technical debt',
        'Build failure root cause analysis',
        'Developer velocity and capacity',
        'Branch strategy and merge conflicts',
      ],
      keywords: ['pr', 'pull request', 'deploy', 'deployment', 'build', 'commit', 'branch', 'code', 'pipeline', 'ci', 'cd', 'merge', 'review', 'technical debt', 'velocity', 'repo', 'repository'],
      connectors: ['github', 'gitlab', 'bitbucket'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Engineering Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze PR readiness, deployment risk, build health, and developer capacity.
You identify blockers, quality regressions, and velocity trends.
You recommend engineering actions that improve delivery confidence.
You escalate security-relevant code changes to the Security Agent.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }

  filterContext(fullContext) {
    const ctx = super.filterContext(fullContext);
    // Include all workflow executions — engineering often involves PR-review workflows
    ctx.workflows = fullContext.workflows || [];
    return ctx;
  }
}

export default EngineeringAgent;
