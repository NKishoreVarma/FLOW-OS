# Executive Orchestrator (Phase 15)

Coordinates the executive council. It holds **no reasoning of its own** — it routes,
parallelizes, collects, and hands off to the debate + synthesis layers.

## `askCouncil(workspaceId, question, { agents })`

1. **Route** (`router.js`) — deterministic. Each agent's domain keywords are matched
   against the question, boosted by the existing `CapabilityPlanner`'s capability
   selection (reuse, not a new LLM call). Agents with any signal are selected; an
   ambiguous question (no signal) consults the **full council**. An explicit `agents`
   list overrides routing.
2. **Parallel + isolated** — `Promise.allSettled(agents.map(a => a.analyze(...)))`.
   Every agent call is wrapped in `withTimeout` (`COUNCIL_AGENT_TIMEOUT_MS`, default
   60 s): a failing **or slow** agent resolves to a dropped finding, never hanging or
   failing the whole council.
3. **Collect** — successful, non-error findings only.
4. **Debate** (`debateEngine.js`) — detect disagreement, tradeoffs, minority opinions.
5. **Synthesize** (`councilSynthesizer.js`) — one executive answer.
6. **Return** `{ question, routedAgents, routing, findings, debate, answer, confidence,
   synthesisMethod, evidence, actions, elapsedMs }`.

`askAgent(ws, id, question)` runs a single executive (for `POST /agent/:id`).

## Executive Debate (`debateEngine.js`)

Deterministic — surfaces conflict rather than hiding it:

- **Polarity** — each finding is scored `go` / `caution` / `neutral` by counting go vs
  risk signals in its stance + summary (+ any contradictions). Counting (not first
  match) means "do not proceed — security risk" reads as **caution** despite containing
  the word "proceed"; for a go/no-go call an unresolved risk dominates.
- **Conflicts** — a `go` camp vs a `caution` camp → a "Proceed vs. hold" conflict with a
  tradeoff sentence; a confidence spread ≥ 35 → a "Confidence divergence" conflict.
- **Minority opinions** — the smaller polarity camp is **preserved** when it carries real
  evidence or contradictions (never dropped).
- **Recommendation** — defers to Security when it raises a concern; otherwise follows the
  majority while flagging the minority to address in parallel.

## Executive Synthesis (`councilSynthesizer.js`)

House pattern — LLM with a deterministic fallback that always works:

- `synthesize()` builds a deterministic structured brief (agents + confidences +
  recommendations + the debate) **first**, so an answer is guaranteed.
- If `GEMINI_API_KEY` is set, it also attempts an LLM synthesis via the existing
  `BrainRouter.reason()` (Chief-of-Staff prompt over the findings + debate), guarded by
  `COUNCIL_SYNTH_TIMEOUT_MS` (default 25 s). On success it returns the LLM answer
  (`method: 'llm'`); otherwise the deterministic brief (`method: 'deterministic'`).
- Confidence is the mean of the agents' confidence scores (`confidenceAggregate.js`),
  shared with the orchestrator so both agree on one figure.

## Invariants

- One router, one debate path, one synthesis path.
- Parallelism is fault- and time-isolated; the council always returns.
- No reasoning is reimplemented — agents call the Brain.
- Recommended actions execute only through the governed Phase-14 Execution Engine.

## Validation

Covered by `scripts/validate-executive-council.js` (routing, parallelism/fault-isolation
structural checks, debate, synthesis, aggregation) — **23/23**.
