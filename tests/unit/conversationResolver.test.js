import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConversation } from '../../src/ai/reasoning/conversationResolver.js';

describe('ConversationResolver (5F/5G)', () => {
  it('no pronoun → passes the question through unchanged', () => {
    const r = resolveConversation('Who owns HELIOS-448?', []);
    assert.equal(r.hasPronoun, false);
    assert.equal(r.effectiveQuestion, 'Who owns HELIOS-448?');
  });

  it('pronoun with NO history → asks for clarification (never invents)', () => {
    const r = resolveConversation('Who reports to him?', []);
    assert.equal(r.hasPronoun, true);
    assert.equal(r.needsClarification, true);
    assert.equal(r.resolved, false);
  });

  it('person pronoun resolves to the last-named person', () => {
    const r = resolveConversation('Who reports to him?', [{ role: 'assistant', content: 'Kishore reports to Arjun Mehta.' }]);
    assert.equal(r.resolved, true);
    assert.equal(r.carried.value, 'Arjun Mehta');
    assert.ok(r.effectiveQuestion.includes('Arjun Mehta'));
  });

  it('"that PR" resolves to the last PR id in context', () => {
    const r = resolveConversation('Who authored that PR?', [{ role: 'assistant', content: 'PR-247 is awaiting review.' }]);
    assert.equal(r.resolved, true);
    assert.equal(r.carried.value, 'PR-247');
  });

  it('"that incident" with no incident in context → clarification', () => {
    const r = resolveConversation('Why is that incident open?', [{ role: 'assistant', content: 'Everything looks calm.' }]);
    assert.equal(r.needsClarification, true);
    assert.equal(r.resolved, false);
  });

  it('pure conversational turns are flagged', () => {
    for (const q of ['thanks', 'continue', 'ok', 'hello']) {
      assert.equal(resolveConversation(q, []).isConversational, true, q);
    }
  });
});
