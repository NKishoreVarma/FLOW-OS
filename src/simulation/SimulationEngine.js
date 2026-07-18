/**
 * SimulationEngine — the What-If orchestrator. Turns "what happens if…" into an
 * evidence-backed simulation by driving the full pipeline over real data:
 *
 *   buildScenario → validate → plan → run (graph + events + memory) →
 *   estimate impact → calculate risk → plan mitigations → report → remember
 *
 * Nothing is mocked: cascading impact comes from graph traversal, evidence from
 * replayed history, analogues from memory, and the explanation from the XAI layer.
 */

import { buildScenario } from './ScenarioBuilder.js';
import { validate } from './ScenarioValidator.js';
import { plan as planScenario } from './ScenarioPlanner.js';
import { run } from './ScenarioRunner.js';
import { estimate } from './ImpactEstimator.js';
import { calculate } from './RiskCalculator.js';
import { planMitigations } from './MitigationPlanner.js';
import { report } from './SimulationReporter.js';
import { save, findSimilar } from './SimulationMemory.js';

/**
 * Run a what-if simulation.
 * @param {string} workspaceId
 * @param {{ type?, question?, targetEntityId?, targetName?, params?, change? }} input
 * @param {{ persist?: boolean }} opts
 */
export async function simulate(workspaceId, input = {}, opts = {}) {
  const started = Date.now();
  const scenario = await buildScenario(workspaceId, input);
  const validation = validate(scenario);
  if (!validation.valid) {
    return { ok: false, error: 'INVALID_SCENARIO', validation, scenario };
  }

  const plan = planScenario(scenario);
  const findings = await run(workspaceId, scenario, plan);
  const impact = estimate(scenario, findings, plan);
  const risk = calculate(impact, findings, plan);
  const mitigation = planMitigations(scenario, impact, findings);

  const priorSimilar = await findSimilar(workspaceId, scenario.type).catch(() => []);
  const result = await report(workspaceId, scenario, impact, risk, mitigation, findings, validation);
  result.priorSimulations = priorSimilar.length;
  result.elapsedMs = Date.now() - started;
  result.ok = true;

  if (opts.persist !== false) await save(workspaceId, result);
  (await import('../core/monitoring/engineMetrics.js')).record('simulation', result.elapsedMs);
  return result;
}

/** Compare two scenarios side by side. */
export async function compare(workspaceId, inputA, inputB, opts = {}) {
  const [a, b] = await Promise.all([
    simulate(workspaceId, inputA, { persist: false }),
    simulate(workspaceId, inputB, { persist: false }),
  ]);
  const delta = (a.ok && b.ok) ? {
    riskDelta: b.overallRiskScore - a.overallRiskScore,
    higherRisk: b.overallRiskScore >= a.overallRiskScore ? 'B' : 'A',
    financialDelta: (b.financialEstimate?.estimate || 0) - (a.financialEstimate?.estimate || 0),
  } : null;
  return { a, b, delta };
}
