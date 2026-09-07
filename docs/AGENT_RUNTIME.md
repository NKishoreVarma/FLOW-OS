# FLOW AgentRuntime — Iterative Read-Only Agent Loop

> Status: **experimental, OFF by default.** Read-only. Governed. Verified.
> Stages 3–4 (Design → PoC → controlled OperationalBrain integration + LLM planner).

## 1. Why it exists

FLOW already performs single-shot reasoning over pre-fetched context. The one gap
was a **controlled, iterative tool-using loop**: perceive → reason → select a tool →
FLOW authorizes → execute → observe → reason again → stop → verify → answer.

The AgentRuntime fills only that gap. It does **not** replace OperationalBrain,
Router, Critic, ClaimVerifier, AnswerVerifier, ConfidenceScorer, governance,
RuntimeEngine, or retrieval. It is an **evidence-gathering capability** whose output
still flows through the existing verification pipeline.

DeepSeek Harness is **inspiration only** — not a dependency, not installed, granted
no data / filesystem / shell access. The `AgentRuntime` interface is the swap point:

```
AgentRuntime
  ├── FlowNativeRuntime          (this implementation)
  └── DeepSeekHarnessAdapter     (future / optional — documented stub only)
```

## 2. Files (`src/ai/agent/`)

| File | Responsibility |
|------|----------------|
| `index.js` | Public API: `createAgentRuntime`, `answerWithAgent`, tool-set constants |
| `FlowNativeRuntime.js` | The loop: start/cancel/status/events/result, limits, timeout |
| `toolGateway.js` | The ONLY door to data: allow-list → read-only → governance → workspace-stamp → execute → provenance |
| `planner.js` | Deterministic heuristic planner (offline-safe default) |
| `llmPlanner.js` | LLM planner (strict JSON, safety-strip, heuristic fallback) via BrainRouter |
| `answerComposer.js` | Reuses EvidenceRanker → ReasoningEngine → VerificationEngine → ConfidenceScorer → ClaimVerifier |
| `evidence.js` | Tool observation → EvidenceItem normalization + entity extraction |
| `agentLimits.js` | FLOW-controlled budgets + hard ceilings (model cannot raise them) |
| `agentEvents.js` | Redacted event sink (in-memory + eventBus) |
| `agentRouting.js` | `classifyAgentRouting()` — when iterative reasoning is justified (utility, not default) |
| `brainIntegration.js` | Optional, OFF-by-default OperationalBrain wiring |
| `types.js` | Status / StopReason / EventType constants |

Prerequisite fix (Stage 4A): `src/ai/tools/{toolRegistry,toolExecutor}.js` — one
canonical tool contract (`actionType` = ActionType verb; `payload` carries specifics;
`payloadTemplate` is FLOW-controlled and un-overridable by the model).

## 3. Tool contract (canonical)

```
tool = { name, description, connector, actionType, capability, riskTier,
         parameters(JSON-Schema), payloadTemplate?, internal?, internalOp? }
```
`buildActionRequest()` → `executeAction({ workspaceId, connectorId, actionType,
payload:{...input, ...payloadTemplate}, actor:{id,role,orgId}, orgPlan })`.
Governance derives `capability` from the adapter and evaluates the verb; the adapter
dispatches on the same verb. **No competing vocabularies.**

## 4. Security boundary (the model is untrusted)

| Control | Where |
|---|---|
| Allow-list (deny by default) | `toolGateway.authorize` |
| Read-only (side-effectful ActionTypes refused) | `toolGateway.authorize` |
| Governance verdict (role × verb × capability × plan) | `evaluate()` + `executeAction`'s `evaluateWithPolicies` |
| Workspace forced; model `workspaceId` stripped | `toolGateway.run` + `buildActionRequest` |
| Provenance FLOW-stamped (foreign workspace dropped) | `toolGateway.run` |
| Planner control-field strip (workspace/user/role/risk/approval/limits) | `llmPlanner._stripForbidden` |
| Hallucinated/disallowed tool → safe fallback | `llmPlanner` |
| External content stays DATA (never authority) | loop re-plans from immutable task, not accumulated tool text |
| Loop bounds (iterations/tool-calls/timeout/consecutive-failures) | `agentLimits` (hard ceilings) |

