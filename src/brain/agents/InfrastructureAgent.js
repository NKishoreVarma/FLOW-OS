import { BaseAgent } from './BaseAgent.js';

export class InfrastructureAgent extends BaseAgent {
  constructor() {
    super({
      id:           'infrastructure',
      name:         'Infrastructure Intelligence Agent',
      domain:       'infrastructure',
      domains:      ['operations', 'reliability'],
      mission:      'Monitor system health, uptime, capacity, incidents, and SLA compliance.',
      capabilities: [
        'System uptime and availability monitoring',
        'Incident detection and severity assessment',
        'Capacity planning and scaling recommendations',
        'SLA breach risk identification',
        'Infrastructure cost anomaly detection',
        'Dependency failure blast radius estimation',
      ],
      keywords: ['incident', 'outage', 'downtime', 'uptime', 'sla', 'capacity', 'server', 'infrastructure', 'scaling', 'latency', 'error rate', 'sev', 'p0', 'p1', 'alert', 'monitoring', 'database', 'redis', 'kubernetes', 'k8s'],
      connectors: ['pagerduty', 'datadog', 'aws', 'gcp', 'azure'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Infrastructure Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze system incidents, capacity trends, SLA risks, and infrastructure stability.
You calculate blast radius for potential failures and flag dependency risks.
You escalate critical incidents to the Executive Agent.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default InfrastructureAgent;
