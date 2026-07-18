/**
 * FLOW OS — Execution Planner (Phase 14)
 *
 * Dry-run of an ExecutablePlan BEFORE anything executes: classifies each step's
 * risk, resolves its approval gate, and checks the connector exists, supports the
 * action, and has credentials. Returns a preview the UI shows the user (and the
 * Coordinator trusts) so nothing side-effectful happens during planning.
 */

import { getConnector } from '../connectors/registry.js';
import { hasCredentials } from '../connectors/authManager.js';
import { classifyAction, maxRisk, RiskLevel } from './riskClassifier.js';
import { decideGate } from './approvalEngine.js';

export function dryRun(workspaceId, plan, opts = {}) {
  let planRisk = RiskLevel.LOW;

  const steps = (plan.steps || []).map((step) => {
    const { level, reasons } = classifyAction(step, opts);
    const gate = decideGate(level);
    planRisk = maxRisk(planRisk, level);

    let supported = false;
    let credentials = false;
    let connectorError = null;
    try {
      const adapter = getConnector(step.connector);
      supported = adapter.supports(step.actionType);
      credentials = hasCredentials(workspaceId, step.connector);
    } catch (err) {
      connectorError = err.message;
    }

    return {
      ...step,
      risk: level,
      riskReasons: reasons,
      gate: gate.gate,
      requiredApprovals: gate.requiredApprovals,
      supported,
      hasCredentials: credentials,
      connectorError,
      ok: supported && !connectorError,
    };
  });

  return {
    planId: plan.id,
    title: plan.title,
    planRisk,
    executable: steps.every((s) => s.ok),
    steps,
  };
}

export default { dryRun };
