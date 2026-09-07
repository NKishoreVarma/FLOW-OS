import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FlowNativeRuntime } from '../../src/ai/agent/FlowNativeRuntime.js';
import { AgentStatus, StopReason, AgentEventType } from '../../src/ai/agent/types.js';

// ── A deterministic, DB-free fake ToolGateway ────────────────────────────────
// Mirrors the real gateway contract: authorize() + run() returning provenanced
// observations. Lets us drive the loop offline.
function fakeGateway({ allow = ['search_workspace', 'get_entity'], searchData, entityData, fail = false, slowMs = 0, workspaceId = 'workspace_helios' } = {}) {
  const allowSet = new Set(allow);
  let entityCounter = 0;
  return {
    authorize(name) {
      if (!allowSet.has(name)) return { ok: false, reason: 'not_in_allow_list' };
      return { ok: true, tool: { connector: 'internal' } };
    },
    async run(name, input) {
      if (slowMs) await new Promise(r => setTimeout(r, slowMs));
      if (fail) return { ok: false, toolName: name, error: 'simulated tool failure' };
      const provenance = { sourceType: `tool:${name}`, connector: 'internal', workspaceId, toolName: name };
      if (name === 'get_entity') {
        entityCounter++;
        const d = entityData ?? [`Entity ${input.entityId} is linked to PROJECT-NEW${entityCounter} owned by emp-00${entityCounter}.`];
        return { ok: true, toolName: name, data: d, provenance: { ...provenance, entityId: input.entityId } };
      }
      const d = searchData ?? [
        { content: 'Project Alpha is delayed because milestone M3 slipped. See PROJECT-ALPHA and emp-001.', source: 'vector_db', score: 0.9, ts: new Date().toISOString() },
        { content: 'Incident incident-42 blocked the release of Project Alpha last week.', source: 'vector_db', score: 0.8 },
        { content: 'PR pr-repo-helios-core-12 for Project Alpha is awaiting review.', source: 'vector_db', score: 0.7 },
        { content: 'Decision: Project Alpha timeline extended by two weeks.', source: 'vault_frontmatter', score: 0.75 },
      ];
      return { ok: true, toolName: name, data: d, provenance };
    },
  };
}

const CTX = { workspaceId: 'workspace_helios', userId: 'u1', role: 'MEMBER', orgPlan: 'enterprise' };
const OPTS = { emitToBus: false, roster: { names: new Set(), list: [] } };

