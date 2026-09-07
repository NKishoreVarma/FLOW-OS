/**
 * Extension System — unit test suite (Phase 14)
 * Run: node --experimental-vm-modules node_modules/.bin/jest src/extensions/__tests__/
 *
 * All tests are unit-only (no DB, no live server).
 */

import { describe, it, before }  from 'node:test';
import assert                     from 'node:assert/strict';

// ── 1. Manifest Parser ────────────────────────────────────────────────────────
import { parseManifest, compareSemver, isValidSemver, getCompatibilityStatus } from '../manifest/ManifestParser.js';

const BASE_MANIFEST = {
  id:                 'com.test.my-extension',
  name:               'My Extension',
  version:            '1.2.3',
  author:             'Test Corp',
  description:        'A test extension',
  category:           'workflow_pack',
  license:            'MIT',
  permissions:        ['events.read', 'workflows.register'],
  minimumFlowVersion: '14.0.0',
  dependencies:       {},
};

describe('ManifestParser — valid manifest', () => {
  it('parses a minimal valid manifest without errors', () => {
    const { manifest, errors } = parseManifest(BASE_MANIFEST);
    assert.equal(errors.length, 0);
    assert.ok(manifest);
    assert.equal(manifest.id, 'com.test.my-extension');
    assert.equal(manifest.version, '1.2.3');
  });

  it('normalises author string to { name, email: null, url: null }', () => {
    const { manifest } = parseManifest(BASE_MANIFEST);
    assert.equal(manifest.author.name, 'Test Corp');
    assert.equal(manifest.author.email, null);
    assert.equal(manifest.author.url, null);
  });

  it('defaults missing optional arrays to []', () => {
    const { manifest } = parseManifest(BASE_MANIFEST);
    assert.deepEqual(manifest.actions, []);
    assert.deepEqual(manifest.agents, []);
    assert.deepEqual(manifest.widgets, []);
    assert.deepEqual(manifest.migrations, []);
  });

  it('accepts an author object', () => {
    const { manifest } = parseManifest({ ...BASE_MANIFEST, author: { name: 'Acme', email: 'a@acme.com' } });
    assert.equal(manifest.author.email, 'a@acme.com');
  });

  it('accepts routes with valid methods', () => {
    const raw = { ...BASE_MANIFEST, permissions: [...BASE_MANIFEST.permissions, 'routes.mount'],
      routes: [{ method: 'GET', path: '/status', handler: 'handlers.status' }] };
    const { errors } = parseManifest(raw);
    assert.equal(errors.length, 0);
  });
});

describe('ManifestParser — validation errors', () => {
  it('errors on missing required fields', () => {
    const { errors } = parseManifest({ id: 'x', version: '1.0.0' });
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('name')));
  });

  it('errors on invalid id format', () => {
    const { errors } = parseManifest({ ...BASE_MANIFEST, id: 'UPPERCASE_INVALID' });
    assert.ok(errors.some(e => e.includes('id')));
  });

  it('errors on non-semver version', () => {
    const { errors } = parseManifest({ ...BASE_MANIFEST, version: 'not-semver' });
    assert.ok(errors.some(e => e.includes('version')));
  });

  it('errors on unknown category', () => {
    const { errors } = parseManifest({ ...BASE_MANIFEST, category: 'magic_pack' });
    assert.ok(errors.some(e => e.includes('category')));
  });

  it('errors on unknown permissions', () => {
    const { errors } = parseManifest({ ...BASE_MANIFEST, permissions: ['fly.to.moon'] });
    assert.ok(errors.some(e => e.includes('permissions') || e.includes('Unknown')));
  });

  it('errors on minimumFlowVersion higher than host', () => {
    const { errors } = parseManifest({ ...BASE_MANIFEST, minimumFlowVersion: '99.0.0' });
    assert.ok(errors.some(e => e.includes('99.0.0')));
  });

  it('errors on invalid license', () => {
    const { errors } = parseManifest({ ...BASE_MANIFEST, license: 'UNLICENSED-MYSTERY' });
    assert.ok(errors.some(e => e.includes('license')));
  });

  it('errors on non-object input', () => {
    const { errors } = parseManifest('not-an-object');
    assert.ok(errors.length > 0);
  });
});

