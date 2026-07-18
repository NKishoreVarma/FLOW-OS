/**
 * ScenarioPlanner — decides which real analyses to run for a scenario type. It
 * does not compute anything; it produces the plan the ScenarioRunner executes
 * (graph traversals, event replays, memory lookups). This keeps each scenario
 * type's "how to reason about it" in one declarative place.
 */

// Analyses the runner knows how to execute.
//   graph:  impact | dependencies | orphans | whoKnows | neighbors
//   events: a replay mode + scope focus
//   memory: reuse historical analogues of these event types
const PLANS = {
  EMPLOYEE_DEPARTURE:  { graph: ['neighbors', 'whoKnows', 'orphans', 'dependencies'], events: { mode: 'TIMELINE', focusActor: true }, memory: true, likelihood: 0.5 },
  SERVICE_OUTAGE:      { graph: ['impact', 'dependencies', 'neighbors'],               events: { mode: 'INCIDENT' },                   memory: true, likelihood: 0.4 },
  REPOSITORY_LOSS:     { graph: ['impact', 'dependencies', 'neighbors'],               events: { mode: 'ENGINEERING' },                memory: true, likelihood: 0.2 },
  RELEASE_SLIP:        { graph: ['dependencies', 'impact', 'neighbors'],               events: { mode: 'ENGINEERING' },                memory: true, likelihood: 0.6 },
  DEPLOYMENT_POSTPONE: { graph: ['impact', 'dependencies'],                            events: { mode: 'ENGINEERING' },                memory: true, likelihood: 0.6 },
  CUSTOMER_CHURN:      { graph: ['impact', 'neighbors', 'dependencies'],               events: { mode: 'CUSTOMER_JOURNEY' },           memory: true, likelihood: 0.4 },
  PROJECT_CANCEL:      { graph: ['impact', 'dependencies', 'neighbors', 'orphans'],    events: { mode: 'TIMELINE' },                   memory: true, likelihood: 0.3 },
  INTEGRATION_OUTAGE:  { graph: ['impact', 'neighbors'],                               events: { mode: 'TIMELINE', focusConnector: true }, memory: true, likelihood: 0.3 },
  MEETING_CANCEL:      { graph: ['neighbors'],                                         events: { mode: 'MEETING' },                    memory: false, likelihood: 0.7 },
  TEAM_MERGE:          { graph: ['neighbors', 'dependencies'],                         events: { mode: 'TIMELINE' },                   memory: true, likelihood: 0.3 },
  HIRING:              { graph: [],                                                    events: { mode: 'ENGINEERING' },                memory: false, likelihood: 0.8, abstract: true },
};

export function plan(scenario) {
  const p = PLANS[scenario.type] || { graph: ['neighbors'], events: { mode: 'TIMELINE' }, memory: true, likelihood: 0.4 };
  return { ...p, graph: [...p.graph] };
}

export { PLANS };