describe('FlowNativeRuntime — iterative loop mechanics', () => {
  it('single tool call: gathers evidence and produces an answer', async () => {
    const rt = new FlowNativeRuntime();
    const gateway = fakeGateway({ allow: ['search_workspace'] });   // no get_entity → one hop
    const res = await rt.start({ question: 'Why is Project Alpha delayed?', allowedToolNames: ['search_workspace'] }, CTX, { ...OPTS, gateway }).done;

    assert.equal(res.status, AgentStatus.DONE);
    assert.equal(res.stopReason, StopReason.SUFFICIENT);
    assert.equal(res.toolCalls, 1, 'exactly one tool call');
    assert.ok(res.evidenceCount >= 1, 'gathered evidence');
    assert.ok(res.answer && res.answer.length > 10, 'produced a non-empty answer');
    assert.ok(!res.insufficientEvidence);
  });

  it('multi-hop: search then get_entity (recognises more evidence is needed)', async () => {
    const rt = new FlowNativeRuntime();
    // Thin first search (1 chunk mentioning an entity) forces the entity hop.
    const gateway = fakeGateway({
      searchData: [{ content: 'Project Alpha delay traced to emp-001 workload. See PROJECT-ALPHA.', source: 'vector_db', score: 0.9 }],
    });
    const res = await rt.start({ question: 'Why is Project Alpha delayed?', allowedToolNames: ['search_workspace', 'get_entity'] }, CTX, { ...OPTS, gateway }).done;

    const tools = res.toolTrace.map(t => t.toolName);
    assert.ok(tools.includes('search_workspace'), 'searched');
    assert.ok(tools.includes('get_entity'), 'performed an entity hop');
    assert.ok(res.toolCalls >= 2, 'multiple sequential tool calls');
    assert.equal(res.status, AgentStatus.DONE);
  });

  it('every evidence item carries FLOW-stamped workspace provenance', async () => {
    const rt = new FlowNativeRuntime();
    const res = await rt.start({ question: 'Why is Project Alpha delayed?', allowedToolNames: ['search_workspace', 'get_entity'] }, CTX, { ...OPTS, gateway: fakeGateway() }).done;
    for (const e of res.evidence) {
      assert.equal(e.provenance.workspaceId, 'workspace_helios', 'provenance is stamped with the run workspace');
      assert.ok(e.provenance.sourceType, 'provenance has a source type');
    }
  });

  it('tool failure is fail-safe: honest insufficient-evidence answer, no fabrication', async () => {
    const rt = new FlowNativeRuntime();
    const res = await rt.start({ question: 'Why is Project Alpha delayed?', allowedToolNames: ['search_workspace', 'get_entity'] }, CTX, { ...OPTS, gateway: fakeGateway({ fail: true }) }).done;

    assert.equal(res.evidenceCount, 0);
    assert.ok(res.insufficientEvidence, 'declares insufficient evidence');
    assert.match(res.answer, /don't have enough evidence/i);
    assert.ok(res.toolTrace.some(t => t.ok === false), 'failure is recorded, not hidden');
    assert.equal(res.status, AgentStatus.DONE);
  });

  it('enforces maxIterations', async () => {
    const rt = new FlowNativeRuntime();
    // Each get_entity returns a NEW entity id, so the planner would loop forever.
    const gateway = fakeGateway();
    const res = await rt.start(
      { question: 'Trace Project Alpha delay through PROJECT-ALPHA', allowedToolNames: ['search_workspace', 'get_entity'] },
      CTX,
      { ...OPTS, gateway, limits: { maxIterations: 2 } },
    ).done;
    assert.equal(res.stopReason, StopReason.MAX_ITERATIONS);
    assert.ok(res.iterations <= 2);
  });

  it('enforces maxToolCalls', async () => {
    const rt = new FlowNativeRuntime();
    const res = await rt.start(
      { question: 'Trace Project Alpha delay through PROJECT-ALPHA', allowedToolNames: ['search_workspace', 'get_entity'] },
      CTX,
      { ...OPTS, gateway: fakeGateway(), limits: { maxToolCalls: 1 } },
    ).done;
    assert.equal(res.stopReason, StopReason.MAX_TOOL_CALLS);
    assert.equal(res.toolCalls, 1);
  });

  it('enforces execution timeout', async () => {
    const rt = new FlowNativeRuntime();
    const res = await rt.start(
      { question: 'Why is Project Alpha delayed?', allowedToolNames: ['search_workspace', 'get_entity'] },
      CTX,
      { ...OPTS, gateway: fakeGateway({ slowMs: 5 }), limits: { executionTimeoutMs: 1 } },
    ).done;
    assert.equal(res.stopReason, StopReason.TIMEOUT);
    assert.equal(res.status, AgentStatus.TIMED_OUT);
  });

  it('supports cooperative cancellation', async () => {
    const rt = new FlowNativeRuntime();
    let handle;
    const options = {
      ...OPTS,
      gateway: fakeGateway(),
      onEvent: (e) => { if (e.type === AgentEventType.TOOL_COMPLETED && handle) handle.cancel('user_stop'); },
    };
    handle = rt.start({ question: 'Why is Project Alpha delayed?', allowedToolNames: ['search_workspace', 'get_entity'] }, CTX, options);
    const res = await handle.done;
    assert.equal(res.status, AgentStatus.CANCELLED);
    assert.equal(res.stopReason, StopReason.CANCELLED);
  });

  it('emits a redacted event trace with no raw content', async () => {
    const rt = new FlowNativeRuntime();
    const res = await rt.start({ question: 'Why is Project Alpha delayed?', allowedToolNames: ['search_workspace'] }, CTX, { ...OPTS, gateway: fakeGateway({ allow: ['search_workspace'] }) }).done;
    const types = res.events.map(e => e.type);
    assert.ok(types.includes(AgentEventType.EXECUTION_STARTED));
    assert.ok(types.includes(AgentEventType.TOOL_COMPLETED));
    assert.ok(types.includes(AgentEventType.EXECUTION_COMPLETED));
    // No event should carry raw payload/content/tokens.
    for (const e of res.events) {
      for (const k of ['payload', 'content', 'input', 'token', 'data', 'result']) {
        assert.ok(!(k in e), `event ${e.type} must not carry "${k}"`);
      }
    }
  });
});
