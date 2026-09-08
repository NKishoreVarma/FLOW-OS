/**
 * Multi-Agent Cognitive Brain — public API and boot entry point.
 *
 * Call startCognitiveBrain() once at server boot.
 * It registers all 19 agents (18 specialized + Chief of Staff definition).
 *
 * To add an agent:
 *   1. Create src/brain/agents/MyAgent.js extending BaseAgent
 *   2. Call registerAgent(new MyAgent().toDefinition()) below
 *   3. Call _instances.set(id, new MyAgent()) below
 *   That's it. No pipeline or router changes needed.
 *
 * Agents NEVER call executeAction() or any connector.
 * Agents only reason. Execution flows through Planner → Runtime → Registry → Connectors.
 */

import { registerAgent, listAgents, getAgentDefinition, agentCount } from './registry/AgentRegistry.js';

// Specialized agents
import { EngineeringAgent }     from './agents/EngineeringAgent.js';
import { InfrastructureAgent }  from './agents/InfrastructureAgent.js';
import { SupportAgent }         from './agents/SupportAgent.js';
import { CustomerSuccessAgent } from './agents/CustomerSuccessAgent.js';
import { FinanceAgent }         from './agents/FinanceAgent.js';
import { HRAgent }              from './agents/HRAgent.js';
import { SecurityAgent }        from './agents/SecurityAgent.js';
import { ExecutiveAgent }       from './agents/ExecutiveAgent.js';
import { MeetingsAgent }        from './agents/MeetingsAgent.js';
import { KnowledgeAgent }       from './agents/KnowledgeAgent.js';
import { CalendarAgent }        from './agents/CalendarAgent.js';
import { EmailAgent }           from './agents/EmailAgent.js';
import { GitHubAgent }          from './agents/GitHubAgent.js';
import { JiraAgent }            from './agents/JiraAgent.js';
import { SlackAgent }           from './agents/SlackAgent.js';
import { ComplianceAgent }      from './agents/ComplianceAgent.js';
import { RiskAgent }            from './agents/RiskAgent.js';
import { AnalyticsAgent }       from './agents/AnalyticsAgent.js';

// Instance store: agentId → BaseAgent instance
const _instances = new Map();

/**
 * Boot the cognitive brain. Registers all agents and warms the registry.
 * Called once in server.js after the server starts.
 */
export function startCognitiveBrain() {
  const agents = [
    new EngineeringAgent(),
    new InfrastructureAgent(),
    new SupportAgent(),
    new CustomerSuccessAgent(),
    new FinanceAgent(),
    new HRAgent(),
    new SecurityAgent(),
    new ExecutiveAgent(),
    new MeetingsAgent(),
    new KnowledgeAgent(),
    new CalendarAgent(),
    new EmailAgent(),
    new GitHubAgent(),
    new JiraAgent(),
    new SlackAgent(),
    new ComplianceAgent(),
    new RiskAgent(),
    new AnalyticsAgent(),
  ];

  for (const agent of agents) {
    registerAgent(agent.toDefinition());
    _instances.set(agent.id, agent);
  }

  // Register Chief of Staff as a definition (for API listing) — no instance needed
  // because ChiefOfStaffAgent exports functions, not a class instance
  registerAgent({
    id:           'chief-of-staff',
    name:         'Chief of Staff',
    domain:       'orchestration',
    domains:      ['all'],
    mission:      'Orchestrate all agents, decompose intent, resolve conflicts, and synthesize the final execution recommendation.',
    capabilities: ['Intent decomposition', 'Task delegation', 'Conflict resolution', 'Final synthesis', 'Confidence scoring'],
    keywords:     [],
    connectors:   [],
  });

  console.log(`[CognitiveBrain] started — ${agentCount()} agents registered`);
}

/**
 * Resolve an agent instance by ID.
 * Returns null for chief-of-staff (no class instance — uses exported functions).
 * @param {string} agentId
 * @returns {import('./agents/BaseAgent.js').BaseAgent|null}
 */
export function resolveAgent(agentId) {
  return _instances.get(agentId) ?? null;
}

// ── Public API re-exports ─────────────────────────────────────────────────────

export { listAgents, getAgentDefinition, agentCount }            from './registry/AgentRegistry.js';
export { routeToAgents, explainRouting }                         from './router/AgentRouter.js';
export { buildConsensus }                                        from './consensus/ConsensusEngine.js';
export { assembleFinalResult }                                   from './consensus/DecisionSynthesizer.js';
export { runCognitivePipeline, runSingleAgent }                  from './pipeline/ReasoningPipeline.js';
export { createSession, getSession, listSessions, updateSession, finalizeSession } from './session/AgentSessionManager.js';
export { activeChannels }                                        from './bus/AgentCommunicationBus.js';
