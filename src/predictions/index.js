/**
 * FLOW Predictive Workspace Intelligence — public API.
 *
 * Moves FLOW from "what happened?" and "what would happen?" to "what is likely to
 * happen next?". Deterministic forecasts across engineering, people, customers,
 * and operations — built entirely on the Operational Graph, event/replay trends,
 * patterns, simulations, and memory. No ML, no invented scores; every prediction
 * is explainable and every probability traces to real inputs.
 */

export { predict, predictOne, getHistory, allTypes, DOMAINS, modelsByDomain } from './PredictionEngine.js';
export { MODELS } from './PredictionModels.js';
