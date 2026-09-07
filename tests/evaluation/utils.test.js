/**
 * FLOW OS — Observability & LLM Utilities Unit Tests
 */

import assert from 'assert';
import { extractJson, repairJson, safeParse, validateSchema } from '../../src/utils/llm/jsonParser.js';
import { getBackoffDelay, CircuitBreaker } from '../../src/utils/reliability/retry.js';
import { batchInputs, calculateOverlapMetrics, countTokensEstimator } from '../../src/utils/llm/embeddingHelpers.js';
import { calculateCosineSimilarity, isDuplicateMemory } from '../../src/utils/llm/memoryHelpers.js';
import { calculateCost } from '../../src/observability/tokenCounter.js';
import { enforceSchema } from '../../src/utils/llm/schemaEnforcer.js';

console.log("\x1b[34m[Unit Test]\x1b[0m Starting LLM Utility Unit Tests...\n");

// 1. JSON Parser Tests
console.log("1. Running JSON Parser Tests...");
const rawLlmText = 'Here is the response: ```json\n{"project": "FLOW OS", "status": "active"}\n```';
const extracted = extractJson(rawLlmText);
assert.strictEqual(extracted, '{"project": "FLOW OS", "status": "active"}');

const malformedJson = '{"key": "val",';
const repaired = repairJson(malformedJson);
assert.strictEqual(repaired, '{"key": "val"}');

const parsed = safeParse(rawLlmText);
assert.strictEqual(parsed.project, "FLOW OS");

const schemaSpec = { project: 'string', status: 'string' };
const validation = validateSchema(parsed, schemaSpec);
assert.strictEqual(validation.valid, true);
console.log("   ✅ JSON Parser Tests passed.");

// 2. Retry & Reliability Tests
console.log("2. Running Reliability Tests...");
const delay1 = getBackoffDelay(0, 100, 2, false);
assert.strictEqual(delay1, 100);
const delay2 = getBackoffDelay(2, 100, 2, false);
assert.strictEqual(delay2, 400);

const cb = new CircuitBreaker({ failureThreshold: 2, cooldownPeriodMs: 50 });
let cbErrors = 0;
const failingTask = async () => { throw new Error("API Offline"); };
try { await cb.execute(failingTask); } catch (e) { cbErrors++; }
try { await cb.execute(failingTask); } catch (e) { cbErrors++; }
assert.strictEqual(cbErrors, 2);
assert.strictEqual(cb.state, 'OPEN');
console.log("   ✅ Reliability Tests passed.");

// 3. Embedding & Token Tests
console.log("3. Running Embedding Helpers Tests...");
const inputs = [1, 2, 3, 4, 5];
const batches = batchInputs(inputs, 2);
assert.strictEqual(batches.length, 3);
assert.strictEqual(batches[0].length, 2);

const { wordOverlapRatio } = calculateOverlapMetrics("critical system outage", "system stable healthy outage");
assert.ok(wordOverlapRatio > 0);

const tokenCount = countTokensEstimator("This is a simple estimation of prompt tokens.");
assert.ok(tokenCount > 0);
console.log("   ✅ Embedding Helpers Tests passed.");

// 4. Memory & Cosine Similarity Tests
console.log("4. Running Memory & Cosine Similarity Tests...");
const isDup = isDuplicateMemory("Timeline delay on auth status", "Auth status timeline delay", 0.6);
assert.strictEqual(isDup, true);

const similarity = calculateCosineSimilarity([1, 0, 0], [1, 0, 0]);
assert.strictEqual(similarity, 1.0);
console.log("   ✅ Memory Helpers Tests passed.");

// 5. Token Costing Tests
console.log("5. Running Token Costing Tests...");
const cost = calculateCost(10000, 20000, 'gemini-2.5-flash');
assert.strictEqual(cost, 0.00675); // (10000/1M * 0.075) + (20000/1M * 0.30)
console.log("   ✅ Token Costing Tests passed.");

// 6. Schema Coercion Tests
console.log("6. Running Schema Coercion Tests...");
const badInput = { age: "25", isDeveloper: "true" };
const targetSchema = {
  age: { type: 'number', default: 0 },
  isDeveloper: { type: 'boolean', default: false }
};
const enforced = enforceSchema(badInput, targetSchema);
assert.strictEqual(enforced.age, 25);
assert.strictEqual(enforced.isDeveloper, true);
console.log("   ✅ Schema Coercion Tests passed.");

console.log("\n\x1b[32m[Unit Test Result]\x1b[0m All utility unit tests passed successfully!\n");