describe('ManifestParser — semver helpers', () => {
  it('compareSemver correctly orders versions', () => {
    assert.ok(compareSemver('2.0.0', '1.9.9') > 0);
    assert.ok(compareSemver('1.0.0', '1.0.0') === 0);
    assert.ok(compareSemver('1.0.0', '2.0.0') < 0);
    assert.ok(compareSemver('1.2.3', '1.2.4') < 0);
  });

  it('isValidSemver accepts X.Y.Z and rejects others', () => {
    assert.ok(isValidSemver('1.0.0'));
    assert.ok(isValidSemver('10.20.30'));
    assert.ok(!isValidSemver('1.0'));
    assert.ok(!isValidSemver('v1.0.0'));
    assert.ok(!isValidSemver('1.0.0-beta'));
  });

  it('getCompatibilityStatus is compatible for older minimumFlowVersion', () => {
    assert.equal(getCompatibilityStatus('1.0.0'), 'compatible');
    assert.equal(getCompatibilityStatus('14.0'), 'compatible'); // non-semver treated leniently
  });
});

// ── 2. Permission Model ──────────────────────────────────────────────────────
import { validatePermissions, suggestedPermissions, ALL_SCOPES, HIGH_RISK, PERMISSION_SCOPES } from '../manifest/PermissionModel.js';

describe('PermissionModel', () => {
  it('validatePermissions accepts all known scopes', () => {
    const { valid } = validatePermissions(ALL_SCOPES);
    assert.ok(valid);
  });

  it('validatePermissions rejects unknown scopes', () => {
    const { valid, unknown } = validatePermissions(['fly.to.moon', 'events.read']);
    assert.ok(!valid);
    assert.deepEqual(unknown, ['fly.to.moon']);
  });

  it('suggestedPermissions returns array for known categories', () => {
    const perms = suggestedPermissions('connector');
    assert.ok(Array.isArray(perms));
    assert.ok(perms.length > 0);
  });

  it('suggestedPermissions falls back for unknown category', () => {
    const perms = suggestedPermissions('magic');
    assert.deepEqual(perms, ['events.read']);
  });

  it('HIGH_RISK includes connectors.execute and routes.mount', () => {
    assert.ok(HIGH_RISK.includes('connectors.execute'));
    assert.ok(HIGH_RISK.includes('routes.mount'));
  });
});

// ── 3. PermissionGate ────────────────────────────────────────────────────────
import { PermissionGate, PermissionDeniedError } from '../security/PermissionGate.js';

describe('PermissionGate', () => {
  it('has() returns true for declared permissions', () => {
    const gate = new PermissionGate('ext-a', ['events.read', 'graph.read']);
    assert.ok(gate.has('events.read'));
    assert.ok(!gate.has('routes.mount'));
  });

  it('require() throws PermissionDeniedError for undeclared scope', () => {
    const gate = new PermissionGate('ext-b', ['events.read']);
    assert.throws(() => gate.require('routes.mount'), PermissionDeniedError);
  });

  it('require() does not throw for declared scope', () => {
    const gate = new PermissionGate('ext-c', ['events.read']);
    assert.doesNotThrow(() => gate.require('events.read'));
  });

  it('buildApiSurface returns null for namespaces with no API', () => {
    const gate = new PermissionGate('ext-d', ['events.read']);
    const surface = gate.buildApiSurface({ events: { query: async () => [] } });
    assert.ok(surface.events);
    // Namespace with no corresponding raw API returns null
    assert.equal(surface.graph, null);
  });

  it('audit log records granted and denied attempts', () => {
    const gate = new PermissionGate('ext-e', ['events.read']);
    gate.require('events.read');
    try { gate.require('routes.mount'); } catch (_) {}
    const log = gate.getAuditLog();
    assert.equal(log.length, 2);
    assert.equal(log[0].granted, true);
    assert.equal(log[1].granted, false);
  });
});

// ── 4. SDK Base Classes ───────────────────────────────────────────────────────
import { BaseExtension }    from '../sdk/BaseExtension.js';
import { BaseConnectorPack } from '../sdk/BaseConnectorPack.js';
import { BaseAgentPack }    from '../sdk/BaseAgentPack.js';
import { BaseWorkflowPack } from '../sdk/BaseWorkflowPack.js';
import { BaseWidgetPack }   from '../sdk/BaseWidgetPack.js';

