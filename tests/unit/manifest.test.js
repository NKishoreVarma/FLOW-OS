import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseManifest,
  getCompatibilityStatus,
  ENGINE_VERSION,
  SCHEMA_VERSION_FLOOR,
} from '../../src/core/workspaceLifecycle/manifestParser.js';
// Import builtins so that known dataset types are registered before parseManifest validates them
import '../../src/core/workspaceLifecycle/datasets/index.js';

const VALID_MANIFEST = {
  schemaVersion: '1.0',
  organization: { name: 'Test Corp', slug: 'test-corp', industry: 'Tech', size: 50 },
  datasets: [{ type: 'employees' }, { type: 'departments' }],
};

describe('manifestParser', () => {
  it('exports ENGINE_VERSION as a non-empty string', () => {
    assert.equal(typeof ENGINE_VERSION, 'string');
    assert.ok(ENGINE_VERSION.length > 0);
  });

  it('exports SCHEMA_VERSION_FLOOR as a non-empty string', () => {
    assert.equal(typeof SCHEMA_VERSION_FLOOR, 'string');
    assert.ok(SCHEMA_VERSION_FLOOR.length > 0);
  });

  it('parseManifest returns valid: true for a well-formed manifest', () => {
    const result = parseManifest(VALID_MANIFEST);
    assert.ok(result.valid === true, `expected valid:true but errors: ${JSON.stringify(result.errors)}`);
  });

  it('parseManifest preserves organization.slug', () => {
    const result = parseManifest(VALID_MANIFEST);
    assert.equal(result.organization?.slug, 'test-corp');
  });

  it('parseManifest returns valid: false with errors for null input', () => {
    const result = parseManifest(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('parseManifest returns valid: false with errors for non-object input', () => {
    const result = parseManifest('not an object');
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('parseManifest returns valid: false when organization is missing', () => {
    const result = parseManifest({ schemaVersion: '1.0', datasets: [{ type: 'employees' }] });
    assert.equal(result.valid, false);
    const orgErrors = result.errors.filter(e => /organization/i.test(e));
    assert.ok(orgErrors.length > 0, 'should have organization-related error');
  });

  it('parseManifest returns valid: false when schemaVersion is missing', () => {
    const result = parseManifest({ organization: { name: 'X', slug: 'x' }, datasets: [{ type: 'employees' }] });
    assert.equal(result.valid, false);
    const versionErrors = result.errors.filter(e => /schema|version/i.test(e));
    assert.ok(versionErrors.length > 0, 'should have schemaVersion error');
  });

  it('parseManifest returns valid: false when datasets is empty array', () => {
    const result = parseManifest({ schemaVersion: '1.0', organization: { name: 'X', slug: 'x' }, datasets: [] });
    assert.equal(result.valid, false);
    const dsErrors = result.errors.filter(e => /datasets/i.test(e));
    assert.ok(dsErrors.length > 0, 'should have datasets error');
  });

  it('parseManifest preserves datasets array on valid manifest', () => {
    const result = parseManifest(VALID_MANIFEST);
    assert.ok(Array.isArray(result.datasets));
    assert.ok(result.datasets.length >= 2);
  });

  it('parseManifest adds a warning for unknown dataset type', () => {
    const manifest = {
      ...VALID_MANIFEST,
      datasets: [{ type: 'employees' }, { type: 'totally_unknown_custom_type_xyz' }],
    };
    const result = parseManifest(manifest);
    assert.ok(result.warnings.some(w => /unknown|totally_unknown/i.test(w)), 'should warn about unknown type');
  });

  it('getCompatibilityStatus returns COMPATIBLE for version 1.0', () => {
    assert.equal(getCompatibilityStatus('1.0'), 'COMPATIBLE');
  });

  it('getCompatibilityStatus returns COMPATIBLE for version 2.0', () => {
    assert.equal(getCompatibilityStatus('2.0'), 'COMPATIBLE');
  });

  it('getCompatibilityStatus returns INCOMPATIBLE for version 0.1', () => {
    assert.equal(getCompatibilityStatus('0.1'), 'INCOMPATIBLE');
  });

  it('getCompatibilityStatus returns INCOMPATIBLE for null input', () => {
    assert.equal(getCompatibilityStatus(null), 'INCOMPATIBLE');
  });

  it('parseManifest result always has errors and warnings arrays', () => {
    const result = parseManifest(VALID_MANIFEST);
    assert.ok(Array.isArray(result.errors));
    assert.ok(Array.isArray(result.warnings));
  });
});
