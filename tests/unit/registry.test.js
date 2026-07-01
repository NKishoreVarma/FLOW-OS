import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerDatasetType,
  getDatasetHandler,
  hasDatasetType,
  getSupportedTypes,
} from '../../src/core/workspaceLifecycle/datasetRegistry.js';
// Side-effect import to populate all 23 built-in dataset types
import '../../src/core/workspaceLifecycle/datasets/index.js';

const UNIQUE_TYPE = `test_type_${Date.now()}`;

describe('datasetRegistry', () => {
  it('getSupportedTypes returns an array', () => {
    const types = getSupportedTypes();
    assert.ok(Array.isArray(types));
  });

  it('getSupportedTypes returns at least 23 built-in types after importing builtins', () => {
    const types = getSupportedTypes();
    assert.ok(types.length >= 23, `expected >= 23 types but got ${types.length}: ${types.join(', ')}`);
  });

  it('hasDatasetType returns true for known built-in type "employees"', () => {
    assert.ok(hasDatasetType('employees') === true);
  });

  it('hasDatasetType returns true for known built-in type "projects"', () => {
    assert.ok(hasDatasetType('projects') === true);
  });

  it('hasDatasetType returns false for an unknown type', () => {
    assert.ok(hasDatasetType('totally_unknown_type_xyz_9999') === false);
  });

  it('getDatasetHandler returns a handler object for known built-in type', () => {
    const handler = getDatasetHandler('employees');
    assert.ok(handler !== null && typeof handler === 'object');
  });

  it('getDatasetHandler returns null for an unknown type', () => {
    const handler = getDatasetHandler('totally_unknown_type_xyz_9999');
    assert.equal(handler, null);
  });

  it('registerDatasetType stores a custom type that is then retrievable', () => {
    registerDatasetType({
      type: UNIQUE_TYPE,
      validator: (records) => ({ valid: true, errors: [], warnings: [] }),
      normalizer: (r) => r ?? [],
      resolver: () => ({ nodes: [], edges: [] }),
      vectorizer: () => [],
      graphBuilder: () => ({ nodes: [], edges: [] }),
    });
    assert.ok(hasDatasetType(UNIQUE_TYPE) === true);
  });

  it('registered custom type appears in getSupportedTypes()', () => {
    const types = getSupportedTypes();
    assert.ok(types.includes(UNIQUE_TYPE), `${UNIQUE_TYPE} not found in ${types.join(', ')}`);
  });

  it('getDatasetHandler returns the registered custom handler', () => {
    const handler = getDatasetHandler(UNIQUE_TYPE);
    assert.ok(handler !== null);
    assert.equal(typeof handler.validator, 'function');
    assert.equal(typeof handler.normalizer, 'function');
  });

  it('employees handler has all required function fields', () => {
    const handler = getDatasetHandler('employees');
    assert.equal(typeof handler.validator, 'function', 'must have validator');
    assert.equal(typeof handler.normalizer, 'function', 'must have normalizer');
    assert.equal(typeof handler.vectorizer, 'function', 'must have vectorizer');
    assert.equal(typeof handler.graphBuilder, 'function', 'must have graphBuilder');
  });

  it('all 23+ built-in handlers have a validator function', () => {
    const types = getSupportedTypes();
    for (const type of types) {
      const h = getDatasetHandler(type);
      if (h) {
        assert.equal(typeof h.validator, 'function', `${type} must have a validator function`);
      }
    }
  });

  it('registerDatasetType throws when type is missing', () => {
    assert.throws(
      () => registerDatasetType({ validator: () => {}, normalizer: () => {}, resolver: () => {}, vectorizer: () => {}, graphBuilder: () => {} }),
      /type is required/i
    );
  });

  it('registerDatasetType throws when type is not a string', () => {
    assert.throws(
      () => registerDatasetType({ type: 42, validator: () => {} }),
      /type is required/i
    );
  });

  it('known built-in types include "departments", "customers", "repositories"', () => {
    const types = getSupportedTypes();
    for (const expected of ['departments', 'customers', 'repositories']) {
      assert.ok(types.includes(expected), `expected "${expected}" to be registered`);
    }
  });
});
