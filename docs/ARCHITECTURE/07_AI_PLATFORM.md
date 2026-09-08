# FLOW OS — AI Platform
**Architecture Version:** 1.0  
**Status:** FROZEN  
**Location:** `src/ai/`

---

## 0. The Contract

> **No component inside FLOW may call an LLM provider directly. Every AI request must pass through `src/ai/AIPlatform.js`. This is a permanent architectural invariant.**

Validation: `scripts/validate-ai-platform.js` asserts zero `@google/genai`, `openai`, or `@anthropic-ai/sdk` imports outside `src/ai/`. The check runs as part of the build gate.

---

## 1. Platform Overview

The AI Platform is a 9-layer request pipeline that sits between FLOW's application services and the underlying LLM providers. It provides:
- **Provider independence** — swap or add providers without touching application code
- **Guardrails** — PII detection, prompt injection protection, output validation
- **Observability** — every request traced end-to-end through all 9 layers
- **Resilience** — automatic fallback chains, rate limiting, response caching
- **Memory** — conversation history injected as context, stored after every turn
- **Tool use** — LLM function calls routed through the governed Connector Platform

### Entry Points

| Function | Use When |
|----------|----------|
| `AIPlatform.request(req)` | Standard AI call — runs all 9 layers |
| `AIPlatform.streamRequest(req)` | SSE streaming — guardrails + rate limit + memory, then streams from provider |
| `ask(req)` | Direct BrainRouter call — bypasses layers 2/3/6/7 (use only from `src/ai/` internals) |
| `embed(text)` | Embedding — bypasses all non-embedding layers |
| `stream(req)` | Provider-level stream — no platform layers |

### Public Barrel (`src/ai/index.js`)
All AI functionality is exported from a single barrel. Application code imports from `src/ai/index.js` only — never from internal AI modules directly.

---

## 2. The 9 Layers

```
AIPlatform.request(req)
    │
    ├─ Layer 6 (input)   ── Guardrails ─────── PII scan, injection detect, policy check
    │
    ├─ Layer 4 (rate)    ── Rate Limiter ────── Per-workspace × provider × tier
    │
    ├─ Layer 7 (load)    ── Memory Platform ── Load last N conversation turns
    │
    ├─ Layer 2           ── Context Platform ─ Assemble RAG + KG + health context
    │
    ├─ Layer 3           ── Prompt Platform ── Build structured messages with context
    │
    ├─ Layer 8           ── Tool Platform ──── Register tool definitions for LLM
    │
    ├─ Layers 1+4        ── Model Platform ─── Select provider → call → fallback
    │
    ├─ Layer 8 (exec)    ── Tool Execution ─── Execute tool calls via executeAction()
    │
    ├─ Layer 6 (output)  ── Guardrails ─────── Output validation, PII echo detection
    │
    ├─ Layer 7 (store)   ── Memory Platform ── Store turn (query + answer)
    │
    └─ Layer 9           ── Observability ──── Complete trace, async DB persist
```

---

## 3. Layer Detail

### Layer 1 — Reasoning Router (`src/ai/router/`)
**Files:** `routingStrategy.js`, `providerSelector.js`

Selects the optimal provider for each task type using a configurable routing strategy:

| Strategy | Behavior |
|----------|----------|
| `LATENCY_FIRST` | Pick the fastest provider based on rolling latency metrics |
| `COST_FIRST` | Pick the cheapest provider based on cost-per-token |
| `QUALITY_FIRST` | Always use the primary provider configured for the task |
| `ROUND_ROBIN` | Distribute requests evenly across available providers |
| `FALLBACK_ONLY` | Primary always, fallback only on failure |

**Task routing** (`AIConfig.taskRouting`): maps task types to preferred providers:
```javascript
// Example: heavy synthesis tasks → Gemini; fast classification → Ollama
CLASSIFICATION: 'ollama',
SUMMARIZATION:  'gemini',
REASONING:      'gemini',
CHAT:           (default provider),
```

**Fallback chains** are defined per primary provider. If a provider fails, the router walks the chain:
```
gemini → anthropic → openai → ollama
```

