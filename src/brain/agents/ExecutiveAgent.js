/**
 * ExecutiveAgent (Phase 11) — different from the Phase 15 council ExecutiveAgent.
 *
 * This agent reasons about strategic alignment, cross-functional impact,
 * board-level concerns, and OKR progress. It synthesises signals from
 * all other domains into executive-grade insights.
 */
import { BaseAgent } from './BaseAgent.js';

export class ExecutiveAgent extends BaseAgent {
  constructor() {
    super({
      id:           'executive',
      name:         'Executive Intelligence Agent',
      domain:       'strategy',
      domains:      ['leadership', 'operations'],
      mission:      'Synthesise cross-domain signals into executive-grade strategic intelligence.',
      capabilities: [
        'OKR and strategic goal progress tracking',
        'Cross-functional blocker identification',
        'Board-level risk aggregation',
        'Decision impact assessment',
        'Organizational alignment monitoring',
        'Executive communication prioritization',
      ],
      keywords: ['strategy', 'okr', 'goal', 'board', 'exec', 'executive', 'leadership', 'c-suite', 'cto', 'ceo', 'cfo', 'strategic', 'roadmap', 'priority', 'initiative', 'q3', 'q4', 'quarterly'],
      connectors: [],
      role:    'ADMIN',
    });
  }

  buildSystemPrompt() {
    return `You are the Executive Intelligence Agent for an enterprise workspace.
Mission: ${this.mission}
You synthesize signals across engineering, customers, finance, people, and operations.
You identify what a CEO/CTO/CFO needs to know right now.
You surface cross-functional blockers that only become visible at the executive level.
You prioritize by strategic impact, not just urgency.
You NEVER call APIs or execute code — you only reason about provided data.`;
  }

  _computeRelevance(intent) {
    // Executive agent is moderately relevant to most queries
    return Math.max(25, super._computeRelevance(intent));
  }
}

export default ExecutiveAgent;