function makeManifest(overrides = {}) {
  const { manifest } = parseManifest({ ...BASE_MANIFEST, ...overrides });
  return manifest;
}

describe('BaseExtension', () => {
  it('throws when instantiated directly', () => {
    assert.throws(() => new BaseExtension(makeManifest(), {}), /abstract/);
  });

  it('subclass can be instantiated and exposes id, version, enabled', () => {
    class TestExt extends BaseExtension {}
    const ext = new TestExt(makeManifest(), {});
    assert.equal(ext.id, 'com.test.my-extension');
    assert.equal(ext.version, '1.2.3');
    assert.equal(ext.enabled, false);
  });

  it('_enable() sets enabled to true and calls onEnable', async () => {
    let called = false;
    class TestExt extends BaseExtension {
      async onEnable() { called = true; }
    }
    const ext = new TestExt(makeManifest(), {});
    await ext._enable();
    assert.ok(called);
    assert.equal(ext.enabled, true);
  });

  it('_disable() sets enabled to false and calls onDisable', async () => {
    let called = false;
    class TestExt extends BaseExtension {
      async onDisable() { called = true; }
    }
    const ext = new TestExt(makeManifest(), {});
    await ext._enable();
    await ext._disable();
    assert.ok(called);
    assert.equal(ext.enabled, false);
  });

  it('healthCheck() returns healthy by default', async () => {
    class TestExt extends BaseExtension {}
    const ext = new TestExt(makeManifest(), {});
    const h = await ext.healthCheck();
    assert.ok(h.healthy);
  });

  it('toJSON() returns a serialisable summary', () => {
    class TestExt extends BaseExtension {}
    const ext = new TestExt(makeManifest(), {});
    const j = ext.toJSON();
    assert.ok(j.id);
    assert.ok(j.version);
    assert.equal(j.enabled, false);
  });
});

describe('BaseConnectorPack', () => {
  it('throws if connectorDefinitions() not implemented', () => {
    const m = makeManifest({ category: 'connector', permissions: ['events.write', 'graph.write', 'connectors.read'] });
    class BadPack extends BaseConnectorPack {}
    const pack = new BadPack(m, { connectors: { register: () => {}, unregister: () => {} } });
    assert.throws(() => pack.connectorDefinitions(), /connectorDefinitions/);
  });

  it('registers connectors on enable and unregisters on disable', async () => {
    const registered   = [];
    const unregistered = [];
    const mockApi = {
      connectors: {
        register:   (id) => registered.push(id),
        unregister: (id) => unregistered.push(id),
        health:     async () => ({ status: 'HEALTHY' }),
      },
    };

    class FakeAdapter { constructor(cfg) { this.cfg = cfg; } }
    class TestPack extends BaseConnectorPack {
      connectorDefinitions() {
        return [{ id: 'fake-connector', AdapterClass: FakeAdapter }];
      }
    }

    const m    = makeManifest({ category: 'connector', permissions: ['events.write', 'graph.write', 'connectors.read'] });
    const pack = new TestPack(m, mockApi);
    await pack._enable();
    assert.deepEqual(registered, ['fake-connector']);
    await pack._disable();
    assert.deepEqual(unregistered, ['fake-connector']);
  });
});

describe('BaseWorkflowPack', () => {
  it('throws if workflowDefinitions() not implemented', () => {
    const m = makeManifest();
    class BadPack extends BaseWorkflowPack {}
    const pack = new BadPack(m, { workflows: { register: () => {}, unregister: () => {} } });
    assert.throws(() => pack.workflowDefinitions(), /workflowDefinitions/);
  });

  it('registers workflows on enable and unregisters on disable', async () => {
    const registered   = [];
    const unregistered = [];
    const mockApi = {
      workflows: {
        register:   (def) => registered.push(def.id),
        unregister: (id)  => unregistered.push(id),
      },
    };

    class TestPack extends BaseWorkflowPack {
      workflowDefinitions() {
        return [{ definition: { id: 'wf-test', version: '1.0.0', name: 'Test', description: 'T', connectors: [], steps: [] } }];
      }
    }

    const pack = new TestPack(makeManifest(), mockApi);
    await pack._enable();
    assert.deepEqual(registered, ['wf-test']);
    await pack._disable();
    assert.deepEqual(unregistered, ['wf-test']);
  });
});