### Layer 2 — Context Platform (`src/ai/context/`)
**Files:** `contextAssembler.js`

Assembles multi-source context for the LLM before prompt construction:
1. **RAG context** — `retrieveContext(workspaceId, query)` → top 5 semantically relevant intel chunks from pgvector
2. **Knowledge Graph context** — `getRelatedContext(workspaceId, entityId)` → 1-hop entity neighbors
3. **Health context** — workspace health score + top domain risks
4. **Capability context** — connected connectors and their status

Context is assembled only when `skipContext !== true`. Returns a structured object injected into Layer 3.

### Layer 3 — Prompt Platform (`src/ai/prompts/`)
**Files:** `promptStore.js`, `promptBuilder.js`

**PromptStore** manages versioned prompt templates with A/B testing:
- Prompts stored in `prompt_versions` table (PostgreSQL)
- 60-second in-memory cache
- Multiple active versions with weights → weighted random selection
- `activate(name, version, { exclusive: true })` for standard deploy
- `abTest(name)` for explicit A/B comparison

**PromptBuilder** constructs the final `messages[]` array:
1. System message: FLOW persona + capability context
2. Context block: RAG evidence + KG context (if assembled)
3. Memory block: prior conversation turns
4. User message: normalized user input

**Variable interpolation:** `{{variable}}` syntax in stored prompts, replaced at render time.

### Layer 4 — Model Platform (`src/ai/model/`)
**Files:** `rateLimiter.js`, `responseCache.js`

**Rate Limiter:**
```
Tier      Default RPM    Env var
light     60             AI_RPM_LIGHT
standard  30             AI_RPM_STANDARD
heavy     10             AI_RPM_HEAVY
```
Per-workspace × provider × tier sliding window. Redis primary, in-memory `Map` fallback.

**Response Cache:**
- Redis-backed, keyed by SHA-256 of `(workspaceId, taskType, messages content)`
- Only caches deterministic tasks (`temperature ≤ 0.1`)
- Default TTL: 3600s (configurable per task type)
- Cache hits skip providers entirely; traced as `cached: true`

**Provider Abstraction (`src/ai/AIProviderFactory.js`):**
Each provider implements:
```javascript
{
  name:    string,
  chat(messages, opts):   Promise<{ text, inputTokens, outputTokens, model }>
  embed(text):            Promise<{ values, model }>
  stream(messages, opts): AsyncGenerator<delta>
  health():              Promise<{ status, latencyMs, model, error? }>
}
```

Providers: `OllamaProvider`, `GeminiProvider`, `AnthropicProvider`, `OpenAIProvider`.

### Layer 5 — Evaluation Platform (`src/ai/evaluation/`)
**Files:** `modelEval.js`

Not invoked in the hot path. Called via `/api/ai/evaluate` and `/api/ai/evaluate/ab`.

**Multi-provider evaluation:**
- Fans out the same prompt to all non-Ollama providers via `Promise.allSettled`
- `EVAL_TIMEOUT_MS` guard per provider
- Returns per-provider: `{ provider, status, text, latencyMs, costUsd, inputTokens, outputTokens }`
- Summary: `fastestProvider`, `cheapestProvider`, `avgLatencyMs`, `agreement` (Jaccard %)

**A/B prompt testing (`abTest`):**
- Runs N rounds of variant A and N rounds of variant B against one provider
- Returns per-variant averages + winner determination

**Agreement metric (`_measureAgreement`):**
- Jaccard similarity on tokenized (whitespace-split) response text
- Reports % overlap across all provider responses as consistency signal

### Layer 6 — Guardrails (`src/ai/guardrails/`)
**Files:** `piiDetector.js`, `injectionDetector.js`, `outputValidator.js`, `guardrailsEngine.js`

Runs at two points: input (before provider call) and output (before returning to caller).

**PII Detector:**
- 9 pattern types: email, phone, SSN, credit card, IP address, passport, date of birth, salary, national ID
- Severity: `high` (SSN, credit card, passport, national ID), `medium` (email, phone, IP), `low` (DOB, salary)
- `scan(text)` → `{ clean, findings, highRisk }`
- `redact(text)` → text with `[TYPE_REDACTED]` placeholders

