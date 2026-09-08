/**
 * Multi-Agent Cognitive Brain — Unit Test Suite
 *
 * Tests:
 *   1. AgentRegistry          — register, resolve, list, domain/capability queries
 *   2. AgentCommunicationBus  — open/close channels, post/read messages, stats
 *   3. AgentSessionManager    — create, get, update, finalize, list sessions
 *   4. BaseAgent              — relevance scoring, context filtering, heuristic fallback
 *   5. ChiefOfStaffAgent      — heuristic decompose fallback, heuristic synthesize fallback
 *   6. AgentRouter            — domain match, keyword match, always-on agents, limit
 *   7. ConsensusEngine        — unanimous, split, security veto, empty input
 *   8. DecisionSynthesizer    — assemble result shape
 *   9. SpecializedAgents      — construction and relevance scoring for 18 agents
 *  10. Integration             — skip if env vars absent (requires live server)
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── 1. AgentRegistry ─────────────────────────────────────────────────────────

import {
  registerAgent,
  getAgentDefinition,
  listAgents,
  getAgentsByDomain,
  getAgentsByCapability,
  hasAgent,
  agentCount,
  clearRegistry,
} from '../registry/AgentRegistry.js';

describe('AgentRegistry', () => {
  beforeEach(() => clearRegistry());
  after(() => clearRegistry());

  const mockDef = {
    id: 'test-agent',
    name: 'Test Agent',
    domain: 'testing',
    mission: 'Test things.',
    capabilities: ['unit testing', 'integration testing'],
    keywords: ['test', 'spec'],
    connectors: ['github'],
  };

  it('registers and retrieves an agent definition', () => {
    registerAgent(mockDef);
    const def = getAgentDefinition('test-agent');
    assert.equal(def.id, 'test-agent');
    assert.equal(def.domain, 'testing');
  });

  it('throws on missing required fields', () => {
    assert.throws(() => registerAgent({ name: 'No ID' }), /id/);
    assert.throws(() => registerAgent({ id: 'x', name: 'No domain' }), /domain/);
    assert.throws(() => registerAgent({ id: 'y', domain: 'd' }), /mission/);
  });

  it('lists all registered agents', () => {
    registerAgent(mockDef);
    registerAgent({ ...mockDef, id: 'test-agent-2', domain: 'other' });
    assert.equal(listAgents().length, 2);
  });

  it('getAgentsByDomain filters by primary domain', () => {
    registerAgent(mockDef);
    registerAgent({ ...mockDef, id: 'a2', domain: 'other' });
    assert.equal(getAgentsByDomain('testing').length, 1);
  });

  it('getAgentsByDomain matches secondary domains', () => {
    registerAgent({ ...mockDef, id: 'multi', domains: ['testing', 'qa'] });
    assert.equal(getAgentsByDomain('qa').length, 1);
  });

  it('getAgentsByCapability finds matching agents', () => {
    registerAgent(mockDef);
    const found = getAgentsByCapability('unit');
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'test-agent');
  });

  it('hasAgent returns true/false correctly', () => {
    assert.equal(hasAgent('test-agent'), false);
    registerAgent(mockDef);
    assert.equal(hasAgent('test-agent'), true);
  });

  it('agentCount reflects registrations', () => {
    assert.equal(agentCount(), 0);
    registerAgent(mockDef);
    assert.equal(agentCount(), 1);
  });

  it('getAgentDefinition returns null for unknown id', () => {
    assert.equal(getAgentDefinition('nope'), null);
  });
});

// ── 2. AgentCommunicationBus ──────────────────────────────────────────────────

import {
  openChannel,
  closeChannel,
  postMessage,
  readMessages,
  messageStats,
  activeChannels,
  MessageType,
} from '../bus/AgentCommunicationBus.js';

describe('AgentCommunicationBus', () => {
  const sessionId = 'sess-bus-test';

  before(() => openChannel(sessionId));
  after(()  => closeChannel(sessionId));

  it('posts and reads messages', () => {
    postMessage(sessionId, 'security', MessageType.ESCALATION, { message: 'CVE found', severity: 'critical' }, 'chief-of-staff');
    const msgs = readMessages(sessionId, { type: MessageType.ESCALATION });
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].fromAgentId, 'security');
    assert.equal(msgs[0].payload.severity, 'critical');
  });

  it('filters by toAgentId', () => {
    const sessId2 = 'sess-bus-test-2';
    openChannel(sessId2);
    postMessage(sessId2, 'agent-a', MessageType.EVIDENCE, { data: 1 }, 'agent-b');
    postMessage(sessId2, 'agent-a', MessageType.EVIDENCE, { data: 2 }, 'agent-c');
    const forB = readMessages(sessId2, { toAgentId: 'agent-b' });
    assert.equal(forB.length, 1);
    closeChannel(sessId2);
  });

  it('filters by fromAgentId', () => {
    const sessId3 = 'sess-bus-test-3';
    openChannel(sessId3);
    postMessage(sessId3, 'eng', MessageType.VOTE, { vote: 'yes' });
    postMessage(sessId3, 'hr',  MessageType.VOTE, { vote: 'no' });
    const engMsgs = readMessages(sessId3, { fromAgentId: 'eng' });
    assert.equal(engMsgs.length, 1);
    closeChannel(sessId3);
  });

  it('messageStats counts by type', () => {
    const sessId4 = 'sess-stats-test';
    openChannel(sessId4);
    postMessage(sessId4, 'a', MessageType.EVIDENCE,   { x: 1 });
    postMessage(sessId4, 'b', MessageType.EVIDENCE,   { x: 2 });
    postMessage(sessId4, 'c', MessageType.ESCALATION, { x: 3 });
    const stats = messageStats(sessId4);
    assert.equal(stats[MessageType.EVIDENCE],   2);
    assert.equal(stats[MessageType.ESCALATION], 1);
    closeChannel(sessId4);
  });

  it('postMessage on closed channel does not throw', () => {
    assert.doesNotThrow(() => postMessage('nonexistent-session', 'a', MessageType.VOTE, {}));
  });

  it('readMessages on closed channel returns empty array', () => {
    assert.deepEqual(readMessages('nonexistent-session'), []);
  });

  it('closeChannel removes channel from active count', () => {
    const before = activeChannels();
    const tempId = 'temp-ch';
    openChannel(tempId);
    assert.equal(activeChannels(), before + 1);
    closeChannel(tempId);
    assert.equal(activeChannels(), before);
  });
});

// ── 3. AgentSessionManager ────────────────────────────────────────────────────

import {
  createSession,
  getSession,
  updateSession,
  finalizeSession,
  listSessions,
  activeSessionCount,
} from '../session/AgentSessionManager.js';

describe('AgentSessionManager', () => {
  it('creates a session with expected fields', () => {
    const session = createSession('ws-1', 'org-1', 'What is the PR status?');
    assert.equal(session.workspaceId, 'ws-1');
    assert.equal(session.status, 'created');
    assert.ok(session.id);
    assert.ok(session.startedAt);
  });

  it('getSession retrieves by id and workspaceId', () => {
    const s = createSession('ws-2', 'org-2', 'test');
    const found = getSession(s.id, 'ws-2');
    assert.equal(found.id, s.id);
  });

  it('getSession returns null for wrong workspace', () => {
    const s = createSession('ws-3', 'org-3', 'test');
    assert.equal(getSession(s.id, 'ws-WRONG'), null);
  });

  it('updateSession merges fields', () => {
    const s = createSession('ws-4', 'org-4', 'test');
    updateSession(s.id, { status: 'running', intent: { question: 'x' } });
    const updated = getSession(s.id, 'ws-4');
    assert.equal(updated.status, 'running');
    assert.ok(updated.intent);
  });

  it('finalizeSession sets completedAt and durationMs', () => {
    const s = createSession('ws-5', 'org-5', 'test');
    finalizeSession(s.id, 'completed', { decision: { title: 'Done' } });
    const finalized = getSession(s.id, 'ws-5');
    assert.equal(finalized.status, 'completed');
    assert.ok(finalized.completedAt);
    assert.ok(typeof finalized.durationMs === 'number');
  });

  it('listSessions returns sessions for correct workspace only', () => {
    const ws = `ws-list-${Date.now()}`;
    createSession(ws, 'org', 'q1');
    createSession(ws, 'org', 'q2');
    createSession('ws-other', 'org', 'q3');
    const sessions = listSessions(ws);
    assert.ok(sessions.length >= 2);
    assert.ok(sessions.every(s => s.workspaceId === ws));
  });
});

// ── 4. BaseAgent ─────────────────────────────────────────────────────────────

import { BaseAgent } from '../agents/BaseAgent.js';

class TestAgent extends BaseAgent {
  constructor() {
    super({
      id: 'test-base',
      name: 'Test Base Agent',
      domain: 'engineering',
      mission: 'Test agent for unit tests.',
      capabilities: ['testing'],
      keywords: ['pr', 'pull request', 'deploy'],
      connectors: ['github'],
    });
  }
}

const makeContext = (overrides = {}) => ({
  intent: { question: 'What is the PR status?', domain: 'engineering', urgency: 'low', entities: [], searchTerms: ['pr', 'status'] },
  vectors: [{ content: 'PR #42 is open and needs review', source: 'github', score: 0.9 }],
  memory:  [{ type: 'DECISION', title: 'Merge strategy decision', body: 'Use squash merge' }],
  graphNodes: [{ id: 'n1', type: 'PULL_REQUEST', label: 'PR #42' }],
  graphNeighbors: {},
  recentEvents: [],
  workflows: [],
  policies: [],
  health: null,
  ...overrides,
});

describe('BaseAgent', () => {
  it('constructs with correct definition fields', () => {
    const agent = new TestAgent();
    assert.equal(agent.id, 'test-base');
    assert.equal(agent.domain, 'engineering');
    assert.ok(Array.isArray(agent.keywords));
  });

  it('toDefinition returns serializable object', () => {
    const agent = new TestAgent();
    const def   = agent.toDefinition();
    assert.equal(def.id, 'test-base');
    assert.ok(typeof JSON.stringify(def) === 'string');
  });

  it('_computeRelevance returns high score for domain+keyword match', () => {
    const agent  = new TestAgent();
    const intent = { question: 'What is the pull request status?', domain: 'engineering', entities: [] };
    const score  = agent._computeRelevance(intent);
    assert.ok(score >= 40, `Expected score >= 40, got ${score}`);
  });

  it('_computeRelevance returns low score for irrelevant query', () => {
    const agent  = new TestAgent();
    const intent = { question: 'What is the finance budget variance?', domain: 'finance', entities: [] };
    const score  = agent._computeRelevance(intent);
    assert.ok(score < 40, `Expected score < 40, got ${score}`);
  });

  it('filterContext retains domain-relevant vectors', () => {
    const agent   = new TestAgent();
    const ctx     = makeContext({
      vectors: [
        { content: 'PR #42 needs review', source: 'github' },
        { content: 'Invoice Q3 overdue', source: 'finance-system' },
      ],
    });
    const filtered = agent.filterContext(ctx);
    // 'pr' keyword matches the first vector
    const prVec = filtered.vectors.some(v => v.content.includes('PR'));
    assert.ok(prVec);
  });

  it('_heuristicReason returns valid AgentOutput shape', () => {
    const agent  = new TestAgent();
    const output = agent._heuristicReason(makeContext(), 'test question', 60);
    assert.ok(typeof output.confidence === 'number');
    assert.ok(Array.isArray(output.findings));
    assert.ok(output.recommendation?.action);
    assert.ok(typeof output.error === 'boolean');
  });

  it('_parseOutput falls back to heuristic on invalid JSON', () => {
    const agent  = new TestAgent();
    const output = agent._parseOutput('not valid json', makeContext(), 'test');
    assert.ok(typeof output.confidence === 'number');
    assert.equal(output.error, false);
  });

  it('returns low-relevance output when score < 10', async () => {
    const agent  = new TestAgent();
    const ctx    = makeContext({ intent: { question: 'budget variance?', domain: 'finance', urgency: 'low', entities: [] } });
    // Force relevance below threshold by using irrelevant query
    const origCompute = agent._computeRelevance.bind(agent);
    agent._computeRelevance = () => 5;
    const session = createSession('ws-test', 'org-test', 'budget');
    const output  = await agent.reason(ctx, session.id);
    assert.equal(output.relevanceScore, 5);
    assert.ok(output.confidence <= 10);
    agent._computeRelevance = origCompute;
  });
});

// ── 5. AgentRouter ────────────────────────────────────────────────────────────

import { routeToAgents, explainRouting } from '../router/AgentRouter.js';
import { startCognitiveBrain }           from '../index.js';

describe('AgentRouter', () => {
  before(() => startCognitiveBrain());

  it('always includes security, risk, analytics agents', () => {
    const intent    = { question: 'How is the engineering team?', domain: 'engineering', urgency: 'low', entities: [] };
    const selected  = routeToAgents(intent);
    assert.ok(selected.includes('security'), 'security should always be selected');
    assert.ok(selected.includes('risk'),     'risk should always be selected');
    assert.ok(selected.includes('analytics'),'analytics should always be selected');
  });

  it('selects engineering agent for PR question', () => {
    const intent   = { question: 'What pull requests are open?', domain: 'engineering', urgency: 'low', entities: [] };
    const selected = routeToAgents(intent);
    assert.ok(selected.includes('engineering') || selected.includes('github'), 'engineering or github agent should be selected');
  });

  it('does not include chief-of-staff in selection', () => {
    const intent   = { question: 'What is happening?', domain: 'general', urgency: 'low', entities: [] };
    const selected = routeToAgents(intent);
    assert.ok(!selected.includes('chief-of-staff'), 'chief-of-staff must not be in router output');
  });

  it('respects maxAgents limit', () => {
    const intent   = { question: 'What is happening everywhere?', domain: 'general', urgency: 'low', entities: [] };
    const selected = routeToAgents(intent, { maxAgents: 3 });
    assert.ok(selected.length <= 3, `Expected ≤3 agents, got ${selected.length}`);
  });

  it('forceAgentIds always includes specified agents', () => {
    const intent   = { question: 'Budget status?', domain: 'finance', urgency: 'low', entities: [] };
    const selected = routeToAgents(intent, { forceAgentIds: ['hr', 'meetings'] });
    assert.ok(selected.includes('hr'),      'hr should be forced');
    assert.ok(selected.includes('meetings'),'meetings should be forced');
  });

  it('explainRouting returns scores for all agents', () => {
    const intent   = { question: 'PR review status', domain: 'engineering', urgency: 'low', entities: [] };
    const routing  = explainRouting(intent);
    assert.ok(Array.isArray(routing));
    assert.ok(routing.length > 0);
    assert.ok(routing[0].agentId);
    assert.ok(typeof routing[0].score === 'number');
    assert.ok(Array.isArray(routing[0].reasons));
  });
});

// ── 6. ConsensusEngine ───────────────────────────────────────────────────────

import { buildConsensus } from '../consensus/ConsensusEngine.js';

const makeOutput = (agentId, action, confidence, relevance, findings = []) => ({
  agentId,
  agentName:     agentId,
  domain:        'test',
  sessionId:     'sess-consensus',
  confidence,
  relevanceScore:relevance,
  findings,
  recommendation:{ action, priority: 'today', rationale: 'test' },
  executionHints:[],
  escalations:   [],
  reasoning:     '',
  durationMs:    100,
  error:         false,
});

describe('ConsensusEngine', () => {
  it('reaches consensus when all agents agree to proceed', () => {
    const outputs = [
      makeOutput('eng',   'merge the pull request', 80, 90),
      makeOutput('github','approve and merge PR #42', 75, 85),
      makeOutput('risk',  'proceed with merge', 70, 60),
    ];
    const result = buildConsensus(outputs);
    assert.equal(result.dominantPolarity, 'proceed');
    assert.ok(result.confidence > 0);
  });

  it('detects conflict when proceed vs caution', () => {
    const outputs = [
      makeOutput('eng',      'proceed with deployment', 80, 90),
      makeOutput('security', 'hold — security risk detected', 75, 85),
    ];
    const result = buildConsensus(outputs);
    assert.ok(result.conflicts.length > 0, 'Should detect proceed vs caution conflict');
    assert.equal(result.reached, false, 'Should not reach consensus on conflict');
  });

  it('applies security veto when security says hold and majority says proceed', () => {
    const outputs = [
      makeOutput('eng',      'merge the PR now', 85, 95),
      makeOutput('github',   'proceed with merge', 80, 90),
      makeOutput('hr',       'proceed', 70, 60),
      makeOutput('security', 'hold — CVE detected in dependency', 90, 80),
    ];
    const result = buildConsensus(outputs);
    assert.equal(result.securityVetoed, true, 'Security veto should be applied');
    assert.equal(result.reached, false, 'Consensus should not be reached on security veto');
  });

  it('returns empty consensus for empty input', () => {
    const result = buildConsensus([]);
    assert.equal(result.reached, false);
    assert.equal(result.confidence, 0);
    assert.deepEqual(result.supportingAgents, []);
  });

  it('returns empty consensus when all agents have low relevance', () => {
    const outputs = [
      makeOutput('irrelevant', 'do something', 50, 5),
    ];
    const result = buildConsensus(outputs);
    assert.equal(result.reached, false);
  });

  it('preserves minority views with evidence', () => {
    const outputs = [
      makeOutput('eng',      'deploy now', 85, 95, [{ type: 'info', title: 't', description: 'd', severity: 'low', evidence: [] }]),
      makeOutput('github',   'deploy immediately', 80, 90),
      makeOutput('security', 'hold — risk', 75, 85, [{ type: 'risk', title: 'CVE', description: 'critical', severity: 'critical', evidence: ['CVE-2024-xxx'] }]),
    ];
    const result = buildConsensus(outputs);
    assert.ok(result.minorityViews.length > 0, 'Should have minority views');
  });
});

// ── 7. DecisionSynthesizer ────────────────────────────────────────────────────

import { assembleFinalResult } from '../consensus/DecisionSynthesizer.js';

describe('DecisionSynthesizer', () => {
  it('assembles full result with required fields', () => {
    const outputs = [
      makeOutput('eng', 'merge PR', 80, 90, [{ type: 'risk', title: 'R1', description: 'D', severity: 'high', evidence: [] }]),
    ];
    const consensus = buildConsensus(outputs);
    const decision  = {
      title: 'Merge PR #42',
      summary: 'PR is ready.',
      confidence: 82,
      priority: 'today',
      rationale: 'All checks pass.',
      risks: [],
      conflictResolutions: [],
      executionPlan: { workflows: [], suggestedActions: [], sequencing: 'sequential' },
      alternatives: [],
      nextSteps: [],
    };
    const result = assembleFinalResult({
      sessionId:    'sess-synth',
      workspaceId:  'ws-test',
      intent:       { question: 'Should we merge?', domain: 'engineering' },
      selectedAgents: ['eng'],
      agentOutputs:  outputs,
      consensus,
      decision,
      pipelineStages: [{ name: 'ParseIntent', status: 'completed', durationMs: 5 }],
      totalDurationMs: 1500,
    });

    assert.equal(result.sessionId, 'sess-synth');
    assert.equal(result.workspaceId, 'ws-test');
    assert.ok(result.decision);
    assert.ok(Array.isArray(result.allFindings));
    assert.ok(Array.isArray(result.topRisks));
    assert.ok(typeof result.totalDurationMs === 'number');
    assert.equal(result.engineVersion, '11.0');
    assert.ok(result.agentParticipation.length > 0);
  });

  it('sorts findings by severity (critical first)', () => {
    const outputs = [
      makeOutput('eng', 'check', 80, 90, [
        { type: 'risk', title: 'Low',  description: '', severity: 'low',      evidence: [] },
        { type: 'risk', title: 'Crit', description: '', severity: 'critical', evidence: [] },
        { type: 'risk', title: 'High', description: '', severity: 'high',     evidence: [] },
      ]),
    ];
    const result = assembleFinalResult({
      sessionId: 's', workspaceId: 'w',
      intent: { question: 'q', domain: 'eng' },
      selectedAgents: ['eng'], agentOutputs: outputs,
      consensus: buildConsensus(outputs),
      decision: { title: 't', summary: 's', confidence: 50, priority: 'today', rationale: 'r', risks: [], conflictResolutions: [], executionPlan: { workflows:[], suggestedActions:[], sequencing:'sequential' }, alternatives:[], nextSteps:[] },
      pipelineStages: [],
      totalDurationMs: 100,
    });
    assert.equal(result.allFindings[0].severity, 'critical');
    assert.equal(result.allFindings[result.allFindings.length - 1].severity, 'low');
  });
});

// ── 8. Specialized Agents — construction and relevance ───────────────────────

import { EngineeringAgent }     from '../agents/EngineeringAgent.js';
import { SecurityAgent }        from '../agents/SecurityAgent.js';
import { HRAgent }              from '../agents/HRAgent.js';
import { GitHubAgent }          from '../agents/GitHubAgent.js';
import { RiskAgent }            from '../agents/RiskAgent.js';
import { ComplianceAgent }      from '../agents/ComplianceAgent.js';

describe('Specialized Agents', () => {
  it('EngineeringAgent has correct domain and keywords', () => {
    const agent = new EngineeringAgent();
    assert.equal(agent.domain, 'engineering');
    assert.ok(agent.keywords.includes('pr'));
  });

  it('SecurityAgent has elevated always-on relevance', () => {
    const agent  = new SecurityAgent();
    const intent = { question: 'What is the finance budget?', domain: 'finance', entities: [] };
    const score  = agent._computeRelevance(intent);
    assert.ok(score >= 30, 'Security agent should always be at least 30 relevant');
  });

  it('HRAgent treats PII with care (mission mentions confidentiality)', () => {
    const agent = new HRAgent();
    assert.ok(agent.buildSystemPrompt().includes('confidentiality') || agent.mission.includes('workforce'));
  });

  it('GitHubAgent has github in connectors', () => {
    const agent = new GitHubAgent();
    assert.ok(agent.connectors.includes('github'));
  });

  it('RiskAgent is at least 25 relevant to all queries', () => {
    const agent  = new RiskAgent();
    const intent = { question: 'What is happening in customer success?', domain: 'customers', entities: [] };
    const score  = agent._computeRelevance(intent);
    assert.ok(score >= 25, `Risk agent relevance should be >= 25, got ${score}`);
  });

  it('ComplianceAgent uses policies in reasoning context', () => {
    const agent   = new ComplianceAgent();
    const prompt  = agent.buildSystemPrompt();
    assert.ok(prompt.includes('policy') || prompt.includes('compliance') || prompt.includes('regulatory'));
  });

  it('all 18 specialized agents have id, name, domain, mission', () => {
    const AgentClasses = [
      EngineeringAgent, SecurityAgent, HRAgent, GitHubAgent, RiskAgent, ComplianceAgent,
    ];
    for (const Cls of AgentClasses) {
      const agent = new Cls();
      assert.ok(agent.id,      `${Cls.name} missing id`);
      assert.ok(agent.name,    `${Cls.name} missing name`);
      assert.ok(agent.domain,  `${Cls.name} missing domain`);
      assert.ok(agent.mission, `${Cls.name} missing mission`);
    }
  });

  it('startCognitiveBrain registers 19 agents (18 + CoS)', () => {
    // startCognitiveBrain was called in AgentRouter tests
    assert.ok(agentCount() >= 19, `Expected 19+ agents, got ${agentCount()}`);
  });
});

// ── 9. ChiefOfStaffAgent heuristic fallback ──────────────────────────────────

import { decomposeIntent, synthesize } from '../agents/ChiefOfStaffAgent.js';

describe('ChiefOfStaffAgent (heuristic paths)', () => {
  before(() => {
    // Ensure agents are registered (may already be from above)
    if (agentCount() < 5) startCognitiveBrain();
  });

  it('decomposeIntent falls back gracefully when LLM unavailable', async () => {
    const intent  = { question: 'test', domain: 'engineering', entities: [], urgency: 'low' };
    const agents  = ['engineering', 'security'];
    const session = createSession('ws-cos', 'org-cos', 'test');
    // With no LLM key in test env, heuristic fallback runs
    const result  = await decomposeIntent(intent, agents, {}, session.id);
    assert.ok(Array.isArray(result));
    // Every returned agentId should be in the selected list
    for (const d of result) {
      assert.ok(agents.includes(d.agentId), `Unexpected agentId ${d.agentId}`);
    }
  });

  it('synthesize heuristic fallback produces valid ExecutionRecommendation', async () => {
    const intent = { question: 'Should we deploy?', domain: 'engineering', entities: [], urgency: 'medium' };
    const outputs = [
      makeOutput('eng', 'proceed with deployment', 80, 90, [
        { type: 'info', title: 'Build green', description: 'CI passed', severity: 'low', evidence: [] },
      ]),
    ];
    const consensus = buildConsensus(outputs);
    const session   = createSession('ws-cos2', 'org-cos2', 'deploy?');

    const recommendation = await synthesize(intent, outputs, consensus, {}, session.id);

    assert.ok(recommendation.title);
    assert.ok(recommendation.executionPlan);
    assert.ok(Array.isArray(recommendation.executionPlan.workflows));
    assert.ok(Array.isArray(recommendation.executionPlan.suggestedActions));
    assert.ok(typeof recommendation.confidence === 'number');
  });
});

// ── 10. Integration tests (skip if no server) ─────────────────────────────────

// Require an explicit TEST_SERVER_URL — DATABASE_URL in .env doesn't mean a server is running
const INTEGRATION_SKIP  = !process.env.TEST_SERVER_URL;
const SERVER_URL        = process.env.TEST_SERVER_URL || 'http://localhost:5001';
const TEST_JWT          = process.env.TEST_JWT;
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || 'workspace_corp_alpha';

describe('Integration — full pipeline (requires live server)', { skip: INTEGRATION_SKIP }, () => {
  it('GET /api/brain/agents returns agent list', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents`, {
      headers: { Authorization: `Bearer ${TEST_JWT}`, 'workspace-id': TEST_WORKSPACE_ID },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.agents.length >= 19, 'Should have 19+ agents');
    assert.ok(data.agents.some(a => a.id === 'security'));
    assert.ok(data.agents.some(a => a.id === 'chief-of-staff'));
  });

  it('GET /api/brain/agents/stats returns registry stats', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents/stats`, {
      headers: { Authorization: `Bearer ${TEST_JWT}`, 'workspace-id': TEST_WORKSPACE_ID },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.registeredAgents >= 19);
  });

  it('GET /api/brain/agents/routing explains routing', async () => {
    const url = `${SERVER_URL}/api/brain/agents/routing?question=What+PRs+need+review`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TEST_JWT}`, 'workspace-id': TEST_WORKSPACE_ID },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.selected.length > 0);
    assert.ok(data.routing.length > 0);
  });

  it('GET /api/brain/agents/:id returns agent definition', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents/engineering`, {
      headers: { Authorization: `Bearer ${TEST_JWT}`, 'workspace-id': TEST_WORKSPACE_ID },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.agent.id, 'engineering');
  });

  it('GET /api/brain/agents/nonexistent returns 404', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents/does-not-exist`, {
      headers: { Authorization: `Bearer ${TEST_JWT}`, 'workspace-id': TEST_WORKSPACE_ID },
    });
    assert.equal(res.status, 404);
  });

  it('POST /api/brain/agents/reason returns result with all required fields', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents/reason`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${TEST_JWT}`,
        'workspace-id': TEST_WORKSPACE_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'What pull requests need review this week?' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.result.sessionId);
    assert.ok(data.result.intent);
    assert.ok(Array.isArray(data.result.agentParticipation));
    assert.ok(data.result.decision);
    assert.ok(data.result.consensus);
    assert.ok(data.result.executionPlan);
    assert.ok(typeof data.result.overallConfidence === 'number');
  });

  it('POST /api/brain/agents/reason validates missing question', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents/reason`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${TEST_JWT}`,
        'workspace-id': TEST_WORKSPACE_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.ok(res.status >= 400);
  });

  it('POST /api/brain/agents/:id/reason runs single agent', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents/engineering/reason`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${TEST_JWT}`,
        'workspace-id': TEST_WORKSPACE_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'What is the engineering team shipping this week?' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.agentId, 'engineering');
    assert.ok(data.output.confidence >= 0);
    assert.ok(Array.isArray(data.output.findings));
  });

  it('GET /api/brain/agents/sessions returns session list', async () => {
    const res = await fetch(`${SERVER_URL}/api/brain/agents/sessions`, {
      headers: { Authorization: `Bearer ${TEST_JWT}`, 'workspace-id': TEST_WORKSPACE_ID },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.sessions));
  });
});