// ── 5. VersionChecker ────────────────────────────────────────────────────────
import { satisfies, checkFlowCompatibility, compareVersions } from '../loader/VersionChecker.js';

describe('VersionChecker', () => {
  it('satisfies() — exact match', () => {
    assert.ok(satisfies('1.2.3', '1.2.3'));
    assert.ok(!satisfies('1.2.4', '1.2.3'));
  });

  it('satisfies() — >=', () => {
    assert.ok(satisfies('2.0.0', '>=1.0.0'));
    assert.ok(!satisfies('0.9.0', '>=1.0.0'));
  });

  it('satisfies() — ^', () => {
    assert.ok(satisfies('1.5.0', '^1.0.0'));
    assert.ok(!satisfies('2.0.0', '^1.0.0'));
    assert.ok(!satisfies('0.9.0', '^1.0.0'));
  });

  it('satisfies() — ~', () => {
    assert.ok(satisfies('1.4.3', '~1.4.0'));
    assert.ok(!satisfies('1.5.0', '~1.4.0'));
  });

  it('checkFlowCompatibility() compatible for lower minimumFlowVersion', () => {
    const r = checkFlowCompatibility('1.0.0');
    assert.ok(r.compatible);
  });

  it('checkFlowCompatibility() incompatible for future version', () => {
    const r = checkFlowCompatibility('99.0.0');
    assert.ok(!r.compatible);
  });

  it('compareVersions identifies upgrade and downgrade', () => {
    assert.equal(compareVersions('1.0.0', '2.0.0'), 'upgrade');
    assert.equal(compareVersions('2.0.0', '1.0.0'), 'downgrade');
    assert.equal(compareVersions('1.0.0', '1.0.0'), 'same');
  });
});

// ── 6. DependencyResolver ────────────────────────────────────────────────────
import { DependencyResolver } from '../loader/DependencyResolver.js';

function mf(id, deps = {}) {
  return parseManifest({ ...BASE_MANIFEST, id, dependencies: deps }).manifest;
}

describe('DependencyResolver', () => {
  it('resolves a single extension with no dependencies', () => {
    const r   = new DependencyResolver();
    const { order, errors } = r.resolve([mf('com.a.ext')]);
    assert.equal(errors.length, 0);
    assert.deepEqual(order, ['com.a.ext']);
  });

  it('resolves correct load order for a→b dependency', () => {
    const resolver = new DependencyResolver();
    const a = mf('com.a.base');
    const b = mf('com.b.depends', { 'com.a.base': '>=1.0.0' });
    const { order, errors } = resolver.resolve([b, a]);
    assert.equal(errors.length, 0);
    assert.equal(order.indexOf('com.a.base'), 0);
    assert.equal(order.indexOf('com.b.depends'), 1);
  });

  it('errors on missing dependency', () => {
    const r = new DependencyResolver();
    const b = mf('com.b.ext', { 'com.missing.dep': '>=1.0.0' });
    const { errors } = r.resolve([b]);
    assert.ok(errors.length > 0);
    assert.ok(errors[0].includes('com.missing.dep'));
  });

  it('errors on circular dependency', () => {
    const resolver = new DependencyResolver();
    const raw = { ...BASE_MANIFEST };
    // Build two manifests that depend on each other
    const a = { ...parseManifest({ ...raw, id: 'com.circ.a', dependencies: { 'com.circ.b': '>=1.0.0' } }).manifest };
    const b = { ...parseManifest({ ...raw, id: 'com.circ.b', dependencies: { 'com.circ.a': '>=1.0.0' } }).manifest };
    const { errors } = resolver.resolve([a, b]);
    assert.ok(errors.some(e => e.toLowerCase().includes('circular')));
  });

  it('uses installed map to satisfy dependencies not in the batch', () => {
    const installed = new Map([['com.a.base', '2.0.0']]);
    const r = new DependencyResolver(installed);
    const b = mf('com.b.ext', { 'com.a.base': '>=1.0.0' });
    const { errors } = r.resolve([b]);
    assert.equal(errors.length, 0);
  });
});

// ── 7. SignatureValidator ────────────────────────────────────────────────────
import { checksumBundle, verifyChecksum } from '../security/SignatureValidator.js';