**Injection Detector:**
- 14 direct patterns (ignore instructions, jailbreak, DAN mode, developer mode, etc.)
- Structural patterns (role-play headers, ASSISTANT: pre-fills)
- `detect(text)` → `{ safe, matches, risk: 'none'|'medium'|'high' }`

**Output Validator:**
- Forbidden phrases: "as an AI", "I don't have access", "I cannot browse the internet", etc. (7 patterns)
- PII echo detection: checks if input PII appears verbatim in output
- `validate(text, context)` → `{ valid, issues, severity: 'none'|'warn'|'block' }`
- `repair(text)` → removes forbidden phrases (best-effort)

**Guardrails Engine (orchestrator):**
- `checkInput(req)` → PII high-risk blocks; injection high-risk blocks; policy check (fails open)
- `checkOutput(text, req)` → output validate; severity `block` → returns `{ pass: false }`
- Policy check uses dynamic import of `evaluateWithPolicies` and catches all errors — governance DB downtime never blocks AI

### Layer 7 — Memory Platform (`src/ai/memory/`)
**Files:** delegates to `src/services/agents/conversationMemory.js`

Manages per-workspace conversation history:
- **Load:** retrieve last N turns before prompt construction
- **Store:** save `{ query, answer, intent, topic }` after every successful response
- Backed by Redis (`conversation:ws:*`) + PostgreSQL (`CopilotConversation`, `CopilotMessage` tables)
- Loaded via lazy dynamic import to avoid circular dependency with Redis initialization

### Layer 8 — Tool Platform (`src/ai/tools/`)
**Files:** `toolRegistry.js`, `toolExecutor.js`

**Tool Registry** — 9 registered tools:
```
search_emails          gmail          LOW    — search inbox
send_email             gmail          HIGH   — compose and send
get_upcoming_meetings  google-cal     LOW    — list calendar events
create_meeting         google-cal     MEDIUM — create calendar event
list_pull_requests     github         LOW    — list open PRs
merge_pull_request     github         HIGH   — merge a PR
search_jira_issues     jira           LOW    — search issues
search_workspace       internal       LOW    — RAG search
get_entity             internal       LOW    — KG entity lookup
```

`getToolsForLLM()` returns the OpenAI function-calling schema for the LLM system prompt.

**Tool Executor:**
- `executeTool(toolCall, executionCtx)` — routes `internal` tools directly to `retrieveContext`/`getRelatedContext`; routes connector tools through `executeAction()` (full governance + audit)
- `executeTools(toolCalls, ctx)` — batch 4 at a time via `Promise.allSettled`
- Governance is never bypassed: connector tool calls receive the same policy evaluation as direct API calls

### Layer 9 — Observability (`src/ai/observability/`)
**Files:** `requestTracer.js`

Every request is tracked by a `Trace` instance:
```javascript
Trace {
  traceId, workspaceId, taskType, userId,
  layers: Map<layerName, { startMs, endMs, meta }>,
  guardrailIssues: [],
  toolCalls: [],
  memoryOps: [],
  result: { provider, model, inputTokens, outputTokens, costUsd, cacheHit, usedFallback, status }
}
```

On completion, `trace.toJSON()` is written asynchronously to `model_requests` table (non-blocking `.catch(() => {})` — observability never fails a request). PII is redacted from error messages before storage.

In-memory ring buffer of last 200 completed traces for `/api/ai/traces`. Active traces in a `Map` for `/api/ai/traces/active`.

---

## 4. Metrics (`src/ai/health/metricsCollector.js`)

Rolling in-memory metrics per provider (60-minute window, 1-minute buckets):
- Request count, error count, cache hit count
- p50, p95, p99 latency
- Total cost (USD), input/output tokens
- Task type breakdown

Cost trend computed from `model_requests_hourly` PostgreSQL view (24-hour hourly aggregation).

API: `GET /api/ai/metrics`, `GET /api/ai/metrics/:provider`

---

