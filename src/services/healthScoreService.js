import { getRecentIncidents } from './incidentEngine.js';
import { vectorDatabase } from './vectorStoreService.js';
import { broadcastToWorkspace } from './socketService.js';

export function calculateWorkspaceHealth(workspaceId) {
  const wsIdStr = String(workspaceId);
  const cutoffDate = new Date(Date.now() - 24 * 3600 * 1000);

  // Baselines
  let engineering = 100;
  let product = 100;
  let operations = 100;

  // 1. Process Open Incidents
  const recentIncidents = getRecentIncidents(wsIdStr, 24);
  recentIncidents.forEach(inc => {
    if (inc.status !== 'OPEN') return;

    let penalty = 0;
    if (inc.severity === 'CRITICAL') penalty = 15;
    else if (inc.severity === 'HIGH') penalty = 10;
    else if (inc.severity === 'MEDIUM') penalty = 5;

    // Segment by affected_teams and systems
    const teams = (inc.affected_teams || []).map(t => t.toLowerCase());
    const sys = (inc.affected_systems || []).map(s => s.toLowerCase());

    let applied = false;
    if (teams.includes('engineering') || sys.includes('database')) {
      engineering -= penalty;
      applied = true;
    }
    if (teams.includes('product') || teams.includes('design')) {
      product -= penalty;
      applied = true;
    }
    if (teams.includes('operations') || teams.includes('ops') || sys.includes('infrastructure')) {
      operations -= penalty;
      applied = true;
    }
    
    // Default fallback to operations if no segment explicitly matched
    if (!applied) {
      operations -= penalty;
    }
  });

  // 2. Process High Urgency Logs
  const recentChunks = vectorDatabase.filter(chunk => {
    return chunk.workspaceId === wsIdStr && new Date(chunk.timestamp) >= cutoffDate;
  });

  recentChunks.forEach(chunk => {
    // If metadata is present in chunk directly or nested
    const urgency = chunk.metadata?.urgency_score || chunk.urgency_score || 0;
    if (urgency > 0.8) {
      const penalty = 2;
      const text = (chunk.text || '').toLowerCase();
      const channel = (chunk.source || chunk.channelName || '').toLowerCase();

      if (channel.includes('eng') || text.includes('deploy') || text.includes('code') || text.includes('db')) {
        engineering -= penalty;
      } else if (channel.includes('prod') || text.includes('release') || text.includes('feature')) {
        product -= penalty;
      } else {
        operations -= penalty;
      }
    }
  });

  // Clamp values to minimum 0
  engineering = Math.max(0, engineering);
  product = Math.max(0, product);
  operations = Math.max(0, operations);

  // Aggregate Company Health
  const company_health = Math.round((engineering + product + operations) / 3);

  const healthPayload = {
    company_health,
    sectors: {
      engineering,
      product,
      operations
    },
    timestamp: new Date().toISOString()
  };

  // Broadcast Event
  broadcastToWorkspace(wsIdStr, 'HEALTH_SCORE_UPDATED', healthPayload);

  return healthPayload;
}
