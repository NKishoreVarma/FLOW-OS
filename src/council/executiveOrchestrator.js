/**
 * FLOW OS — Executive Orchestrator (Phase 15)
 *
 * Coordinates the executive council: routes a question to the relevant agents, runs
 * them in parallel (fault-isolated), collects structured findings, then (M2) runs the
 * debate + executive synthesis. It orchestrates existing systems and holds no
 * reasoning of its own.
 */

import { route } from './router.js';
import { makeAgent } from './agents/ExecutiveAgent.js';
import { detectDebate } from './debateEngine.js';
import { synthesize } from './councilSynthesizer.js';
import { aggregateConfidence } from './confidenceAggregate.js';

/**
 * @param {string} workspaceId
 * @param {string} question
 * @param {object} [opts] { agents?: string[] }  explicit agent ids override routing
 * @returns council result
 */
export async function askCouncil(workspaceId, question, opts = {}) {
  const started = Date.now();

  // 1. Route
  const routing = opts.agents?.length
    ? { selected: opts.agents, scores: {}, ambiguous: false, reason: 'Explicit agent selection.' }
    : await route(question);

  // 2. Run selected agents in parallel — fault-isolated AND time-isolated. A slow
  //    Brain call for one domain must not hang (or time out) the whole council; that
  //    agent is simply dropped from this round.
  const agents = routing.selected.map(makeAgent).filter(Boolean);
  const timeoutMs = Number(process.env.COUNCIL_AGENT_TIMEOUT_MS) || 95000;
  const settled = await Promise.allSettled(agents.map((a) => withTimeout(a.analyze(workspaceId, question), timeoutMs, a.id)));
  const findings = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((f) => f && !f.error);

  // 3. Debate — surface disagreement, tradeoffs, minority opinions.
  const debate = detectDebate(findings);

  // 4. Executive synthesis — one final answer (LLM + fallback), explained.
  const synthesis = await synthesize(workspaceId, question, findings, debate);

  return {
    question,
    routedAgents: routing.selected,
    routing,
    findings,
    debate,
    answer: synthesis.answer,
    confidence: synthesis.confidence,
    synthesisMethod: synthesis.method || 'deterministic',
    evidence: dedupeEvidence(findings),
    actions: collectActions(findings),
    elapsedMs: Date.now() - started,
  };
}

/**
 * Streaming variant — emits progress as it happens (perceived speed): which agents are
 * working, each finding AS IT LANDS (not after all finish), the debate, then the
 * synthesis token stream. `emit(event)` is called for every step.
 */
export async function askCouncilStream(workspaceId, question, emit, opts = {}) {
  const started = Date.now();
  const routing = opts.agents?.length
    ? { selected: opts.agents, ambiguous: false, reason: 'Explicit agent selection.' }
    : await route(question);

  const agents = routing.selected.map(makeAgent).filter(Boolean);
  emit({ type: 'routed', agents: agents.map((a) => ({ id: a.id, title: a.title })), reason: routing.reason });

  // Sequential in the streaming path: each executive reports in turn, so findings
  // land one-by-one (visible progress) AND each agent gets the full model instead of
  // contending — the non-streaming /ask stays parallel. Per-agent timeout guards a stall.
  const timeoutMs = Number(process.env.COUNCIL_AGENT_TIMEOUT_MS) || 90000;
  const findings = [];
  for (const a of agents) {
    emit({ type: 'agent_start', agent: a.id });
    try {
      const f = await withTimeout(a.analyze(workspaceId, question), timeoutMs, a.id);
      if (f && !f.error) { findings.push(f); emit({ type: 'agent_done', agent: a.id, finding: f }); }
      else emit({ type: 'agent_failed', agent: a.id });
    } catch { emit({ type: 'agent_failed', agent: a.id }); }
  }

  const debate = detectDebate(findings);
  emit({ type: 'debate', debate });

  emit({ type: 'status', message: 'Synthesizing the council’s answer' });
  const synthesis = await synthesize(workspaceId, question, findings, debate, (delta) => emit({ type: 'token', delta }));

  emit({
    type: 'done',
    routedAgents: routing.selected, findings, debate,
    answer: synthesis.answer, confidence: synthesis.confidence,
    actions: collectActions(findings), evidence: dedupeEvidence(findings),
    elapsedMs: Date.now() - started,
  });
}

/** Run a single named agent (for /api/council/agent/:id). */
export async function askAgent(workspaceId, agentId, question) {
  const agent = makeAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);
  return agent.analyze(workspaceId, question);
}

export { aggregateConfidence };

/** Resolve `p`, but if it takes longer than `ms`, resolve to a timed-out finding. */
function withTimeout(p, ms, agentId) {
  return Promise.race([
    p,
    new Promise((resolve) => setTimeout(() => resolve({ agent: agentId, error: true, timedOut: true }), ms)),
  ]);
}

function collectActions(findings) {
  const out = [];
  for (const f of findings) {
    for (const a of f.recommendedActions || []) {
      out.push({ agent: f.agent, action: a });
    }
  }
  return out.slice(0, 12);
}

function dedupeEvidence(findings) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    for (const e of f.evidence || []) {
      const key = e.ref || e.content?.slice(0, 60);
      if (key && !seen.has(key)) { seen.add(key); out.push({ agent: f.agent, ...e }); }
    }
  }
  return out.slice(0, 15);
}

export default { askCouncil, askAgent, aggregateConfidence };