## 5. Model routing (Stage 4F)

The LLM planner calls `BrainRouter.reason()` — the existing provider abstraction
(Ollama/Gemini/OpenAI/Anthropic) with fallback chain, cache, timeout, and metrics.
No second routing system. With no provider reachable, the planner falls back to the
deterministic heuristic (model calls ≈ 0).

## 6. Observability (Stage 4K)

Every run exposes `result.trace` (redacted — no bodies/tokens/PII):
```
{ runId, requestId, sessionId, workspaceId, plannerCalls, toolCalls,
  toolFailures, deniedCount, iterations, retries, durationMs,
  terminationReason, verificationStatus, confidenceScore }
```
plus a redacted `result.events[]` stream (`agent.execution.started`,
`agent.tool.requested|authorized|denied|completed|failed`, `agent.iteration.*`,
`agent.execution.completed|failed|cancelled`), mirrored to the eventBus.

## 7. OperationalBrain integration (Stage 4C — OFF by default)

`runReasoning(ws, { …, agentMode })`:
- `agentMode` absent/false and `AGENT_MODE!=on` → **standard pipeline, byte-for-byte unchanged**.
- `agentMode === true` or `AGENT_MODE=on` → AgentRuntime gathers evidence, then
  `composeAnswer()` runs the **same** verification pipeline. On any failure it falls
  through to the standard pipeline — never fabricates.

## 8. Configuration

| Env | Default | Meaning |
|---|---|---|
| `AGENT_MODE` | `off` | Enable agent mode globally (still overridable per-call) |
| `AGENT_PLANNER` | `heuristic` | `llm` to use the LLM planner |
| `AGENT_RUNTIME` | `flow-native` | Runtime implementation selector |
| `AGENT_MAX_ITERATIONS` | 6 | Loop iterations (ceiling 12) |
| `AGENT_MAX_TOOL_CALLS` | 10 | Total tool calls (ceiling 24) |
| `AGENT_TIMEOUT_MS` | 30000 | Wall-clock budget (ceiling 120000) |
| `AGENT_TOOL_TIMEOUT_MS` | 12000 | Per-tool timeout (ceiling 30000) |
| `AGENT_MAX_CONSEC_FAILURES` | 3 | Consecutive-failure cutoff (ceiling 5) |

## 9. Running it

```bash
# Certification PoC (real Helios dataset, offline)
node scripts/validate-agent-runtime.js

# Baseline vs agent benchmark (uses LLM if a key is set)
node scripts/benchmark-agent.js workspace_demo

# Tests
node --test --test-force-exit 'tests/unit/{toolExecutor,agentRuntime,agentSecurity,externalToolContract,agentBrainWiring,agentAdversarial}.test.js'
```

## 10. Replacing the runtime later

Implement the same surface (`start()` → `{ done, cancel, getStatus, getEvents,
getResult }`) and register it in `createAgentRuntime()`. Knowledge, governance,
permissions, connectors, retrieval, audit, and the verification pipeline are
untouched — the adapter is the only thing that changes.

## 11. Known limitations

- Simulated adapters (workday/hubspot/notion/jira) expose reads via `READ +
  resourceType`; their `_search` methods are pre-existing skeletons (unused).
- Heuristic planner + internal tools gathers **less** evidence than the baseline's
  parallel capability dispatch (see benchmark) — agent mode is faster but shallower
  today; it is **not** recommended as default.
- Full LLM-quality/token comparison requires an LLM-enabled environment.
- Read-only. No mutation tools are exposed to the agent.
