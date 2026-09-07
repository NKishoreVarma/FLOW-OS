import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAgentRouting } from '../../src/ai/agent/agentRouting.js';

describe('Agent-mode routing (Stage 4I) — iterative reasoning only when justified', () => {
  it('simple lookups → fast pipeline (no agent)', () => {
    for (const q of ['Who is the CTO?', 'What is the release date?', 'List open incidents', 'How many customers are enterprise?']) {
      assert.equal(classifyAgentRouting({ question: q }).useAgent, false, q);
    }
  });

  it('multi-hop questions → agent', () => {
    const r = classifyAgentRouting({ question: 'Why is Project Alpha delayed and who owns the blocking PR?' });
    assert.equal(r.useAgent, true);
    assert.equal(r.complexity, 'multi_hop');
  });

  it('comparison / ambiguous questions → agent', () => {
    assert.equal(classifyAgentRouting({ question: 'Compare Helios Platform vs Analytics reliability' }).useAgent, true);
    assert.equal(classifyAgentRouting({ question: "What's going on that I should know about?" }).useAgent, true);
  });

  it('multiple entities nudge toward agent', () => {
    const r = classifyAgentRouting({ question: 'How are these connected', intent: { entities: [{ name: 'A' }, { name: 'B' }] } });
    assert.equal(r.useAgent, true);
  });

  it('always returns a recommendation shape', () => {
    const r = classifyAgentRouting({ question: 'anything' });
    assert.ok('useAgent' in r && 'complexity' in r && 'reason' in r && typeof r.score === 'number');
  });
});
