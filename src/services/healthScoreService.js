import { getRecentIncidents } from './incidentEngine.js';
import { vectorDatabase } from './vectorStoreService.js';
import { broadcastToWorkspace } from './socketService.js';
import { getConnector } from '../connectors/registry.js';
import { ActionType } from '../connectors/capabilities.js';
import { listConnectedConnectors } from '../connectors/authManager.js';

export async function calculateWorkspaceHealth(workspaceId) {
  const wsIdStr = String(workspaceId);
  const cutoffDate = new Date(Date.now() - 24 * 3600 * 1000);
  const connected = listConnectedConnectors(wsIdStr);

  // Return a "no data" response for workspaces with no ingested intelligence.
  // This prevents fabricated scores from misleading users about their workspace state.
  const wsChunks = vectorDatabase.filter(c => c.workspaceId === wsIdStr);
  const wsIncidents = getRecentIncidents(wsIdStr, 24 * 7);
  if (wsChunks.length === 0 && wsIncidents.length === 0) {
    return {
      company_health: null,
      hasData: false,
      message: 'No data yet. Connect integrations and sync to see workspace health.',
      sectors: { engineering: null, delivery: null, customer: null, workforce: null, operations: null, knowledge: null, revenue: null },
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Engineering Health (Incidents + Urgency)
  let engineering = 100;
  const recentIncidents = getRecentIncidents(wsIdStr, 24);
  recentIncidents.forEach(inc => {
    if (inc.status !== 'OPEN') return;
    let penalty = 0;
    if (inc.severity === 'CRITICAL') penalty = 15;
    else if (inc.severity === 'HIGH') penalty = 10;
    else if (inc.severity === 'MEDIUM') penalty = 5;
    engineering -= penalty;
  });

  const recentChunks = vectorDatabase.filter(chunk => {
    return chunk.workspaceId === wsIdStr && new Date(chunk.timestamp) >= cutoffDate;
  });
  recentChunks.forEach(chunk => {
    const urgency = chunk.metadata?.urgency_score || chunk.urgency_score || 0;
    if (urgency > 0.8) {
      engineering -= 2;
    }
  });
  engineering = Math.max(0, Math.min(100, engineering));

  // 2. Delivery Health (Jira Sprints & Blockers) — only when Jira is connected
  let delivery = null;
  if (connected.includes('jira')) {
    try {
      const jira = getConnector('jira');
      if (jira) {
        const issues = await jira.execute(wsIdStr, ActionType.READ, { resourceType: 'issues' });
        delivery = 100;
        const blockedCount = issues.filter(i => i.status === 'Blocked' || i.status === 'Review' && i.aiIntelligence?.riskScore > 60).length;
        delivery -= blockedCount * 15;
        delivery = Math.max(0, Math.min(100, delivery));
      }
    } catch {
      delivery = null;
    }
  }

  // 3. Customer Health (HubSpot Company Health Scores) — only when HubSpot is connected
  let customer = null;
  if (connected.includes('hubspot')) {
    try {
      const hubspot = getConnector('hubspot');
      if (hubspot) {
        const accounts = await hubspot.execute(wsIdStr, ActionType.READ, { resourceType: 'accounts' });
        if (accounts.length > 0) {
          const sum = accounts.reduce((s, a) => s + (a.healthScore || 100), 0);
          customer = Math.round(sum / accounts.length);
        } else {
          customer = 100;
        }
        customer = Math.max(0, Math.min(100, customer));
      }
    } catch {
      customer = null;
    }
  }

  // 4. Workforce Health (Workday Burnout & PTO) — only when Workday is connected
  let workforce = null;
  if (connected.includes('workday')) {
    try {
      const workday = getConnector('workday');
      if (workday) {
        const employees = await workday.execute(wsIdStr, ActionType.READ, { resourceType: 'employees' });
        workforce = 100;
        const highBurnoutCount = employees.filter(e => e.aiIntelligence?.burnoutRisk === 'HIGH').length;
        workforce -= highBurnoutCount * 15;
        workforce = Math.max(0, Math.min(100, workforce));
      }
    } catch {
      workforce = null;
    }
  }

  // 5. Operational Health (Server Incidents)
  let operations = 100;
  const activeIncidents = recentIncidents.filter(i => i.status === 'OPEN');
  operations -= activeIncidents.length * 10;
  operations = Math.max(0, Math.min(100, operations));

  // 6. Knowledge Health (Notion completeness audits) — only when Notion is connected
  let knowledge = null;
  if (connected.includes('notion')) {
    try {
      const notion = getConnector('notion');
      if (notion) {
        knowledge = 100;
        const docs = await notion.execute(wsIdStr, ActionType.READ, { resourceType: 'documents' });
        const siloedDocs = docs.filter(d => d.aiIntelligence?.risks?.length > 0).length;
        knowledge -= siloedDocs * 5;
        knowledge = Math.max(0, Math.min(100, knowledge));
      }
    } catch {
      knowledge = null;
    }
  }

  // 7. Revenue Health (HubSpot Pipeline Opportunity Close Probabilities) — only when HubSpot is connected
  let revenue = null;
  if (connected.includes('hubspot')) {
    try {
      const hubspot = getConnector('hubspot');
      if (hubspot) {
        revenue = 100;
        const opps = await hubspot.execute(wsIdStr, ActionType.READ, { resourceType: 'opportunities' });
        const highRiskDeals = opps.filter(o => o.probability < 70).length;
        revenue -= highRiskDeals * 8;
        revenue = Math.max(0, Math.min(100, revenue));
      }
    } catch {
      revenue = null;
    }
  }

  // Aggregate Company Health — only average sectors that have real data
  const knownSectors = [engineering, delivery, customer, workforce, operations, knowledge, revenue]
    .filter(v => v !== null);
  const company_health = knownSectors.length
    ? Math.round(knownSectors.reduce((a, b) => a + b, 0) / knownSectors.length)
    : null;

  const healthPayload = {
    company_health,
    hasData: true,
    sectors: {
      engineering,
      delivery,
      customer,
      workforce,
      operations,
      knowledge,
      revenue
    },
    timestamp: new Date().toISOString()
  };

  // Broadcast Event
  broadcastToWorkspace(wsIdStr, 'HEALTH_SCORE_UPDATED', healthPayload);

  return healthPayload;
}