## 5. Provider Configuration (`src/ai/AIConfig.js`)

```javascript
AIConfig = {
  defaultProvider:  process.env.AI_DEFAULT_PROVIDER  ?? 'gemini',
  fallbackProvider: process.env.AI_FALLBACK_PROVIDER ?? 'openai',
  routingStrategy:  process.env.AI_ROUTING_STRATEGY  ?? 'QUALITY_FIRST',
  taskRouting: {
    CLASSIFICATION: process.env.AI_TASK_CLASSIFICATION ?? 'gemini',
    EMBEDDING:      process.env.AI_TASK_EMBEDDING      ?? 'gemini',
    // ...
  }
}
```

---

## 6. Database Tables

**`prompt_versions`** — versioned prompt templates  
**`model_requests`** — per-request telemetry (async, non-blocking)  
**`model_requests_hourly`** (view) — hourly rollup for cost trend  

Migration: `scripts/migrate-orchestrator.sql`

---

## 7. API Routes (`/api/ai/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/providers` | All provider health + config |
| GET | `/api/ai/providers/:name` | Single provider health |
| POST | `/api/ai/chat` | Direct provider test (bypasses layers 2/3/6/7) |
| POST | `/api/ai/embed` | Embedding test |
| POST | `/api/ai/stream` | SSE stream test |
| GET | `/api/ai/metrics` | Rolling provider metrics |
| GET | `/api/ai/metrics/:provider` | Single-provider metrics |
| POST | `/api/ai/evaluate` | Multi-provider evaluation |
| POST | `/api/ai/evaluate/ab` | A/B prompt test |
| GET | `/api/ai/prompts` | List prompt names |
| GET | `/api/ai/prompts/:name` | List versions for a prompt |
| POST | `/api/ai/prompts/:name/render` | Render active prompt with variables |
| POST | `/api/ai/prompts/:name/versions` | Create new version |
| PATCH | `/api/ai/prompts/:name/versions/:v/activate` | Activate version |
| PATCH | `/api/ai/prompts/:name/versions/:v/deactivate` | Deactivate version |
| POST | `/api/ai/prompts/:name/rollback` | Rollback to prior version |
| POST | `/api/ai/request` | Full 9-layer platform request |
| GET | `/api/ai/traces` | Recent completed traces (last 200) |
| GET | `/api/ai/traces/active` | In-flight requests |
| GET | `/api/ai/rate-limits` | Rate limit usage for workspace |
| GET | `/api/ai/tools` | All registered tools |

---

## 8. Isolation Invariant Verification

```bash
# Run as part of CI:
node scripts/validate-ai-platform.js

# What it checks (93 assertions):
# - All 9 layer files exist
# - AIPlatform.js imports from each layer
# - No provider SDK imports outside src/ai/
# - BrainRouter integrates routing + caching + metrics
# - Guardrails block on high-risk PII and injection
# - Output validator catches forbidden phrases
# - Rate limiter enforces tier limits
# - Response cache hits return without provider call
# - Tracer records all 9 layer timings
```

---

## 9. Adding a New Provider

1. Create `src/ai/providers/MyProvider.js` implementing `{ name, chat, embed, stream, health }`
2. Register in `AIProviderFactory.js`
3. Add to fallback chain in `routingStrategy.js`
4. Add to `AIConfig.taskRouting` if task-specific routing is needed
5. Set env var `AI_DEFAULT_PROVIDER=myprovider` or use `providerHint` per request

No other files need changes. The 9-layer pipeline routes automatically.

---

## 10. Gemini-Specific Details

Gemini 2.5 Flash is the primary LLM for:
- Privacy classification
- Executive synthesis
- Rolling summaries
- Reasoning pipeline
- Briefings

`gemini-embedding-2` (768-dim) is the embedding model for pgvector storage.

**Fallback pattern** (consistent across all Gemini calls in legacy services):
```javascript
if (!process.env.GEMINI_API_KEY) { return heuristicFallback(); }
try { return await geminiCall(); } catch { return heuristicFallback(); }
```
The AI Platform handles this transparently through the provider fallback chain.
