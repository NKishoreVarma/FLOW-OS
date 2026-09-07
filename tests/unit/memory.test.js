import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideRetention,
  scoreImportance,
  scoreAuthority,
  scoreUrgency,
  evaluateChunk,
} from '../../src/services/memoryBrain.js';

// evaluateChunk is synchronous — no await needed

describe('memoryBrain', () => {
  const baseMeta = { workspaceId: 'ws-test', source: 'slack', sender: 'CTO', channel: 'engineering' };

  // ── Pure helper: scoreImportance ──────────────────────────────────────────

  describe('scoreImportance', () => {
    it('returns a number between 0.05 and 1.0', () => {
      const score = scoreImportance('Deploy production database migration tonight.');
      assert.ok(typeof score === 'number');
      assert.ok(score >= 0.05 && score <= 1.0);
    });

    it('scores higher for text with technical keywords than keyword-free text', () => {
      const high = scoreImportance('Critical architecture migration deployment production security vulnerability.');
      const low  = scoreImportance('The weather is nice today and everyone is in good spirits and having a wonderful time.');
      assert.ok(high > low, `high (${high}) should exceed low (${low})`);
    });

    it('minimum floor is 0.05 even for empty text', () => {
      const score = scoreImportance('');
      assert.ok(score >= 0.05);
    });
  });

  // ── Pure helper: scoreAuthority ───────────────────────────────────────────

  describe('scoreAuthority', () => {
    it('returns a number between 0 and 1', () => {
      const score = scoreAuthority({ sender: 'CTO', source: 'github' });
      assert.ok(score >= 0 && score <= 1);
    });

    it('executive sender scores higher than unknown sender', () => {
      const exec = scoreAuthority({ sender: 'ceo', source: 'slack' });
      const anon = scoreAuthority({ sender: 'random', source: 'chat' });
      assert.ok(exec > anon, `CEO (${exec}) should be > anon (${anon})`);
    });

    it('verified source boosts authority over unknown source', () => {
      const git  = scoreAuthority({ sender: 'unknown', source: 'github' });
      const none = scoreAuthority({ sender: 'unknown', source: 'unknown' });
      assert.ok(git >= none);
    });

    it('does not throw on empty metadata', () => {
      assert.doesNotThrow(() => scoreAuthority({}));
    });
  });

  // ── Pure helper: scoreUrgency ─────────────────────────────────────────────

  describe('scoreUrgency', () => {
    it('returns 0.0 for text with no urgency keywords', () => {
      const score = scoreUrgency('Team meeting notes from today.');
      assert.equal(score, 0.0);
    });

    it('returns 0.3 for text with exactly one urgency keyword', () => {
      const score = scoreUrgency('There is an outage in production.');
      assert.equal(score, 0.3);
    });

    it('returns 0.5 for text with two urgency keywords', () => {
      const score = scoreUrgency('Critical outage detected in production.');
      assert.equal(score, 0.5);
    });

    it('returns 0.7 for text with 3-4 urgency keywords', () => {
      const score = scoreUrgency('Critical outage incident: system is broken.');
      assert.ok(score >= 0.7, `expected >= 0.7, got ${score}`);
    });

    it('returns 1.0 for text with 5+ urgency keywords', () => {
      const score = scoreUrgency('critical outage incident broken crash crashed data loss security breach');
      assert.equal(score, 1.0);
    });
  });

  // ── Pure helper: decideRetention ─────────────────────────────────────────

  describe('decideRetention', () => {
    it('PERMANENT when composite >= 0.70', () => {
      // (1.0 * 0.45) + (1.0 * 0.35) + (0.0 * 0.20) = 0.80
      assert.equal(decideRetention(1.0, 1.0, 0.0), 'PERMANENT');
    });

    it('90_DAYS when composite is between 0.50 and 0.70', () => {
      // (0.7 * 0.45) + (0.7 * 0.35) + (0.0 * 0.20) = 0.315 + 0.245 = 0.56
      assert.equal(decideRetention(0.7, 0.7, 0.0), '90_DAYS');
    });

    it('30_DAYS when composite is between 0.30 and 0.50', () => {
      // (0.5 * 0.45) + (0.5 * 0.35) + (0.0 * 0.20) = 0.225 + 0.175 = 0.40
      assert.equal(decideRetention(0.5, 0.5, 0.0), '30_DAYS');
    });

    it('24_HOURS when composite is between 0.15 and 0.30', () => {
      // (0.2 * 0.45) + (0.2 * 0.35) + (0.0 * 0.20) = 0.09 + 0.07 = 0.16
      assert.equal(decideRetention(0.2, 0.2, 0.0), '24_HOURS');
    });

    it('DISCARD when composite is below 0.15', () => {
      assert.equal(decideRetention(0.05, 0.05, 0.0), 'DISCARD');
    });

    it('urgency >= 0.7 fast-path returns 24_HOURS when importance or authority below 0.6', () => {
      // urgency >= 0.7 but importance < 0.6 → 24_HOURS
      assert.equal(decideRetention(0.3, 0.3, 0.7), '24_HOURS');
    });

    it('urgency >= 0.7 with importance >= 0.6 AND authority >= 0.6 returns PERMANENT', () => {
      assert.equal(decideRetention(0.6, 0.6, 0.7), 'PERMANENT');
    });
  });

  // ── Integration: evaluateChunk ────────────────────────────────────────────

  describe('evaluateChunk', () => {
    it('returns object with all expected keys', () => {
      const result = evaluateChunk('Database migration needed by EOD.', baseMeta);
      assert.equal(typeof result, 'object');
      const expected = ['importance_score', 'authority_score', 'urgency_score', 'composite_score', 'retention_policy', 'telemetry_event'];
      for (const key of expected) {
        assert.ok(key in result, `missing key: ${key}`);
      }
    });

    it('retention_policy is one of the valid string values', () => {
      const result = evaluateChunk('Team standup notes.', baseMeta);
      const valid = ['PERMANENT', '90_DAYS', '30_DAYS', '24_HOURS', 'DISCARD'];
      assert.ok(valid.includes(result.retention_policy), `unexpected policy: ${result.retention_policy}`);
    });

    it('composite_score is a number in [0, 1]', () => {
      const result = evaluateChunk('Deploy to production.', baseMeta);
      assert.ok(result.composite_score >= 0 && result.composite_score <= 1);
    });

    it('high-value executive text returns PERMANENT or long-term policy', () => {
      const result = evaluateChunk(
        'Critical architecture migration: production database schema change approved by CEO.',
        { ...baseMeta, sender: 'CEO', source: 'github' }
      );
      const longTerm = ['PERMANENT', '90_DAYS'];
      assert.ok(
        longTerm.includes(result.retention_policy),
        `expected long-term policy but got: ${result.retention_policy}`
      );
    });

    it('does not throw on empty string', () => {
      assert.doesNotThrow(() => evaluateChunk('', baseMeta));
    });

    it('does not throw on missing metadata', () => {
      assert.doesNotThrow(() => evaluateChunk('Some text'));
    });

    it('telemetry_event is one of the valid MEMORY_ event strings', () => {
      const result = evaluateChunk('Critical outage incident.', baseMeta);
      const valid = ['MEMORY_RETAINED', 'MEMORY_EXPIRED', 'MEMORY_DISCARDED', 'MEMORY_ESCALATED'];
      assert.ok(valid.includes(result.telemetry_event), `unexpected event: ${result.telemetry_event}`);
    });
  });
});
