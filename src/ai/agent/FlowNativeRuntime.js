/**
 * FlowNativeRuntime — the small FLOW-native iterative agent loop.
 *
 *   perceive → reason (plan next move) → select tool → FLOW authorizes → execute
 *   → observe → re-plan → repeat → compose an evidence-backed answer.
 *
 * It owns ONLY loop mechanics: iteration, tool selection, observation, limits,
 * cancellation, timeout, events. It never retrieves data itself (only via the
 * governed ToolGateway) and never verifies its own answer (it hands evidence to
 * the existing pipeline via composeAnswer). It never replaces OperationalBrain,
 * Router, Critic, ClaimVerifier, ConfidenceScorer, governance, or RuntimeEngine.
 *
 * This is one of potentially several AgentRuntime implementations. A future
 * DeepSeekHarnessAdapter would implement the same start()/getStatus()/getEvents()
 * surface — nothing else in FLOW would change.
 */

import { randomUUID } from 'crypto';
import { analyzeIntent }    from '../reasoning/IntentAnalyzer.js';
import { createToolGateway } from './toolGateway.js';
import { createEventSink }   from './agentEvents.js';
import { planNextStep }      from './planner.js';
import { observationToEvidence } from './evidence.js';
import { composeAnswer }     from './answerComposer.js';
import { buildEvidencePlan } from './evidencePlan.js';
import { buildIntentModel }  from '../reasoning/intentModel.js';
import { resolveLimits }     from './agentLimits.js';
import { AgentStatus, StopReason, AgentEventType } from './types.js';

const _sleep = ms => new Promise(r => setTimeout(r, ms));

