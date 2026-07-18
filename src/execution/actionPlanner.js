/**
 * FLOW OS — Action Planner (Phase 14)
 *
 * Turns a recommendation / intent into a normalized ExecutablePlan of one or more
 * steps. A step is the atomic unit the Execution Coordinator runs:
 *   { connector, actionType, payload, title }
 *
 * Accepts several shapes so any part of FLOW (Brain recommendation, Action Center,
 * a raw API call) can produce a plan without knowing the internal format.
 */

import { randomUUID } from 'node:crypto';

function toStep(raw = {}) {
  const connector = raw.connector || raw.connectorId || raw.provider;
  const actionType = raw.actionType || raw.action || raw.type;
  if (!connector || !actionType) return null;
  return {
    connector: String(connector).toLowerCase(),
    actionType: String(actionType),
    payload: raw.payload || raw.params || {},
    title: raw.title || raw.label || `${connector}: ${actionType}`,
  };
}

/**
 * @param {object|Array} recommendation
 *   - { steps: [...] }                      multi-step
 *   - { connector, actionType, payload }    single step
 *   - [ {...}, {...} ]                       array of steps
 * @returns {{ id, title, steps, createdAt }}
 */
export function buildPlan(recommendation = {}) {
  let rawSteps = [];
  if (Array.isArray(recommendation)) rawSteps = recommendation;
  else if (Array.isArray(recommendation.steps)) rawSteps = recommendation.steps;
  else rawSteps = [recommendation];

  const steps = rawSteps.map(toStep).filter(Boolean);
  const title = recommendation.title
    || (steps.length === 1 ? steps[0].title : `Plan (${steps.length} steps)`);

  return { id: randomUUID(), title, steps, createdAt: new Date().toISOString() };
}

export default { buildPlan };
