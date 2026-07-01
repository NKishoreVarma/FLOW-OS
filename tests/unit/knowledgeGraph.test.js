import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerEntity,
  linkEntities,
  getRelatedContext,
  extractEntitiesFromText,
  getGraphMetrics,
  EntityTypes,
} from '../../src/services/knowledgeGraphService.js';

// The graph is module-level in-memory state with no clearGraph export.
// Each test uses unique IDs (timestamp + random suffix) to avoid cross-test collisions.

function uid(prefix = 'e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

describe('knowledgeGraphService', () => {
  describe('registerEntity', () => {
    it('registerEntity does not throw for a new entity', () => {
      assert.doesNotThrow(() => registerEntity(uid('user'), 'USER', 'Alice Test'));
    });

    it('duplicate registerEntity with same ID does not throw (idempotent)', () => {
      const id = uid('dup');
      assert.doesNotThrow(() => {
        registerEntity(id, 'USER', 'Bob Test');
        registerEntity(id, 'USER', 'Bob Test');
      });
    });

    it('can register multiple entity types without conflict', () => {
      assert.doesNotThrow(() => {
        ['USER', 'PROJECT', 'CUSTOMER', 'REPOSITORY', 'INCIDENT', 'TEAM', 'DECISION'].forEach((type, i) => {
          registerEntity(uid(`multi-${i}`), type, `Name ${i}`);
        });
      });
    });

    it('EntityTypes exports the expected types', () => {
      const expected = ['USER', 'PROJECT', 'CUSTOMER', 'INCIDENT', 'TEAM', 'DECISION', 'SYSTEM', 'ISSUE', 'DEPARTMENT', 'OPPORTUNITY', 'EVENT'];
      for (const t of expected) {
        assert.ok(t in EntityTypes, `expected EntityTypes.${t} to exist`);
      }
    });
  });

  describe('getRelatedContext', () => {
    it('returns empty array for an unknown entity', () => {
      const result = getRelatedContext('entity-does-not-exist-xyz-12345');
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('returns empty array for a registered entity with no edges', () => {
      const id = uid('isolated');
      registerEntity(id, 'USER', 'Isolated Node');
      const result = getRelatedContext(id);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('returns array of strings (relationship descriptions)', () => {
      const srcId = uid('src');
      const tgtId = uid('tgt');
      registerEntity(srcId, 'USER', 'Alice');
      registerEntity(tgtId, 'PROJECT', 'Project Alpha');
      linkEntities(srcId, tgtId, 'WORKS_ON');
      const result = getRelatedContext(srcId);
      assert.ok(Array.isArray(result));
      if (result.length > 0) {
        assert.equal(typeof result[0], 'string');
      }
    });
  });

  describe('linkEntities', () => {
    it('linkEntities does not throw for registered entities', () => {
      const srcId = uid('link-src');
      const tgtId = uid('link-tgt');
      registerEntity(srcId, 'USER', 'User A');
      registerEntity(tgtId, 'TEAM', 'Team B');
      assert.doesNotThrow(() => linkEntities(srcId, tgtId, 'BELONGS_TO'));
    });

    it('linkEntities silently ignores unregistered source entity', () => {
      const tgtId = uid('lnk-tgt2');
      registerEntity(tgtId, 'PROJECT', 'Project B');
      assert.doesNotThrow(() => linkEntities('nonexistent-src-abc', tgtId, 'WORKS_ON'));
    });

    it('linkEntities silently ignores unregistered target entity', () => {
      const srcId = uid('lnk-src2');
      registerEntity(srcId, 'USER', 'User C');
      assert.doesNotThrow(() => linkEntities(srcId, 'nonexistent-tgt-abc', 'WORKS_ON'));
    });

    it('creates traversable relationship (2-hop context includes indirect neighbors)', () => {
      const aId = uid('hop-a');
      const bId = uid('hop-b');
      const cId = uid('hop-c');
      registerEntity(aId, 'USER', 'Hop A');
      registerEntity(bId, 'PROJECT', 'Hop B');
      registerEntity(cId, 'CUSTOMER', 'Hop C');
      linkEntities(aId, bId, 'WORKS_ON');
      linkEntities(bId, cId, 'SERVES');

      // 2-hop from aId should include context strings that mention bId/cId relationships
      const context = getRelatedContext(aId);
      assert.ok(Array.isArray(context), 'context should be an array');
      // With 2 edges, we expect at least one context string describing the path
      assert.ok(context.length >= 1, `expected context strings, got: ${JSON.stringify(context)}`);
    });
  });

  describe('extractEntitiesFromText', () => {
    it('returns an array', () => {
      const result = extractEntitiesFromText('Some text here.');
      assert.ok(Array.isArray(result));
    });

    it('returns empty array for empty text', () => {
      const result = extractEntitiesFromText('');
      assert.deepEqual(result, []);
    });

    it('returns empty array for null text', () => {
      const result = extractEntitiesFromText(null);
      assert.deepEqual(result, []);
    });

    it('finds a registered entity whose name appears in text', () => {
      const entityId = uid('found');
      const entityName = `UniqueEntityNameForTest${Date.now()}`;
      registerEntity(entityId, 'PROJECT', entityName);
      const result = extractEntitiesFromText(`We are working on ${entityName} this quarter.`);
      assert.ok(result.includes(entityId), `expected ${entityId} in found entities: ${JSON.stringify(result)}`);
    });
  });

  describe('getGraphMetrics', () => {
    it('returns an object with nodesCount, edgesCount, and nodes', () => {
      const metrics = getGraphMetrics();
      assert.equal(typeof metrics, 'object');
      assert.ok('nodesCount' in metrics, 'missing nodesCount');
      assert.ok('edgesCount' in metrics, 'missing edgesCount');
      assert.ok('nodes' in metrics, 'missing nodes');
    });

    it('nodesCount increases after registering a new entity', () => {
      const before = getGraphMetrics().nodesCount;
      registerEntity(uid('metric'), 'SYSTEM', 'New System Node');
      const after = getGraphMetrics().nodesCount;
      assert.ok(after >= before + 1, `expected nodesCount to increase: ${before} → ${after}`);
    });

    it('nodes is an array', () => {
      const metrics = getGraphMetrics();
      assert.ok(Array.isArray(metrics.nodes));
    });

    it('nodesCount equals nodes.length', () => {
      const metrics = getGraphMetrics();
      assert.equal(metrics.nodesCount, metrics.nodes.length);
    });
  });
});
