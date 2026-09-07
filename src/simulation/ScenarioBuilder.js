/**
 * ScenarioBuilder — turns a "what if…" into a structured, runnable scenario.
 *
 * Primary input is structured ({ type, targetEntityId | targetName, params }); a
 * heuristic layer also classifies a natural-language question into a scenario
 * type and resolves the target to a real Operational Graph node. No LLM — the
 * front door of the engine stays deterministic and reproducible.
 */

import { searchNodes, getNode } from '../graph/index.js';
import { NodeType } from '../graph/nodeTypes.js';

// The scenario-type registry. Each type defines how a change is modelled.
export const SCENARIO_TYPES = {
  EMPLOYEE_DEPARTURE:  { label: 'Employee departure',   change: 'remove', targetType: NodeType.EMPLOYEE,   keywords: ['resign', 'quit', 'leave', 'leaves', 'departs', 'fired', 'lay off', 'laid off'] },
  SERVICE_OUTAGE:      { label: 'Service outage',        change: 'degrade', targetType: NodeType.REPOSITORY, keywords: ['goes down', 'down', 'outage', 'unavailable', 'fails', 'offline', 'crashes'] },
  RELEASE_SLIP:        { label: 'Release slip',          change: 'delay',  targetType: NodeType.PROJECT,     keywords: ['slip', 'slips', 'delayed release', 'release late', 'release slip'] },
  DEPLOYMENT_POSTPONE: { label: 'Deployment postponed',  change: 'delay',  targetType: NodeType.DEPLOYMENT,  keywords: ['postpone', 'postpones', 'delay deploy', 'hold deploy', 'push deploy'] },
  CUSTOMER_CHURN:      { label: 'Customer churn',        change: 'remove', targetType: NodeType.CUSTOMER,    keywords: ['churn', 'churns', 'cancels', 'terminates', 'leaves us'] },
  HIRING:              { label: 'Hiring',                change: 'add',    targetType: null,                 keywords: ['hire', 'hiring', 'add engineers', 'grow headcount', 'onboard'], abstract: true },
  TEAM_MERGE:          { label: 'Team merge',            change: 'merge',  targetType: NodeType.DEPARTMENT,  keywords: ['merge', 'merges', 'combine team', 'reorg', 'reorganize'] },
  INTEGRATION_OUTAGE:  { label: 'Integration outage',    change: 'degrade', targetType: NodeType.INTEGRATION, keywords: ['github unavailable', 'integration down', 'slack down', 'jira down', 'connector down', 'api unavailable'] },
  PROJECT_CANCEL:      { label: 'Project cancelled',     change: 'remove', targetType: NodeType.PROJECT,     keywords: ['cancel project', 'cancelled', 'canceled', 'scrapped', 'kill project', 'shut down project'] },
  REPOSITORY_LOSS:     { label: 'Repository loss',       change: 'remove', targetType: NodeType.REPOSITORY,  keywords: ['repo lost', 'repository deleted', 'lose the repo', 'delete repo'] },
  MEETING_CANCEL:      { label: 'Meeting cancellation',  change: 'remove', targetType: NodeType.MEETING,     keywords: ['cancel meeting', 'meeting cancelled', 'skip meeting', 'call off'] },
};

export function classify(question = '') {
  const q = question.toLowerCase();
  let best = null, bestHits = 0;
  for (const [type, def] of Object.entries(SCENARIO_TYPES)) {
    const hits = def.keywords.filter(k => q.includes(k)).length;
    if (hits > bestHits) { best = type; bestHits = hits; }
  }
  return best; // may be null if nothing matched
}

/**
 * @param {string} workspaceId
 * @param {{ type?, question?, targetEntityId?, targetName?, params? }} input
 * @returns {Promise<Object>} structured scenario
 */
export async function buildScenario(workspaceId, input = {}) {
  const type = input.type || classify(input.question || '');
  const def = type ? SCENARIO_TYPES[type] : null;

  let target = null;
  if (input.targetEntityId) {
    target = await getNode(workspaceId, input.targetEntityId).catch(() => null);
  } else if (def && !def.abstract) {
    const name = input.targetName || _extractName(input.question, def);
    if (name) target = await _resolveTarget(workspaceId, def.targetType, name);
  }

  return {
    type: type || 'UNKNOWN',
    label: def?.label || 'Unknown scenario',
    change: input.change || def?.change || 'remove',
    abstract: !!def?.abstract,
    target: target ? { id: target.id, type: target.type, name: target.name, metadata: target.metadata } : null,
    targetName: input.targetName || (target?.name) || null,
    params: input.params || {},
    question: input.question || null,
  };
}

async function _resolveTarget(workspaceId, nodeType, name) {
  // Prefer an exact-ish name match within the expected type; fall back to any type.
  const typed = await searchNodes(workspaceId, { text: name, type: nodeType, limit: 5 }).catch(() => []);
  if (typed.length) return typed[0];
  const any = await searchNodes(workspaceId, { text: name, limit: 5 }).catch(() => []);
  return any[0] || null;
}

// Very light name extraction: words after "if" up to a verb keyword, else capitalized tokens.
function _extractName(question = '', def) {
  if (!question) return null;
  const m = question.match(/if\s+([A-Za-z0-9 .'\-]+?)\s+(?:resign|quit|leav|depart|churn|cancel|goes|is|slip|postpon|down|fail|unavailable|merge)/i);
  if (m) return m[1].trim();
  const caps = question.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\b/g);
  return caps ? caps[0] : null;
}
