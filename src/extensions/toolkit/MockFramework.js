/**
 * MockFramework — test utilities for extension authors.
 *
 * Provides:
 *   - createMockApi(permissions)   — scoped API mock with call tracking
 *   - createMockManifest(overrides) — valid manifest object for tests
 *   - assertPermissionDenied(fn)   — helper that asserts PermissionDeniedError
 *   - MockWorkflow                 — in-memory workflow runner for testing
 */

import { parseManifest }      from '../manifest/ManifestParser.js';
import { PermissionGate }     from '../security/PermissionGate.js';
import { PermissionDeniedError } from '../security/PermissionGate.js';

// ── Mock API builder ─────────────────────────────────────────────────────────

export function createMockApi(permissions = []) {
  const calls = [];

  function recorder(namespace) {
    return new Proxy({}, {
      get(_, method) {
        return async (...args) => {
          calls.push({ namespace, method, args, ts: Date.now() });
          return { ok: true, namespace, method, args };
        };
      },
    });
  }

  const rawApi = {
    events:      recorder('events'),
    graph:       recorder('graph'),
    memory:      recorder('memory'),
    executions:  recorder('executions'),
    connectors: {
      ...recorder('connectors'),
      register:   (id, adapter) => { calls.push({ namespace: 'connectors', method: 'register', args: [id, adapter], ts: Date.now() }); },
      unregister: (id)          => { calls.push({ namespace: 'connectors', method: 'unregister', args: [id],         ts: Date.now() }); },
      health:     async (id)    => ({ status: 'HEALTHY', connectorId: id }),
    },
    agents: {
      register:   (def) => { calls.push({ namespace: 'agents', method: 'register', args: [def], ts: Date.now() }); },
      unregister: (id)  => { calls.push({ namespace: 'agents', method: 'unregister', args: [id], ts: Date.now() }); },
    },
    workflows: {
      register:   (def, fn) => { calls.push({ namespace: 'workflows', method: 'register', args: [def, fn], ts: Date.now() }); },
      unregister: (id)      => { calls.push({ namespace: 'workflows', method: 'unregister', args: [id],    ts: Date.now() }); },
    },
    actions:     recorder('actions'),
    routes:      { mount: (path, router) => calls.push({ namespace: 'routes', method: 'mount', args: [path, router], ts: Date.now() }) },
    widgets: {
      register:   (def) => { calls.push({ namespace: 'widgets', method: 'register', args: [def], ts: Date.now() }); },
      unregister: (id)  => { calls.push({ namespace: 'widgets', method: 'unregister', args: [id], ts: Date.now() }); },
    },
    executive:   recorder('executive'),
    predictions: recorder('predictions'),
    kpis:        recorder('kpis'),
  };

  const gate       = new PermissionGate('test-extension', permissions);
  const scopedApi  = gate.buildApiSurface(rawApi);

  return {
    api:    scopedApi,
    rawApi,
    calls,
    getCalls:   (namespace, method) => calls.filter(c => c.namespace === namespace && (!method || c.method === method)),
    clearCalls: () => calls.splice(0),
  };
}

// ── Mock manifest ────────────────────────────────────────────────────────────

export function createMockManifest(overrides = {}) {
  const base = {
    id:                 'com.test.mock-extension',
    name:               'Mock Extension',
    version:            '1.0.0',
    author:             'Test Author',
    description:        'A mock extension for testing',
    category:           'workflow_pack',
    license:            'MIT',
    permissions:        ['events.read', 'workflows.register'],
    minimumFlowVersion: '14.0.0',
    dependencies:       {},
    entrypoints:        {},
    ...overrides,
  };
  const { manifest, errors } = parseManifest(base);
  if (errors.length) throw new Error(`Invalid mock manifest: ${errors.join(', ')}`);
  return manifest;
}

// ── Assertion helpers ────────────────────────────────────────────────────────

export async function assertPermissionDenied(fn) {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    if (err instanceof PermissionDeniedError || err.name === 'PermissionDeniedError') {
      threw = true;
    } else {
      throw err;
    }
  }
  if (!threw) throw new Error('Expected PermissionDeniedError but no error was thrown');
}

// ── In-memory workflow runner ────────────────────────────────────────────────

export class MockWorkflow {
  constructor(definition) {
    this.definition   = definition;
    this.executedSteps = [];
    this.stepResults  = {};
  }

  withStepResult(stepId, result) {
    this.stepResults[stepId] = result;
    return this;
  }

  async run(params = {}) {
    const results = {};
    for (const step of this.definition.steps) {
      const result = this.stepResults[step.id] ?? { ok: true, stepId: step.id };
      results[step.id] = result;
      this.executedSteps.push({ stepId: step.id, result, ts: Date.now() });
    }
    return { success: true, steps: results, params };
  }

  getExecutedSteps() { return [...this.executedSteps]; }
  wasStepExecuted(stepId) { return this.executedSteps.some(s => s.stepId === stepId); }
}