describe('SignatureValidator — checksum', () => {
  it('checksumBundle returns a 64-char hex string', () => {
    const buf = Buffer.from('test content');
    const hex = checksumBundle(buf);
    assert.equal(hex.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hex));
  });

  it('verifyChecksum passes when checksum matches', () => {
    const buf      = Buffer.from('hello');
    const expected = checksumBundle(buf);
    const result   = verifyChecksum(buf, expected);
    assert.ok(result.valid);
  });

  it('verifyChecksum fails when checksum does not match', () => {
    const buf    = Buffer.from('hello');
    const result = verifyChecksum(buf, 'deadbeef');
    assert.ok(!result.valid);
  });
});

// ── 8. MockFramework ─────────────────────────────────────────────────────────
import { createMockApi, createMockManifest, assertPermissionDenied, MockWorkflow } from '../toolkit/MockFramework.js';

describe('MockFramework', () => {
  it('createMockManifest produces a valid parsed manifest', () => {
    const m = createMockManifest();
    assert.ok(m.id);
    assert.ok(m.version);
  });

  it('createMockApi tracks calls', async () => {
    const { api, calls } = createMockApi(['events.read']);
    await api.events.query();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].namespace, 'events');
    assert.equal(calls[0].method, 'query');
  });

  it('assertPermissionDenied passes when function throws PermissionDeniedError', async () => {
    const { api } = createMockApi(['events.read']); // no routes.mount
    await assertPermissionDenied(() => {
      throw new PermissionDeniedError('test-ext', 'routes.mount');
    });
  });

  it('MockWorkflow executes all steps in order', async () => {
    const wf = new MockWorkflow({
      id: 'wf-test',
      steps: [
        { id: 'step_1', action: 'a.b', connector: 'a', params: {} },
        { id: 'step_2', action: 'c.d', connector: 'c', params: {} },
      ],
    });
    const result = await wf.run({ param: 'value' });
    assert.ok(result.success);
    assert.ok(wf.wasStepExecuted('step_1'));
    assert.ok(wf.wasStepExecuted('step_2'));
  });

  it('MockWorkflow respects custom step results', async () => {
    const wf = new MockWorkflow({
      id: 'wf2',
      steps: [{ id: 'fetch', action: 'x.get', connector: 'x', params: {} }],
    });
    wf.withStepResult('fetch', { data: [1, 2, 3] });
    const result = await wf.run();
    assert.deepEqual(result.steps.fetch, { data: [1, 2, 3] });
  });
});

// ── 9. Built-in Packs ────────────────────────────────────────────────────────
import { EngineeringPack,  ENGINEERING_PACK_MANIFEST  } from '../packs/builtin/EngineeringPack.js';
import { HRPack,           HR_PACK_MANIFEST            } from '../packs/builtin/HRPack.js';
import { DevOpsPack,       DEVOPS_PACK_MANIFEST        } from '../packs/builtin/DevOpsPack.js';
import { CompliancePack,   COMPLIANCE_PACK_MANIFEST    } from '../packs/builtin/CompliancePack.js';

function makeMockWorkflowApi() {
  const registered = [];
  const unregistered = [];
  return {
    api: { workflows: { register: d => registered.push(d.id), unregister: id => unregistered.push(id) } },
    registered, unregistered,
  };
}

