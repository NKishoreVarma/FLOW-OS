import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAgentModeEnabled, runReasoningAgentMode } from '../../src/ai/agent/brainIntegration.js';

describe('OperationalBrain ↔ AgentRuntime wiring (Stage 4C)', () => {
  it('agent mode is OFF by default', () => {
    const saved = process.env.AGENT_MODE;
    delete process.env.AGENT_MODE;
    assert.equal(isAgentModeEnabled({}), false, 'default is OFF');
    assert.equal(isAgentModeEnabled({ agentMode: undefined }), false);
    if (saved !== undefined) process.env.AGENT_MODE = saved;
  });

  it('agent mode turns on only via explicit opt-in or AGENT_MODE=on', () => {
    assert.equal(isAgentModeEnabled({ agentMode: true }), true, 'explicit opt-in');
    assert.equal(isAgentModeEnabled({ agentMode: false }), false, 'explicit opt-out wins');

    const saved = process.env.AGENT_MODE;
    process.env.AGENT_MODE = 'on';
    assert.equal(isAgentModeEnabled({}), true, 'env flag');
    process.env.AGENT_MODE = 'off';
    assert.equal(isAgentModeEnabled({}), false);
    if (saved === undefined) delete process.env.AGENT_MODE; else process.env.AGENT_MODE = saved;
  });

  it('agent mode returns a BrainResponse shape that passed through verification', async () => {
    // Internal read tools may or may not have live data here; either way the shape
    // is valid and the answer is verification-backed (never fabricated).
    const resp = await runReasoningAgentMode('workspace_wiring_test', {
      question: 'What is currently at risk?', role: 'MEMBER', orgPlan: 'enterprise',
    });
    assert.equal(resp.agentMode, true);
    assert.equal(typeof resp.answer, 'string');
    assert.ok(resp.answer.length > 0);
    assert.ok(resp.confidence && typeof resp.confidence.score === 'number', 'confidence from ConfidenceScorer');
    assert.ok(resp.reasoning && resp.reasoning.verification, 'verification present');
    assert.ok(resp._agentTrace && typeof resp._agentTrace.plannerCalls === 'number', 'observability trace present');
    assert.ok('evidence' in resp && typeof resp.evidence.total === 'number');
  });
});
