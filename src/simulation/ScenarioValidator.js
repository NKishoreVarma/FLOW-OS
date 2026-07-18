/**
 * ScenarioValidator — ensures a scenario is well-formed and runnable before the
 * engine spends work on it. Abstract scenarios (e.g. hiring) need no target;
 * entity-scoped ones must resolve to a real graph node.
 */

import { SCENARIO_TYPES } from './ScenarioBuilder.js';

export function validate(scenario) {
  const errors = [];
  const warnings = [];

  if (!scenario.type || scenario.type === 'UNKNOWN' || !SCENARIO_TYPES[scenario.type]) {
    errors.push(`Unrecognized scenario type: "${scenario.type}". Provide a known type or a clearer question.`);
  }

  if (!scenario.abstract && !scenario.target) {
    if (scenario.targetName) {
      warnings.push(`Could not resolve "${scenario.targetName}" to a known entity — simulation will be lower-confidence and based on scenario-type priors only.`);
    } else {
      errors.push('This scenario needs a target entity (an employee, customer, project, repository, etc.).');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