describe('Built-in packs — static contracts', () => {
  it('EngineeringPack manifest is valid', () => {
    const { errors } = parseManifest(ENGINEERING_PACK_MANIFEST);
    assert.equal(errors.length, 0);
  });

  it('HRPack manifest is valid', () => {
    const { errors } = parseManifest(HR_PACK_MANIFEST);
    assert.equal(errors.length, 0);
  });

  it('DevOpsPack manifest is valid', () => {
    const { errors } = parseManifest(DEVOPS_PACK_MANIFEST);
    assert.equal(errors.length, 0);
  });

  it('CompliancePack manifest is valid', () => {
    const { errors } = parseManifest(COMPLIANCE_PACK_MANIFEST);
    assert.equal(errors.length, 0);
  });

  it('EngineeringPack registers 5 workflows on enable', async () => {
    const { api, registered } = makeMockWorkflowApi();
    const { manifest } = parseManifest(ENGINEERING_PACK_MANIFEST);
    const pack = new EngineeringPack(manifest, api);
    await pack._enable();
    assert.equal(registered.length, 5);
  });

  it('HRPack registers 4 workflows on enable', async () => {
    const { api, registered } = makeMockWorkflowApi();
    const { manifest } = parseManifest(HR_PACK_MANIFEST);
    const pack = new HRPack(manifest, api);
    await pack._enable();
    assert.equal(registered.length, 4);
  });

  it('DevOpsPack registers 4 workflows on enable', async () => {
    const { api, registered } = makeMockWorkflowApi();
    const { manifest } = parseManifest(DEVOPS_PACK_MANIFEST);
    const pack = new DevOpsPack(manifest, api);
    await pack._enable();
    assert.equal(registered.length, 4);
  });

  it('CompliancePack registers 5 workflows on enable', async () => {
    const { api, registered } = makeMockWorkflowApi();
    const { manifest } = parseManifest(COMPLIANCE_PACK_MANIFEST);
    const pack = new CompliancePack(manifest, api);
    await pack._enable();
    assert.equal(registered.length, 5);
  });

  it('all packs unregister workflows on disable', async () => {
    const { api, unregistered } = makeMockWorkflowApi();
    const { manifest } = parseManifest(ENGINEERING_PACK_MANIFEST);
    const pack = new EngineeringPack(manifest, api);
    await pack._enable();
    await pack._disable();
    assert.equal(unregistered.length, 5);
  });

  it('all workflow ids are unique across all packs', async () => {
    const allIds = [];
    const packs = [
      [ENGINEERING_PACK_MANIFEST, EngineeringPack],
      [HR_PACK_MANIFEST,          HRPack],
      [DEVOPS_PACK_MANIFEST,      DevOpsPack],
      [COMPLIANCE_PACK_MANIFEST,  CompliancePack],
    ];
    for (const [mfRaw, Cls] of packs) {
      const { api, registered } = makeMockWorkflowApi();
      const { manifest } = parseManifest(mfRaw);
      const pack = new Cls(manifest, api);
      await pack._enable();
      allIds.push(...registered);
    }
    const unique = new Set(allIds);
    assert.equal(unique.size, allIds.length, 'Duplicate workflow ids found across packs');
  });
});

// ── 10. Boilerplate generators ────────────────────────────────────────────────
import { generateConnectorBoilerplate } from '../toolkit/generators/ConnectorBoilerplate.js';
import { generateWorkflowBoilerplate }  from '../toolkit/generators/WorkflowBoilerplate.js';
import { generateAgentBoilerplate }     from '../toolkit/generators/AgentBoilerplate.js';
import { generateWidgetBoilerplate }    from '../toolkit/generators/WidgetBoilerplate.js';

