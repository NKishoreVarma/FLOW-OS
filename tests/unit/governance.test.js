import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../src/core/governance/permissionEvaluator.js';
import { Effect, DEFAULT_ROLE_PERMISSIONS, SIDE_EFFECTFUL_ACTIONS, READ_ONLY_ACTIONS } from '../../src/core/governance/constants.js';

// Note: evaluate({ role, actionType, capability, orgPlan, approvedBy })
// Valid actionTypes from constants.js:
//   Side-effectful: send, create, update, delete, execute, approve, reject
//   Read-only:      read, search, health, audit, sync, webhook

describe('permissionEvaluator (pure fallback)', () => {
  describe('Effect enum', () => {
    it('Effect has ALLOW, DENY, and REQUIRE_APPROVAL values', () => {
      assert.equal(Effect.ALLOW, 'ALLOW');
      assert.equal(Effect.DENY, 'DENY');
      assert.equal(Effect.REQUIRE_APPROVAL, 'REQUIRE_APPROVAL');
    });
  });

  describe('OWNER role', () => {
    it('OWNER can perform "send" action', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'send', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('OWNER can perform "delete" without approval', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'delete', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('OWNER can perform "read" action', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'read', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('OWNER can perform "execute" action without approval', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'execute', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });
  });

  describe('ADMIN role', () => {
    it('ADMIN can perform "read" action', () => {
      const result = evaluate({ role: 'ADMIN', actionType: 'read', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('ADMIN can perform "create" without approval', () => {
      const result = evaluate({ role: 'ADMIN', actionType: 'create', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('ADMIN "delete" requires approval (without approvedBy → REQUIRE_APPROVAL)', () => {
      const result = evaluate({ role: 'ADMIN', actionType: 'delete', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.REQUIRE_APPROVAL);
    });

    it('ADMIN "delete" is ALLOW when approvedBy is provided', () => {
      const result = evaluate({ role: 'ADMIN', actionType: 'delete', orgPlan: 'enterprise', approvedBy: 'owner@corp.com' });
      assert.equal(result.effect, Effect.ALLOW);
    });
  });

  describe('MEMBER role', () => {
    it('MEMBER can "read" without approval', () => {
      const result = evaluate({ role: 'MEMBER', actionType: 'read', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('MEMBER "send" requires approval (REQUIRE_APPROVAL without approvedBy)', () => {
      const result = evaluate({ role: 'MEMBER', actionType: 'send', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.REQUIRE_APPROVAL);
    });

    it('MEMBER "create" requires approval', () => {
      const result = evaluate({ role: 'MEMBER', actionType: 'create', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.REQUIRE_APPROVAL);
    });

    it('MEMBER "send" becomes ALLOW when approvedBy is provided', () => {
      const result = evaluate({ role: 'MEMBER', actionType: 'send', orgPlan: 'enterprise', approvedBy: 'admin@corp.com' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('MEMBER "search" is allowed without approval', () => {
      const result = evaluate({ role: 'MEMBER', actionType: 'search', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });
  });

  describe('VIEWER role', () => {
    it('VIEWER can "read" without approval', () => {
      const result = evaluate({ role: 'VIEWER', actionType: 'read', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('VIEWER cannot "send" (DENY)', () => {
      const result = evaluate({ role: 'VIEWER', actionType: 'send', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.DENY);
    });

    it('VIEWER cannot "delete" (DENY)', () => {
      const result = evaluate({ role: 'VIEWER', actionType: 'delete', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.DENY);
    });
  });

  describe('result structure', () => {
    it('result always has effect and reason', () => {
      const result = evaluate({ role: 'MEMBER', actionType: 'read', orgPlan: 'free' });
      assert.ok('effect' in result, 'must have effect');
      assert.ok('reason' in result, 'must have reason');
      assert.equal(typeof result.reason, 'string');
    });

    it('unknown role returns DENY', () => {
      const result = evaluate({ role: 'SUPER_MEGA_ADMIN', actionType: 'read', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.DENY);
    });

    it('unknown actionType returns DENY (not in allowed list)', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'MANAGE_USERS_INVALID', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.DENY);
    });

    it('evaluate does not throw when called with only role', () => {
      assert.doesNotThrow(() => evaluate({ role: 'OWNER' }));
    });
  });

  describe('plan capability gates', () => {
    it('free plan DENY when capability is not in allowed list', () => {
      // "hr" is not in free plan capabilities
      const result = evaluate({ role: 'OWNER', actionType: 'read', capability: 'hr', orgPlan: 'free' });
      assert.equal(result.effect, Effect.DENY);
    });

    it('enterprise plan allows any capability', () => {
      // enterprise has capabilities: 'all'
      const result = evaluate({ role: 'OWNER', actionType: 'read', capability: 'hr', orgPlan: 'enterprise' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('free plan allows "knowledge" capability', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'read', capability: 'knowledge', orgPlan: 'free' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('pro plan allows "crm" capability', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'read', capability: 'crm', orgPlan: 'pro' });
      assert.equal(result.effect, Effect.ALLOW);
    });

    it('starter plan denies "crm" capability', () => {
      const result = evaluate({ role: 'OWNER', actionType: 'read', capability: 'crm', orgPlan: 'starter' });
      assert.equal(result.effect, Effect.DENY);
    });
  });

  describe('constants', () => {
    it('SIDE_EFFECTFUL_ACTIONS contains expected actions', () => {
      for (const action of ['send', 'create', 'update', 'delete', 'execute']) {
        assert.ok(SIDE_EFFECTFUL_ACTIONS.includes(action), `expected ${action} in SIDE_EFFECTFUL_ACTIONS`);
      }
    });

    it('READ_ONLY_ACTIONS contains read and search', () => {
      assert.ok(READ_ONLY_ACTIONS.includes('read'));
      assert.ok(READ_ONLY_ACTIONS.includes('search'));
    });

    it('DEFAULT_ROLE_PERMISSIONS has all four roles', () => {
      for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']) {
        assert.ok(role in DEFAULT_ROLE_PERMISSIONS, `${role} missing from DEFAULT_ROLE_PERMISSIONS`);
      }
    });
  });
});
