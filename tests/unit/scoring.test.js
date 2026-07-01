import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScores } from '../../src/services/operationalScoringService.js';

// evaluateScores is synchronous — no await needed, but await on sync is harmless

describe('operationalScoringService', () => {
  describe('evaluateScores', () => {
    it('returns an object with all 8 expected score keys', () => {
      const scores = evaluateScores('CTO', 'engineering', 'Critical database migration needed.');
      assert.equal(typeof scores, 'object');
      const expected = [
        'privacy_score', 'intent_score', 'operational_value_score',
        'business_impact_score', 'memory_value_score',
        'authority_score', 'importance_score', 'urgency_score',
      ];
      for (const key of expected) {
        assert.ok(key in scores, `missing key: ${key}`);
      }
    });

    it('all score values are numbers in [0, 1]', () => {
      const scores = evaluateScores('VP Engineering', 'platform', 'Deploy new feature to production tonight.');
      for (const [key, val] of Object.entries(scores)) {
        assert.ok(typeof val === 'number', `${key} should be a number`);
        assert.ok(val >= 0 && val <= 1, `${key} = ${val} should be in [0, 1]`);
      }
    });

    it('urgency_score is higher for critical text than casual text', () => {
      const urgent = evaluateScores('CTO', 'engineering', 'CRITICAL: Production database is down. All hands on deck NOW.');
      const casual = evaluateScores('intern', 'general', 'Just browsing the docs.');
      assert.ok(
        urgent.urgency_score >= casual.urgency_score,
        `urgent urgency (${urgent.urgency_score}) should be >= casual (${casual.urgency_score})`
      );
    });

    it('authority_score for CTO sender is >= authority_score for unknown sender', () => {
      const cto = evaluateScores('CTO', 'engineering', 'Architecture decision made.');
      const anon = evaluateScores('unknown_person', 'random', 'random message here');
      assert.ok(
        cto.authority_score >= anon.authority_score,
        `CTO auth (${cto.authority_score}) should be >= unknown (${anon.authority_score})`
      );
    });

    it('importance_score is high for executive sender with critical content', () => {
      const scores = evaluateScores('CEO', 'all-hands', 'Critical architecture announcement for the company.');
      assert.ok(scores.importance_score >= 0.9, `expected high importance, got ${scores.importance_score}`);
    });

    it('privacy_score is high for personal/medical content', () => {
      const personal = evaluateScores('user', 'dm', 'I have a medical appointment tomorrow, keep this private.');
      assert.ok(personal.privacy_score >= 0.9, `expected high privacy score, got ${personal.privacy_score}`);
    });

    it('privacy_score is low for operational business content', () => {
      const biz = evaluateScores('CTO', 'engineering', 'Deploy service mesh in staging environment.');
      assert.ok(biz.privacy_score < 0.4, `expected low privacy score, got ${biz.privacy_score}`);
    });

    it('operational_value_score rises for infrastructure keywords', () => {
      const infra = evaluateScores('user', 'ops', 'Production database server is unresponsive, Redis cluster issue.');
      const other = evaluateScores('user', 'general', 'The meeting went well.');
      assert.ok(
        infra.operational_value_score >= other.operational_value_score,
        `infra ops score (${infra.operational_value_score}) should be >= other (${other.operational_value_score})`
      );
    });

    it('does not throw on empty text', () => {
      assert.doesNotThrow(() => evaluateScores('user', 'channel', ''));
    });

    it('does not throw on very long text', () => {
      const longText = 'word '.repeat(500);
      assert.doesNotThrow(() => evaluateScores('user', 'channel', longText));
    });

    it('does not throw when sender or channel is null', () => {
      assert.doesNotThrow(() => evaluateScores(null, null, 'some message'));
    });

    it('intent_score increases for actionable text', () => {
      const actionable = evaluateScores('dev', 'eng', 'We need to fix the deploy pipeline immediately.');
      const passive = evaluateScores('dev', 'eng', 'Nothing is happening today.');
      assert.ok(
        actionable.intent_score >= passive.intent_score,
        `actionable intent (${actionable.intent_score}) should be >= passive (${passive.intent_score})`
      );
    });

    it('memory_value_score is high for architectural decision content', () => {
      const archScores = evaluateScores('CTO', 'engineering', 'Architecture decision: migrate to microservices, document the design.');
      assert.ok(archScores.memory_value_score >= 0.8, `expected high memory value, got ${archScores.memory_value_score}`);
    });
  });
});
