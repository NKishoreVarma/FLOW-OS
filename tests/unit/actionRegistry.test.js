/**
 * Unit tests — Universal Action Registry (Phase 7)
 *
 * Run: node --experimental-vm-modules node_modules/.bin/jest tests/unit/actionRegistry.test.js
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry }       from '../../src/actionRegistry/ActionRegistry.js';
import { ActionValidator, RegistryValidationError } from '../../src/actionRegistry/ActionValidator.js';
import { ActionSearch }         from '../../src/actionRegistry/ActionSearch.js';

function expect(actual) {
  return {
    toBe(expected) { assert.strictEqual(actual, expected); },
    toEqual(expected) { assert.deepStrictEqual(actual, expected); },
    toBeDefined() { assert.notStrictEqual(actual, undefined); },
    toBeGreaterThan(val) { assert.ok(actual > val, `expected ${actual} > ${val}`); },
    toContain(val) { assert.ok(actual?.includes ? actual.includes(val) : false, `expected to contain ${val}`); },
    toHaveLength(len) { assert.strictEqual(actual.length, len); },
    toThrow(expectedError) {
      if (typeof actual === 'function') {
        if (expectedError) assert.throws(actual, expectedError);
        else assert.throws(actual);
      }
    },
    not: {
      toThrow() { if (typeof actual === 'function') assert.doesNotThrow(actual); },
      toBe(val) { assert.notStrictEqual(actual, val); },
      toContain(val) { assert.ok(!actual?.includes(val)); }
    }
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAction(overrides = {}) {
  return {
    id:          'test.action',
    version:     '1.0.0',
    lifecycle:   'ACTIVE',
    connector:   'test',
    category:    'UTILITY',
    displayName: 'Test Action',
    description: 'A test action',
    tags:        ['test'],
    riskLevel:   'LOW',
    approvalPolicy: { default: 'auto' },
    requiredPermissions: [],
    requiredScopes:      [],
    executionMode:    'SYNC',
    estimatedDurationMs: 500,
    timeoutMs:  5000,
    retryStrategy:        { maxAttempts: 3, backoffMs: 1000 },
    rollbackStrategy:     { type: 'NONE' },
    verificationStrategy: { type: 'NONE' },
    requiredInputs: [{ name: 'resourceId', type: 'string' }],
    optionalInputs: [],
    outputSchema:   { resourceId: 'string' },
    auditMetadata:    { eventType: 'TEST_ACTION', sensitiveFields: [] },
    telemetryMetadata: { metricName: 'test.action', tags: [] },
    ...overrides,
  };
}

// ── ActionValidator ───────────────────────────────────────────────────────────

describe('ActionValidator.validateDefinition', () => {
  test('passes a valid definition', () => {
    expect(() => ActionValidator.validateDefinition(makeAction())).not.toThrow();
  });

  test('rejects missing id', () => {
    expect(() => ActionValidator.validateDefinition(makeAction({ id: undefined }))).toThrow(RegistryValidationError);
  });

  test('rejects malformed id (no connector prefix)', () => {
    expect(() => ActionValidator.validateDefinition(makeAction({ id: 'badformat' }))).toThrow(RegistryValidationError);
  });

  test('rejects invalid semver', () => {
    expect(() => ActionValidator.validateDefinition(makeAction({ version: 'v1' }))).toThrow(RegistryValidationError);
  });

  test('rejects unknown riskLevel', () => {
    expect(() => ActionValidator.validateDefinition(makeAction({ riskLevel: 'ULTRA' }))).toThrow(RegistryValidationError);
  });

  test('rejects unknown lifecycle', () => {
    expect(() => ActionValidator.validateDefinition(makeAction({ lifecycle: 'GA' }))).toThrow(RegistryValidationError);
  });

  test('rejects timeoutMs <= estimatedDurationMs', () => {
    expect(() => ActionValidator.validateDefinition(makeAction({ timeoutMs: 499, estimatedDurationMs: 500 }))).toThrow(RegistryValidationError);
  });
});

describe('ActionValidator.validateInputs', () => {
  const def = makeAction({ requiredInputs: [{ name: 'resourceId', type: 'string' }] });

  test('passes when required input is present', () => {
    const result = ActionValidator.validateInputs(def, { resourceId: 'abc' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('fails when required input is missing', () => {
    const result = ActionValidator.validateInputs(def, {});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => String(e?.message || e).includes('resourceId'))).toBe(true);
  });
});

// ── ActionRegistry ────────────────────────────────────────────────────────────

describe('ActionRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  test('resolves a loaded action', () => {
    registry.load([makeAction()]);
    const def = registry.resolve('test.action');
    expect(def.id).toBe('test.action');
  });

  test('throws ActionNotFoundError for unknown id', () => {
    registry.load([]);
    expect(() => registry.resolve('no.such')).toThrow('not found');
  });

  test('skips REMOVED lifecycle actions on load', () => {
    registry.load([makeAction({ lifecycle: 'REMOVED' })]);
    expect(() => registry.resolve('test.action')).toThrow();
  });

  test('list filters by connector', () => {
    registry.load([
      makeAction({ id: 'gmail.read',  connector: 'gmail' }),
      makeAction({ id: 'jira.create', connector: 'jira'  }),
    ]);
    const gmailActions = registry.list({ connector: 'gmail' });
    expect(gmailActions).toHaveLength(1);
    expect(gmailActions[0].id).toBe('gmail.read');
  });

  test('list filters by riskLevel', () => {
    registry.load([
      makeAction({ id: 'gmail.read',  riskLevel: 'LOW'    }),
      makeAction({ id: 'gmail.send',  riskLevel: 'MEDIUM' }),
    ]);
    expect(registry.list({ riskLevel: 'LOW' })).toHaveLength(1);
  });

  test('stats reflects loaded count', () => {
    registry.load([makeAction({ id: 'gmail.read', connector: 'gmail' })]);
    const stats = registry.stats();
    expect(stats.total).toBe(1);
    expect(stats.byConnector.gmail).toBe(1);
  });

  test('validateInputs delegates to ActionValidator', () => {
    registry.load([makeAction({ id: 'test.action', requiredInputs: [{ name: 'resourceId', type: 'string' }] })]);
    const ok = registry.validateInputs('test.action', { resourceId: 'abc' });
    expect(ok.valid).toBe(true);
    const fail = registry.validateInputs('test.action', {});
    expect(fail.valid).toBe(false);
  });

  test('register() adds an action at runtime', () => {
    registry.load([]);
    registry.register(makeAction({ id: 'dynamic.action', connector: 'dynamic' }));
    expect(registry.resolve('dynamic.action').id).toBe('dynamic.action');
  });

  test('clear() empties the registry', () => {
    registry.load([makeAction()]);
    registry.clear();
    const stats = registry.stats();
    expect(stats.total).toBe(0);
  });
});

// ── ActionSearch ──────────────────────────────────────────────────────────────

describe('ActionSearch (static)', () => {
  const definitions = [
    makeAction({ id: 'gmail.send_email',    displayName: 'Send Email',    tags: ['email', 'send'],    connector: 'gmail', description: 'Composes and sends an email' }),
    makeAction({ id: 'gmail.read_email',    displayName: 'Read Email',    tags: ['email', 'read'],    connector: 'gmail', description: 'Reads a single email message' }),
    makeAction({ id: 'jira.create_issue',   displayName: 'Create Issue',  tags: ['issue', 'create'],  connector: 'jira',  description: 'Creates a new Jira issue' }),
    makeAction({ id: 'jira.close_issue',    displayName: 'Close Issue',   tags: ['issue', 'close'],   connector: 'jira',  description: 'Closes a Jira issue with resolution' }),
  ];

  test('exact id match returns high-score result', () => {
    const results = ActionSearch.search('gmail.send_email', definitions);
    expect(results[0].id).toBe('gmail.send_email');
  });

  test('tag match surfaces relevant results', () => {
    const results = ActionSearch.search('email', definitions);
    expect(results.every(r => r.connector === 'gmail')).toBe(true);
  });

  test('displayName keyword match works', () => {
    const results = ActionSearch.search('issue', definitions);
    expect(results.some(r => r.connector === 'jira')).toBe(true);
  });

  test('returns empty for no match', () => {
    const results = ActionSearch.search('xyzzy_no_match_ever', definitions);
    expect(results).toHaveLength(0);
  });
});
