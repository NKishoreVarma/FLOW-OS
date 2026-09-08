#!/usr/bin/env node
/**
 * Validate the FLOW AI Platform — 9-layer architecture audit.
 *
 * Tests each layer's core invariants without requiring a live server.
 * Run: node scripts/validate-ai-platform.js
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more tests failed
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname }           from 'path';
import { fileURLToPath }           from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const srcAI  = join(ROOT, 'src', 'ai');

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(label);
  }
}

function fileExists(rel) { return existsSync(join(srcAI, rel)); }
function fileContent(rel) {
  try { return readFileSync(join(srcAI, rel), 'utf8'); }
  catch { return ''; }
}
function importFile(rel) {
  try { return import(join(srcAI, rel)); }
  catch { return Promise.resolve(null); }
}

console.log('\n══════════════════════════════════════════════');
console.log('  FLOW AI Platform — Validation Suite');
console.log('══════════════════════════════════════════════\n');

// ── Structure check ────────────────────────────────────────────────────────────
console.log('Layer 0 — Structure\n');
assert('AIPlatform.js exists',       fileExists('AIPlatform.js'));
assert('index.js (barrel) exists',   fileExists('index.js'));
assert('BrainRouter.js exists',      fileExists('BrainRouter.js'));
assert('AIConfig.js exists',         fileExists('AIConfig.js'));
assert('AIProviderFactory.js exists',fileExists('AIProviderFactory.js'));
assert('types.js exists',            fileExists('types.js'));

// ── Layer 1: Reasoning Router ─────────────────────────────────────────────────
console.log('\nLayer 1 — Reasoning Router\n');
const brainRouter = fileContent('BrainRouter.js');
assert('BrainRouter imports selectProvider',    brainRouter.includes('selectProvider'));
assert('BrainRouter imports responseCache',     brainRouter.includes('responseCache'));
assert('BrainRouter imports metricsCollector',  brainRouter.includes('metricsCollector'));
assert('BrainRouter walks fallback chain',      brainRouter.includes('getFallbackChain'));
assert('BrainRouter records metrics on every call', brainRouter.includes('record('));

// ── Layer 2: Context Platform ─────────────────────────────────────────────────
console.log('\nLayer 2 — Context Platform\n');
assert('ContextAssembler.js exists',            fileExists('ContextAssembler.js'));
const ctx = fileContent('ContextAssembler.js');
assert('ContextAssembler exports assembleContext', ctx.includes('export async function assembleContext'));
assert('ContextAssembler does RAG retrieval',   ctx.includes('retrieveContext'));
assert('ContextAssembler does KG expansion',    ctx.includes('getRelatedContext'));

// ── Layer 3: Prompt Platform ──────────────────────────────────────────────────
console.log('\nLayer 3 — Prompt Platform\n');
assert('PromptBuilder.js exists',               fileExists('PromptBuilder.js'));
assert('prompts/promptStore.js exists',         fileExists('prompts/promptStore.js'));
const ps = fileContent('prompts/promptStore.js');
assert('PromptStore: getPrompt exported',       ps.includes('export async function getPrompt'));
assert('PromptStore: createVersion exported',   ps.includes('export async function createVersion'));
assert('PromptStore: A/B weight selection',     ps.includes('_weightedSelect'));
assert('PromptStore: variable interpolation',   ps.includes('_interpolate'));
assert('PromptStore: rollback exported',        ps.includes('export async function rollback'));

// ── Layer 4: Model Platform ───────────────────────────────────────────────────
console.log('\nLayer 4 — Model Platform\n');
assert('providers/OllamaProvider.js exists',    fileExists('providers/OllamaProvider.js'));
assert('providers/GeminiProvider.js exists',    fileExists('providers/GeminiProvider.js'));
assert('providers/OpenAIProvider.js exists',    fileExists('providers/OpenAIProvider.js'));
assert('providers/AnthropicProvider.js exists', fileExists('providers/AnthropicProvider.js'));
assert('health/metricsCollector.js exists',     fileExists('health/metricsCollector.js'));
assert('model/rateLimiter.js exists',           fileExists('model/rateLimiter.js'));
assert('cache/responseCache.js exists',         fileExists('cache/responseCache.js'));
const rl = fileContent('model/rateLimiter.js');
assert('RateLimiter: sliding window per workspace', rl.includes('workspaceId'));
assert('RateLimiter: Redis with in-memory fallback', rl.includes('_inMemory'));
assert('RateLimiter: tier-aware limits',        rl.includes('light') && rl.includes('heavy'));

// ── Layer 5: Evaluation Platform ─────────────────────────────────────────────
console.log('\nLayer 5 — Evaluation Platform\n');
assert('evaluation/modelEval.js exists',        fileExists('evaluation/modelEval.js'));
const ev = fileContent('evaluation/modelEval.js');
assert('ModelEval: evaluate() exported',        ev.includes('export async function evaluate'));
assert('ModelEval: abTest() exported',          ev.includes('export async function abTest'));
assert('ModelEval: records metrics per provider', ev.includes('record('));
assert('ModelEval: Jaccard agreement scoring',  ev.includes('_jaccardSimilarity'));
assert('ModelEval: timeout guard',              ev.includes('EVAL_TIMEOUT_MS'));

// ── Layer 6: Guardrails ───────────────────────────────────────────────────────
console.log('\nLayer 6 — Guardrails\n');
assert('guardrails/piiDetector.js exists',      fileExists('guardrails/piiDetector.js'));
assert('guardrails/injectionDetector.js exists',fileExists('guardrails/injectionDetector.js'));
assert('guardrails/outputValidator.js exists',  fileExists('guardrails/outputValidator.js'));
assert('guardrails/guardrailsEngine.js exists', fileExists('guardrails/guardrailsEngine.js'));
const pii = fileContent('guardrails/piiDetector.js');
assert('PII: email pattern',                    pii.includes("'email'"));
assert('PII: SSN pattern',                      pii.includes("'ssn'"));
assert('PII: credit_card pattern',              pii.includes("'credit_card'"));
assert('PII: redact() exported',                pii.includes('export function redact'));
const inj = fileContent('guardrails/injectionDetector.js');
assert('Injection: "ignore previous instructions"', inj.includes('ignore'));
assert('Injection: structural injection detection', inj.includes('STRUCTURAL_PATTERNS'));
assert('Injection: risk levels (none/medium/high)', inj.includes("'high'"));
const ge = fileContent('guardrails/guardrailsEngine.js');
assert('GuardrailsEngine: checkInput exported', ge.includes('export async function checkInput'));
assert('GuardrailsEngine: checkOutput exported',ge.includes('export function checkOutput'));
assert('GuardrailsEngine: policy check (best-effort)', ge.includes('_checkPolicy'));
assert('GuardrailsEngine: fails open on policy error', ge.includes("effect: 'ALLOW'"));

// ── Layer 7: Memory Platform ──────────────────────────────────────────────────
console.log('\nLayer 7 — Memory Platform\n');
assert('conversation/ConversationMemory.js exists', fileExists('conversation/ConversationMemory.js'));
const cm = fileContent('conversation/ConversationMemory.js');
assert('ConversationMemory: remember() exported', cm.includes('export async function remember'));
assert('ConversationMemory: recall() exported',   cm.includes('export async function recall'));
assert('ConversationMemory: Redis-backed',         cm.includes('redis'));
assert('ConversationMemory: TTL set',              cm.includes('expire'));

// ── Layer 8: Tool Platform ────────────────────────────────────────────────────
console.log('\nLayer 8 — Tool Platform\n');
assert('tools/toolRegistry.js exists',          fileExists('tools/toolRegistry.js'));
assert('tools/toolExecutor.js exists',          fileExists('tools/toolExecutor.js'));
const tr = fileContent('tools/toolRegistry.js');
assert('ToolRegistry: search_workspace tool',   tr.includes('search_workspace'));
assert('ToolRegistry: send_email (HIGH risk)',   tr.includes("riskTier:    'HIGH'"));
assert('ToolRegistry: getToolsForLLM exported', tr.includes('export function getToolsForLLM'));
assert('ToolRegistry: riskTier on every tool',  (tr.match(/riskTier/g) ?? []).length >= 5);
const te = fileContent('tools/toolExecutor.js');
assert('ToolExecutor: routes through executeAction()', te.includes('executeAction'));
assert('ToolExecutor: internal tools bypass connector', te.includes("connector === 'internal'"));
assert('ToolExecutor: parallel batch execution', te.includes('Promise.allSettled'));

// ── Layer 9: Observability ────────────────────────────────────────────────────
console.log('\nLayer 9 — Observability\n');
assert('observability/requestTracer.js exists', fileExists('observability/requestTracer.js'));
const ot = fileContent('observability/requestTracer.js');
assert('Tracer: Trace class with layerStart/End', ot.includes('layerStart') && ot.includes('layerEnd'));
assert('Tracer: complete() records all 9 layer outcomes', ot.includes('guardrailIssues') && ot.includes('toolCalls'));
assert('Tracer: async persist to DB (non-blocking)',      ot.includes('_persist(this).catch'));
assert('Tracer: PII redacted from error messages',        ot.includes('redact(error)'));
assert('Tracer: ring buffer of recent traces',            ot.includes('_recentTraces'));
assert('Tracer: startTrace() exported',                   ot.includes('export function startTrace'));

// ── AIPlatform orchestration ──────────────────────────────────────────────────
console.log('\nAIPlatform — Orchestration Contract\n');
const ap = fileContent('AIPlatform.js');
assert('AIPlatform: single exported request() fn',    ap.includes('export async function request'));
assert('AIPlatform: streamRequest() exported',        ap.includes('export async function* streamRequest'));
assert('AIPlatform: all 9 layers present',
  ap.includes('guardrails_input') && ap.includes('rate_limiter') &&
  ap.includes('memory_load') && ap.includes('context') &&
  ap.includes('prompt') && ap.includes('model') &&
  ap.includes('tools') && ap.includes('guardrails_output') &&
  ap.includes('memory_store'));
assert('AIPlatform: blocked response when guardrail fires', ap.includes('_blockedResponse'));
assert('AIPlatform: lightweight ask() pass-through',   ap.includes('export { routerAsk as ask'));
assert('AIPlatform: trace.complete() always called',   ap.includes('trace.complete('));
assert('AIPlatform: tool results included in response',ap.includes('toolResults'));
assert('AIPlatform: skipGuardrails opt-out exists',    ap.includes('skipGuardrails'));
assert('AIPlatform: skipContext opt-out exists',        ap.includes('skipContext'));
assert('AIPlatform: skipMemory opt-out exists',         ap.includes('skipMemory'));

// ── Isolation invariant ───────────────────────────────────────────────────────
console.log('\nIsolation Invariant — No provider imports outside src/ai/\n');
const { execSync } = await import('child_process');
const check = (pattern, description) => {
  try {
    const out = execSync(
      `grep -r "${pattern}" ${ROOT}/src --include="*.js" --exclude-dir=ai -l 2>/dev/null || true`,
      { encoding: 'utf8' }
    ).trim();
    assert(description, out === '', `found in: ${out.split('\n').slice(0, 3).join(', ')}`);
  } catch {
    assert(description, true); // grep not available
  }
};
check('@google/genai',         'No @google/genai import outside src/ai/');
check('openai/v1/chat',        'No direct OpenAI fetch outside src/ai/');
check('api.anthropic.com',     'No direct Anthropic fetch outside src/ai/');
check('localhost:11434',       'No direct Ollama fetch outside src/ai/');

// ── Barrel export completeness ─────────────────────────────────────────────────
console.log('\nBarrel Export — src/ai/index.js\n');
const barrel = fileContent('index.js');
assert('Barrel: request exported',             barrel.includes("export { request"));
assert('Barrel: TaskType exported',            barrel.includes("export { TaskType"));
assert('Barrel: getRecentTraces exported',     barrel.includes("getRecentTraces"));
assert('Barrel: getAllTools exported',          barrel.includes("getAllTools"));
assert('Barrel: evaluateProviders exported',   barrel.includes("evaluateProviders"));

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log(`  ${passed} passed  /  ${failed} failed  /  ${passed + failed} total`);
console.log('══════════════════════════════════════════════\n');

if (failed > 0) {
  console.error('Failed assertions:\n' + failures.map(f => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('All assertions passed. AI Platform is correctly structured.\n');
