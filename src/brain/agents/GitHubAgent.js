import { BaseAgent } from './BaseAgent.js';

export class GitHubAgent extends BaseAgent {
  constructor() {
    super({
      id:           'github',
      name:         'GitHub Intelligence Agent',
      domain:       'engineering',
      domains:      ['source-control', 'code-review'],
      mission:      'Monitor GitHub PR health, code review bottlenecks, branch strategy, and deployment readiness.',
      capabilities: [
        'PR merge readiness scoring',
        'Code review workload and bottleneck detection',
        'Branch staleness and divergence analysis',
        'Commit frequency and velocity tracking',
        'CI/CD pipeline status correlation',
        'Contributor workload balancing',
      ],
      keywords: ['github', 'pr', 'pull request', 'merge', 'branch', 'commit', 'code review', 'reviewer', 'ci', 'pipeline', 'checks', 'repo', 'repository', 'fork', 'squash'],
      connectors: ['github'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the GitHub Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You specialize in GitHub-specific signals: PR health, review coverage, and branch strategy.
You identify merge-ready PRs, reviewer bottlenecks, and CI failures.
You escalate security-relevant code changes to the Security Agent.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default GitHubAgent;