function _withTimeout(promise, ms, label = 'tool') {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function _classifyError(msg = '') {
  if (/timed out/i.test(msg))               return 'timeout';
  if (/unauthor|forbidden|denied|403|401/i.test(msg)) return 'authorization';
  if (/not found|404/i.test(msg))           return 'not_found';
  if (/network|econn|fetch|socket/i.test(msg)) return 'network';
  return 'error';
}

export class FlowNativeRuntime {
  constructor({ toolGatewayFactory = createToolGateway, composer = composeAnswer, intentFn = analyzeIntent, planner = null } = {}) {
    this._toolGatewayFactory = toolGatewayFactory;
    this._composer = composer;
    this._intentFn = intentFn;
    // Async planner: ({question,intent,evidence,allowedTools,state,toolTrace}) → step.
    // Default is the deterministic heuristic (wrapped async). An LLM planner can be injected.
    this._planner = planner ?? (async (args) => planNextStep(args));
    this._runs = new Map();   // runId → run record
  }

  /**
   * Start a bounded agentic run. Returns a handle immediately; the loop proceeds
   * asynchronously. Await handle.done for the final AgentResult.
   *
   * @param {{ question:string, allowedToolNames:string[] }} task
   * @param {import('./types.js').AgentExecutionContext} ctx
   * @param {object} [options] { limits, onEvent, gateway (injected), roster }
   */
  start(task, ctx, options = {}) {
    const runId  = randomUUID();
    const limits = resolveLimits(options.limits);
    const sink   = createEventSink({ runId, workspaceId: ctx.workspaceId, onEvent: options.onEvent, emitToBus: options.emitToBus !== false });

    const gateway = options.gateway ?? this._toolGatewayFactory({
      ctx,
      allowedToolNames: task.allowedToolNames || [],
    });

    const run = {
      runId, ctx, task, limits, sink, gateway,
      status: AgentStatus.RUNNING,
      cancelled: false,
      cancelReason: null,
      result: null,
    };
    this._runs.set(runId, run);

    run.done = this._loop(run, options).catch(err => {
      run.status = AgentStatus.FAILED;
      run.result = {
        runId, status: AgentStatus.FAILED, stopReason: StopReason.ERROR,
        error: err?.message ?? String(err), answer: null,
        evidence: [], toolTrace: [], iterations: 0, toolCalls: 0,
      };
      sink.emit(AgentEventType.EXECUTION_FAILED, { stopReason: StopReason.ERROR, errorClass: _classifyError(err?.message) });
      return run.result;
    });

    return {
      runId,
      done: run.done,
      cancel: (reason) => this.cancel(runId, reason),
      getStatus: () => this.getStatus(runId),
      getEvents: () => this.getEvents(runId),
      getResult: () => this.getResult(runId),
    };
  }

  cancel(runId, reason = 'cancelled') {
    const run = this._runs.get(runId);
    if (!run) return;
    run.cancelled = true;
    run.cancelReason = reason;
  }

  getStatus(runId) { return this._runs.get(runId)?.status ?? null; }
  getEvents(runId) { return this._runs.get(runId)?.sink.events ?? []; }
  async getResult(runId) {
    const run = this._runs.get(runId);
    if (!run) return null;
    return run.result ?? run.done;
  }

  // ── The loop ────────────────────────────────────────────────────────────────
  async _loop(run, options) {
    const { runId, ctx, task, limits, sink, gateway } = run;
    const startMs  = Date.now();
    const deadline = startMs + limits.executionTimeoutMs;
    const allowedTools = task.allowedToolNames || [];

    sink.emit(AgentEventType.EXECUTION_STARTED, {
      question: task.question, allowedTools: allowedTools.length,
      maxIterations: limits.maxIterations, maxToolCalls: limits.maxToolCalls,
    });

    const intent = await this._safeIntent(task.question);

    // Stage 5: derive the intent model + evidence plan ONCE (deterministic, wording-based,
    // offline). Gives the planner a grounded "what info do I need" target. Best-effort —
    // the loop still works without it.
    let intentModel = null, evidencePlan = null;
    try {
      intentModel  = await buildIntentModel(task.question, { workspaceId: ctx.workspaceId });
      evidencePlan = buildEvidencePlan(intentModel);
    } catch { /* planner falls back to wording-only reasoning */ }

    const evidence  = [];
    const toolTrace = [];
    const calledSignatures = new Set();
    const state = { searchesDone: 0, refinedSearchDone: false, exploredEntities: new Set() };
    let iterations = 0, toolCalls = 0, consecutiveFailures = 0, plannerCalls = 0, toolFailures = 0, deniedCount = 0;
    let stopReason = null;

    while (true) {
      if (run.cancelled)              { stopReason = StopReason.CANCELLED; break; }
      if (Date.now() > deadline)      { stopReason = StopReason.TIMEOUT; break; }
      if (iterations >= limits.maxIterations) { stopReason = StopReason.MAX_ITERATIONS; break; }

      iterations++;
      sink.emit(AgentEventType.ITERATION_STARTED, { iteration: iterations, evidenceCount: evidence.length });

      plannerCalls++;
      let step;
      try {
        step = await this._planner({ question: task.question, intent, evidence, allowedTools, state, toolTrace, intentModel, evidencePlan });
      } catch {
        step = planNextStep({ question: task.question, intent, evidence, allowedTools, state });
      }

      if (step.action === 'finish') {
        stopReason = StopReason[step.reason] ?? StopReason.SUFFICIENT;
        sink.emit(AgentEventType.ITERATION_COMPLETED, { iteration: iterations, evidenceCount: evidence.length, decision: 'finish' });
        break;
      }

      if (toolCalls >= limits.maxToolCalls) { stopReason = StopReason.MAX_TOOL_CALLS; break; }

      const sig = `${step.toolName}:${JSON.stringify(step.input)}`;
      if (calledSignatures.has(sig)) { stopReason = StopReason.NO_PRODUCTIVE_TOOL; break; }
      calledSignatures.add(sig);

      sink.emit(AgentEventType.TOOL_REQUESTED, { iteration: iterations, toolName: step.toolName });

      // FLOW authorizes — the model never decides this.
      const auth = gateway.authorize(step.toolName);
      if (!auth.ok) {
        sink.emit(AgentEventType.TOOL_DENIED, { toolName: step.toolName, reason: auth.reason });
        toolTrace.push({ toolName: step.toolName, ok: false, denied: true, reason: auth.reason });
        consecutiveFailures++; deniedCount++;
        if (consecutiveFailures >= limits.maxConsecutiveFailures) { stopReason = StopReason.TOO_MANY_FAILURES; break; }
        continue;
      }
      sink.emit(AgentEventType.TOOL_AUTHORIZED, { toolName: step.toolName });

      toolCalls++;
      let obs;
      try {
        obs = await _withTimeout(gateway.run(step.toolName, step.input), limits.perToolTimeoutMs, step.toolName);
      } catch (err) {
        obs = { ok: false, toolName: step.toolName, error: err?.message ?? String(err) };
      }

      if (!obs.ok) {
        consecutiveFailures++;
        if (obs.denied) { deniedCount++; sink.emit(AgentEventType.TOOL_DENIED, { toolName: step.toolName, reason: obs.reason }); }
        else            { toolFailures++; sink.emit(AgentEventType.TOOL_FAILED, { toolName: step.toolName, errorClass: _classifyError(obs.error) }); }
        toolTrace.push({ toolName: step.toolName, ok: false, denied: !!obs.denied, reason: obs.reason, errorClass: _classifyError(obs.error) });
        if (consecutiveFailures >= limits.maxConsecutiveFailures) { stopReason = StopReason.TOO_MANY_FAILURES; break; }
        sink.emit(AgentEventType.ITERATION_COMPLETED, { iteration: iterations, evidenceCount: evidence.length });
        continue;
      }

      consecutiveFailures = 0;
      if (step.toolName === 'search_workspace') state.searchesDone++;
      if (step.input?.query && intent?.searchTerms) state.refinedSearchDone = state.refinedSearchDone || state.searchesDone > 1;
      if (step.toolName === 'get_entity') state.exploredEntities.add(step.input.entityId);

      const newItems = observationToEvidence(obs);
      evidence.push(...newItems);
      toolTrace.push({ toolName: step.toolName, ok: true, evidenceAdded: newItems.length, sourceType: obs.provenance?.sourceType });
      sink.emit(AgentEventType.TOOL_COMPLETED, {
        toolName: step.toolName, evidenceAdded: newItems.length,
        sourceType: obs.provenance?.sourceType, sourceId: obs.provenance?.sourceId ?? null,
      });
      sink.emit(AgentEventType.ITERATION_COMPLETED, { iteration: iterations, evidenceCount: evidence.length });
    }

    // ── Hand evidence to the existing verification pipeline ──────────────────────
    const composed = await this._composer({
      question: task.question, intent, evidenceItems: evidence,
      workspaceId: ctx.workspaceId, roster: options.roster,
    });

    const durationMs = Date.now() - startMs;
    const status =
      stopReason === StopReason.CANCELLED ? AgentStatus.CANCELLED :
      stopReason === StopReason.TIMEOUT   ? AgentStatus.TIMED_OUT :
      AgentStatus.DONE;

    run.status = status;
    run.result = {
      runId, status, stopReason,
      question: task.question,
      answer: composed.answer,
      evidence,
      evidenceCount: evidence.length,
      toolTrace,
      iterations,
      toolCalls,
      durationMs,
      confidence:   composed.confidence,
      verification: composed.verification,
      reasoning:    composed.reasoning,
      insufficientEvidence: composed.insufficientEvidence ?? false,
      events: sink.events,
      // ── Observability trace (Stage 4K) — inspectable, no sensitive content ──
      trace: {
        runId,
        requestId:    ctx.requestId ?? null,
        sessionId:    ctx.sessionId ?? null,
        workspaceId:  ctx.workspaceId,
        plannerCalls,
        toolCalls,
        toolFailures,
        deniedCount,
        iterations,
        retries: 0,                       // read-only loop: no per-tool retry storms
        durationMs,
        terminationReason: stopReason,
        verificationStatus: composed.verification?.status ?? (composed.verification?.passed ? 'PASS' : 'UNKNOWN'),
        confidenceScore: composed.confidence?.score ?? null,
        route: intentModel?.retrievalStrategy ?? null,
        requestedDepth: intentModel?.requestedDepth ?? null,
        responseMode: intentModel?.responseMode ?? null,
      },
    };

    const terminal =
      status === AgentStatus.CANCELLED ? AgentEventType.EXECUTION_CANCELLED :
      AgentEventType.EXECUTION_COMPLETED;
    sink.emit(terminal, {
      stopReason, iterations, toolCalls, durationMs,
      evidenceCount: evidence.length, confidence: composed.confidence?.score ?? null,
    });

    return run.result;
  }

  async _safeIntent(question) {
    try {
      // fast=true → heuristic classification only, no LLM round-trip (deterministic + offline-safe).
      return await this._intentFn(question, { fast: true });
    } catch {
      return { question, questionType: 'diagnostic', domain: 'general', timeframe: 'present', urgency: 'medium', searchTerms: [] };
    }
  }
}

export { _sleep };
