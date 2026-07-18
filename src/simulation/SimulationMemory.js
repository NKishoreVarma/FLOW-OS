/**
 * SimulationMemory — persists completed simulations to org memory so future
 * simulations (and the Operational Brain) can reuse them, and retrieves prior
 * simulations of the same type as analogues.
 */

import { saveMemory, queryMemory } from '../services/orgMemoryService.js';
import { resolveOrgId } from '../events/orgResolver.js';
import { logger } from '../utils/logger.js';

export async function save(workspaceId, simulation) {
  try {
    const orgId = await resolveOrgId(workspaceId);
    if (!orgId) return null;
    const s = simulation.scenario;
    return await saveMemory(workspaceId, orgId, 'SIMULATION', {
      title: `Simulation: ${s.label}${s.target?.name ? ` — ${s.target.name}` : ''}`,
      body: simulation.executiveSummary,
      author: 'FLOW Simulation Engine',
      source: 'simulation',
      tags: ['simulation', s.type, simulation.riskLevel].filter(Boolean),
      importance: Math.min(1, (simulation.overallRiskScore || 0) / 100),
      metadata: {
        scenarioType: s.type, targetId: s.target?.id,
        risk: simulation.overallRiskScore, confidence: simulation.confidence,
      },
    });
  } catch (err) {
    logger.rag(`[sim] memory save failed: ${err.message}`);
    return null;
  }
}

export async function findSimilar(workspaceId, scenarioType, limit = 5) {
  const rows = await queryMemory(workspaceId, 'SIMULATION', { hours: 24 * 365, limit: 50 }).catch(() => []);
  return rows.filter(r => r.metadata?.scenarioType === scenarioType).slice(0, limit);
}
