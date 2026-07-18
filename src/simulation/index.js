/**
 * FLOW What-If Simulation Engine — public API.
 *
 * A decision-support system: simulate hypothetical changes ("what happens if
 * Rahul resigns / payments goes down / Acme churns / release 4.2 slips") before
 * acting. Every simulation reasons over the Operational Graph (cascading impact),
 * replays historical events (evidence), reuses memory (analogues), and is
 * explained by the XAI layer. Nothing is mocked.
 */

export { simulate, compare } from './SimulationEngine.js';
export { SCENARIO_TYPES, classify, buildScenario } from './ScenarioBuilder.js';
export { findSimilar } from './SimulationMemory.js';
