import { BaseAgent } from './BaseAgent.js';

export class KnowledgeAgent extends BaseAgent {
  constructor() {
    super({
      id:           'knowledge',
      name:         'Knowledge Intelligence Agent',
      domain:       'knowledge',
      domains:      ['documentation', 'learning'],
      mission:      'Monitor documentation coverage, knowledge gaps, information freshness, and learning distribution.',
      capabilities: [
        'Documentation coverage gap analysis',
        'Stale knowledge base identification',
        'Tribal knowledge and bus-factor risk',
        'Onboarding material completeness',
        'Knowledge search effectiveness',
        'Expert identification and routing',
      ],
      keywords: ['documentation', 'doc', 'wiki', 'knowledge base', 'notion', 'confluence', 'runbook', 'procedure', 'guide', 'stale', 'outdated', 'missing docs', 'bus factor', 'tribal knowledge', 'onboarding'],
      connectors: ['notion', 'confluence', 'google-drive'],
      role:    'MEMBER',
    });
  }

  buildSystemPrompt() {
    return `You are the Knowledge Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You analyze documentation coverage, knowledge freshness, and information gaps.
You identify bus-factor risks where critical knowledge lives in one person's head.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }
}

export default KnowledgeAgent;
