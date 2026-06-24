/**
 * FLOW OS — End-to-End System Simulation Service
 *
 * Runs a structured suite of realistic multi-tenant data payloads through the
 * full cognitive classification pipeline (Gemini LLM → routing gate → vault/redis/drop).
 * Each payload is designed to exercise a distinct classification path.
 *
 * If the Gemini API key is unavailable, the keyword-heuristic fallback parser
 * inside cognitiveBrainService.js activates automatically — the loop never crashes.
 */

import { processIncomingIntel } from './cognitiveBrainService.js';

// ── Test payload corpus ────────────────────────────────────────────────────────
// Each entry declares its own channel context and the scope we expect the
// Cognitive Privacy Gate to assign, so the final report can flag misclassifications.
const TEST_PAYLOADS = [
  {
    label:         'PAYLOAD_A',
    expectedScope: 'OPERATIONAL_INTEL',
    channel:       'C_ENGINEERING',
    description:   'Backend architecture migration update',
    text: 'CRITICAL UPDATE: Migrated main backend user authentication loop from REST paths to the new high-performance gRPC transport layer. All schema connections must now validate via the corporate pgvector index array.'
  },
  {
    label:         'PAYLOAD_B',
    expectedScope: 'SOCIAL_COORDINATION',
    channel:       'C_GENERAL',
    description:   'Informal team event coordination message',
    text: "Hey team, don't forget we have our badminton smash practice session scheduled for 7 PM tonight at the indoor court. Grab your rackets!"
  },
  {
    label:         'PAYLOAD_C',
    expectedScope: 'PRIVATE_PERSONAL',
    channel:       'C_HR_PRIVATE',
    description:   'Sensitive PII / financial data — must trigger hard purge',
    text: 'CONFIDENTIAL NOTICE: Employee payroll data compilation for account clearance. Account Number: 4820-1192-3012. Routing transit key verified. Security code clearance standard active.'
  }
];

// ── Delay helper — avoids hammering the Gemini API on burst requests ──────────
function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Runs the full end-to-end simulation pipeline for a given workspace tenant.
 * Iterates each test payload through processIncomingIntel() and assembles
 * a structured pass/fail report.
 *
 * @param {string|number} workspaceId  - Corporate tenant key (multi-tenant isolation enforced)
 * @param {string}        channelName  - Default channel override (each payload has its own channel)
 * @returns {Promise<SimulationReport>}
 */
export async function runSystemTest(workspaceId, channelName = 'SIM_PIPELINE') {
  if (!workspaceId) {
    throw new Error('[Simulation] workspaceId is required to run the system test.');
  }

  console.log(`\n🧪 [Simulation] Starting end-to-end test suite for Workspace ${workspaceId}`);
  console.log(`   Payloads: ${TEST_PAYLOADS.length} | Channel fallback: ${channelName}`);
  console.log(`${'─'.repeat(60)}`);

  const suiteStart = Date.now();
  const results    = [];

  for (let i = 0; i < TEST_PAYLOADS.length; i++) {
    const payload = TEST_PAYLOADS[i];
    const resolvedChannel = payload.channel ?? channelName;

    console.log(`\n▶ [${i + 1}/${TEST_PAYLOADS.length}] ${payload.label} (${payload.description})`);
    console.log(`   Channel: ${resolvedChannel} | Expected: ${payload.expectedScope}`);

    const payloadStart = Date.now();
    let result;

    try {
      // ── Core pipeline call — LLM classify → route → vault / Redis / drop ──
      result = await processIncomingIntel(workspaceId, resolvedChannel, payload.text);

      const durationMs  = Date.now() - payloadStart;
      const passed      = result.scope === payload.expectedScope;

      console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'} → scope: ${result.scope} | status: ${result.status} | ${durationMs}ms`);

      results.push({
        label:         payload.label,
        description:   payload.description,
        channel:       resolvedChannel,
        expectedScope: payload.expectedScope,
        actualScope:   result.scope,
        status:        result.status,
        pass:          passed,
        durationMs
      });

    } catch (err) {
      // Isolated catch — one broken payload never aborts the remaining suite
      const durationMs = Date.now() - payloadStart;
      console.error(`   ❌ ERROR → ${err.message} (${durationMs}ms)`);

      results.push({
        label:         payload.label,
        description:   payload.description,
        channel:       resolvedChannel,
        expectedScope: payload.expectedScope,
        actualScope:   'ERROR',
        status:        'ERROR',
        pass:          false,
        error:         err.message,
        durationMs
      });
    }

    // Small inter-payload cooldown to respect Gemini API rate limits
    if (i < TEST_PAYLOADS.length - 1) await pause(400);
  }

  const totalDurationMs = Date.now() - suiteStart;
  const passed          = results.filter(r => r.pass).length;
  const failed          = results.filter(r => !r.pass).length;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🧪 [Simulation] Suite complete in ${totalDurationMs}ms`);
  console.log(`   ✅ Passed: ${passed}/${results.length}   ❌ Failed: ${failed}/${results.length}`);

  return {
    workspaceId:    String(workspaceId),
    timestamp:      new Date().toISOString(),
    totalPayloads:  results.length,
    passed,
    failed,
    totalDurationMs,
    allPassed:      failed === 0,
    results
  };
}