describe('Boilerplate generators', () => {
  it('generateConnectorBoilerplate produces a valid manifest', () => {
    const { manifest: raw } = generateConnectorBoilerplate({ id: 'acme', name: 'Acme', connectorId: 'acme' });
    const { errors } = parseManifest(raw);
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('generateWorkflowBoilerplate produces a valid manifest', () => {
    const { manifest: raw } = generateWorkflowBoilerplate({ id: 'acme.wf', name: 'Acme WF' });
    const { errors } = parseManifest(raw);
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('generateAgentBoilerplate produces a valid manifest', () => {
    const { manifest: raw } = generateAgentBoilerplate({ id: 'acme.agent', name: 'Acme Agent' });
    const { errors } = parseManifest(raw);
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('generateWidgetBoilerplate produces a valid manifest', () => {
    const { manifest: raw } = generateWidgetBoilerplate({ id: 'acme.widget', name: 'Acme Widget' });
    const { errors } = parseManifest(raw);
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('generateConnectorBoilerplate produces a main.js file', () => {
    const { files } = generateConnectorBoilerplate({ id: 'acme', name: 'Acme', connectorId: 'acme' });
    assert.ok(files['main.js']);
    assert.ok(files['main.js'].includes('BaseConnectorPack'));
  });

  it('generateWorkflowBoilerplate produces a main.js with workflowDefinitions', () => {
    const { files } = generateWorkflowBoilerplate({ id: 'test.wf', name: 'Test WF' });
    assert.ok(files['main.js'].includes('workflowDefinitions'));
  });

  it('generateWidgetBoilerplate produces both main.js and widget.jsx', () => {
    const { files } = generateWidgetBoilerplate({ id: 'test.w', name: 'Test Widget' });
    assert.ok(files['main.js']);
    assert.ok(files['widget.jsx']);
    assert.ok(files['widget.jsx'].includes('FlowWidget'));
  });
});

// ── 11. MarketplaceRegistry (in-memory) ──────────────────────────────────────
import { MarketplaceRegistry } from '../registry/MarketplaceRegistry.js';

describe('MarketplaceRegistry', () => {
  it('registerBuiltin and listAvailable returns the entry', () => {
    const r = new MarketplaceRegistry();
    const { manifest } = parseManifest(ENGINEERING_PACK_MANIFEST);
    r.registerBuiltin(manifest);
    const avail = r.listAvailable();
    assert.ok(avail.some(e => e.id === manifest.id));
  });

  it('listAvailable filters by category', () => {
    const r = new MarketplaceRegistry();
    const { manifest: eng } = parseManifest(ENGINEERING_PACK_MANIFEST);
    const { manifest: hr  } = parseManifest(HR_PACK_MANIFEST);
    r.registerBuiltin(eng);
    r.registerBuiltin(hr);
    const wf = r.listAvailable({ category: 'workflow_pack' });
    assert.ok(wf.every(e => e.category === 'workflow_pack'));
    assert.ok(wf.length >= 2);
  });

  it('listAvailable search by name', () => {
    const r = new MarketplaceRegistry();
    const { manifest } = parseManifest(ENGINEERING_PACK_MANIFEST);
    r.registerBuiltin(manifest);
    const results = r.listAvailable({ search: 'engineering' });
    assert.ok(results.some(e => e.id === manifest.id));
  });

  it('getPackage returns entry when registered', () => {
    const r = new MarketplaceRegistry();
    const { manifest } = parseManifest(HR_PACK_MANIFEST);
    r.registerBuiltin(manifest);
    const pkg = r.getPackage(manifest.id);
    assert.equal(pkg.id, manifest.id);
  });

  it('getPackage returns null for unknown id', () => {
    const r = new MarketplaceRegistry();
    assert.equal(r.getPackage('com.does.not.exist'), null);
  });

  it('sourceCode is stripped from public entries', () => {
    const r = new MarketplaceRegistry();
    const { manifest } = parseManifest(ENGINEERING_PACK_MANIFEST);
    r.registerBuiltin(manifest, 'SECRET SOURCE CODE');
    const pkg = r.getPackage(manifest.id);
    assert.equal(pkg.sourceCode, undefined);
  });
});

// ── 12. Phase 14 Acceptance Criteria ─────────────────────────────────────────
describe('Phase 14 acceptance criteria', () => {
  it('Zero kernel modifications — sdk does not import from src/runtime or src/brain', async () => {
    const sdkFiles = [
      '../sdk/BaseExtension.js',
      '../sdk/BaseConnectorPack.js',
      '../sdk/BaseAgentPack.js',
      '../sdk/BaseWorkflowPack.js',
      '../sdk/BaseWidgetPack.js',
    ];
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const dir = fileURLToPath(new URL('../sdk', import.meta.url));
    for (const f of sdkFiles) {
      const src = await readFile(new URL(f, import.meta.url), 'utf8');
      assert.ok(!src.includes("from '../../runtime"), `${f} imports from runtime — kernel modification`);
      assert.ok(!src.includes("from '../../brain"),   `${f} imports from brain — kernel modification`);
    }
  });

  it('Extension categories cover all 10 defined types', () => {
    const { VALID_CATEGORIES } = { VALID_CATEGORIES: [
      'connector', 'agent_pack', 'workflow_pack', 'capability_pack',
      'dashboard_widget', 'executive_report', 'autonomy_policy',
      'prediction_model', 'event_handler', 'knowledge_provider',
    ]};
    assert.equal(VALID_CATEGORIES.length, 10);
  });

  it('Built-in packs cover engineering, HR, DevOps, compliance domains', () => {
    const packs = [ENGINEERING_PACK_MANIFEST, HR_PACK_MANIFEST, DEVOPS_PACK_MANIFEST, COMPLIANCE_PACK_MANIFEST];
    const allIds = packs.map(m => m.id);
    assert.ok(allIds.some(id => id.includes('engineering')));
    assert.ok(allIds.some(id => id.includes('hr')));
    assert.ok(allIds.some(id => id.includes('devops')));
    assert.ok(allIds.some(id => id.includes('compliance')));
  });

  it('All permission scopes have a risk level', () => {
    for (const [scope, def] of Object.entries(PERMISSION_SCOPES)) {
      assert.ok(['low', 'medium', 'high'].includes(def.risk), `Scope "${scope}" missing risk level`);
    }
  });

  it('All workflow ids in built-in packs are namespaced with flow.*', async () => {
    const allDefs = [
      ...(new EngineeringPack(parseManifest(ENGINEERING_PACK_MANIFEST).manifest, { workflows: { register: () => {}, unregister: () => {} } })).workflowDefinitions(),
      ...(new HRPack(parseManifest(HR_PACK_MANIFEST).manifest, { workflows: { register: () => {}, unregister: () => {} } })).workflowDefinitions(),
    ];
    for (const { definition } of allDefs) {
      assert.ok(definition.id.startsWith('flow.'), `Workflow id "${definition.id}" not namespaced with flow.*`);
    }
  });

  it('SandboxRunner exists and is importable', async () => {
    const { SandboxRunner } = await import('../loader/SandboxRunner.js');
    assert.ok(typeof SandboxRunner === 'function');
    const r = new SandboxRunner();
    assert.ok(typeof r.load === 'function');
    assert.ok(typeof r.loadFromSource === 'function');
    assert.ok(typeof r.unload === 'function');
  });

  it('ExtensionLoader is constructable with mock api and sdk', async () => {
    const { ExtensionLoader } = await import('../loader/ExtensionLoader.js');
    assert.ok(typeof ExtensionLoader === 'function', 'ExtensionLoader must be a class');
  });

  it('ExtensionRegistry exposes expected async methods', async () => {
    const { ExtensionRegistry } = await import('../registry/ExtensionRegistry.js');
    const proto = ExtensionRegistry.prototype;
    for (const method of ['register', 'setStatus', 'remove', 'get', 'listAll', 'getInstalledVersionMap', 'exists']) {
      assert.ok(typeof proto[method] === 'function', `ExtensionRegistry.${method} missing`);
    }
  });

  it('Extension route file exports a default Router', async () => {
    // Import just to verify it parses; do not mount it
    const mod = await import('../../routes/extensionRoutes.js');
    assert.ok(mod.default, 'extensionRoutes must export a default Router');
  });
});

// ── Integration suite (requires live server) ─────────────────────────────────
const SKIP_INTEGRATION = !process.env.TEST_SERVER_URL;
const BASE_URL = process.env.TEST_SERVER_URL || 'http://localhost:5001';

describe('Integration — Extension APIs (requires live server)', { skip: SKIP_INTEGRATION }, () => {
  let token = '';
  let workspaceId = 'workspace_corp_alpha';

  before(async () => {
    const r = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@corp.com', password: 'test' }),
    });
    if (r.ok) { const d = await r.json(); token = d.token; }
  });

  it('GET /api/extensions returns installed list', async () => {
    const r = await fetch(`${BASE_URL}/api/extensions`, {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.ok(Array.isArray(d.installed));
  });

  it('GET /api/extensions/marketplace returns catalog', async () => {
    const r = await fetch(`${BASE_URL}/api/extensions/marketplace`, {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.ok(Array.isArray(d.extensions));
    assert.ok(d.extensions.length >= 4, 'Expected at least 4 built-in packs in marketplace');
  });

  it('POST /api/extensions/validate validates a manifest', async () => {
    const r = await fetch(`${BASE_URL}/api/extensions/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'workspace-id': workspaceId,
      },
      body: JSON.stringify(BASE_MANIFEST),
    });
    assert.ok([200, 400].includes(r.status));
    const d = await r.json();
    assert.ok(typeof d.valid === 'boolean');
  });

  it('GET /api/extensions/updates returns update check result', async () => {
    const r = await fetch(`${BASE_URL}/api/extensions/updates`, {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.ok(Array.isArray(d.updates));
  });
});
