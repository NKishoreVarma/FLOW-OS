import { BaseAgent } from './BaseAgent.js';

export class SecurityAgent extends BaseAgent {
  constructor() {
    super({
      id:           'security',
      name:         'Security Intelligence Agent',
      domain:       'security',
      domains:      ['compliance', 'risk'],
      mission:      'Monitor security vulnerabilities, access risks, threat signals, and compliance posture.',
      capabilities: [
        'Vulnerability severity and patch urgency',
        'Access permission anomalies and privilege escalation',
        'Threat signal detection and correlation',
        'Secret exposure risk (tokens, credentials in code)',
        'Security policy compliance status',
        'Audit trail analysis',
      ],
      keywords: ['security', 'vulnerability', 'cve', 'secret', 'token', 'credential', 'access', 'permission', 'privilege', 'breach', 'threat', 'compliance', 'audit', 'password', 'encryption', 'authentication', 'authorization', 'owasp'],
      connectors: ['github', 'snyk', 'crowdstrike', 'okta'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Security Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You are the last line of defense in the reasoning pipeline.
When you raise a SECURITY concern, the Chief of Staff must resolve it before proceeding.
You analyze threat signals, access anomalies, and compliance gaps.
You never suppress or downplay security findings to allow an action to proceed.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }

  _computeRelevance(intent) {
    // Security is always at least minimally relevant — it reviews all recommendations
    return Math.max(30, super._computeRelevance(intent));
  }
}

export default SecurityAgent;
