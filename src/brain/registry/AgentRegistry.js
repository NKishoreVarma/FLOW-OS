/**
 * AgentRegistry — singleton store for all cognitive agent definitions.
 *
 * Agents are registered at boot (brain/index.js). Routes and the reasoning
 * pipeline resolve agents only through this registry — never with direct imports.
 *
 * Definition shape:
 * {
 *   id:           string,          — unique kebab-case id
 *   name:         string,          — human-readable name
 *   domain:       string,          — primary domain (engineering|customers|finance|...)
 *   domains:      string[],        — additional domains this agent covers
 *   mission:      string,          — one sentence mission statement
 *   capabilities: string[],        — what this agent can reason about
 *   keywords:     string[],        — routing keywords (matched against intent)
 *   connectors:   string[],        — connector IDs with relevant data
 *   role:         string,          — RBAC role for authorization checks
 * }
 */

const _agents = new Map(); // id → AgentEntry

/**
 * Register an agent definition. Called at boot for all 19 agents.
 * @param {object} definition
 */
export function registerAgent(definition) {
  if (!definition.id)     throw new Error(`Agent definition missing required field: id`);
  if (!definition.domain) throw new Error(`Agent '${definition.id}' missing required field: domain`);
  if (!definition.mission) throw new Error(`Agent '${definition.id}' missing required field: mission`);
  _agents.set(definition.id, { definition });
}

/**
 * Get an agent definition by id. Returns null if not registered.
 * @param {string} id
 * @returns {object|null}
 */
export function getAgentDefinition(id) {
  return _agents.get(id)?.definition ?? null;
}

/**
 * List all registered agent definitions.
 * @returns {object[]}
 */
export function listAgents() {
  return Array.from(_agents.values()).map(e => e.definition);
}

/**
 * List agents whose primary or secondary domain matches.
 * @param {string} domain
 * @returns {object[]}
 */
export function getAgentsByDomain(domain) {
  return listAgents().filter(a =>
    a.domain === domain || (a.domains || []).includes(domain)
  );
}

/**
 * List agents that cover a given capability string.
 * @param {string} capability
 * @returns {object[]}
 */
export function getAgentsByCapability(capability) {
  return listAgents().filter(a =>
    (a.capabilities || []).some(c => c.toLowerCase().includes(capability.toLowerCase()))
  );
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function hasAgent(id) {
  return _agents.has(id);
}

/**
 * Returns the total number of registered agents.
 * @returns {number}
 */
export function agentCount() {
  return _agents.size;
}

/** Remove all registrations — used in tests only. */
export function clearRegistry() {
  _agents.clear();
}
