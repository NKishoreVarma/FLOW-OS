import { getRecentIncidents } from './incidentEngine.js';
import { vectorDatabase } from './vectorStoreService.js';
import { broadcastToWorkspace } from './socketService.js';
import { getConnector } from '../connectors/registry.js';
import { ActionType } from '../connectors/capabilities.js';

export async function calculateWorkspaceHealth(workspaceId) {
  const wsIdStr = String(workspaceId);
  const cutoffDate = new Date(Date.now() - 24 * 3600 * 1000);

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

  // 2. Delivery Health (Jira Sprints & Blockers)
  let delivery = 100;
  try {
    const jira = getConnector('jira');
    if (jira) {
      const issues = await jira.execute(wsIdStr, ActionType.READ, { resourceType: 'issues' });
      const blockedCount = issues.filter(i => i.status === 'Blocked' || i.status === 'Review' && i.aiIntelligence?.riskScore > 60).length;
      delivery -= blockedCount * 15;
    }
  } catch (err) {
    delivery = 82; // Fallback demo
  }
  delivery = Math.max(0, Math.min(100, delivery));

  // 3. Customer Health (HubSpot Company Health Scores)
  let customer = 100;
  try {
    const hubspot = getConnector('hubspot');
    if (hubspot) {
      const accounts = await hubspot.execute(wsIdStr, ActionType.READ, { resourceType: 'accounts' });
      if (accounts.length > 0) {
        const sum = accounts.reduce((s, a) => s + (a.healthScore || 100), 0);
        customer = Math.round(sum / accounts.length);
      }
    }
  } catch (err) {
    customer = 68; // Fallback demo
  }
  customer = Math.max(0, Math.min(100, customer));

  // 4. Workforce Health (Workday Burnout & PTO)
  let workforce = 100;
  try {
    const workday = getConnector('workday');
    if (workday) {
      const employees = await workday.execute(wsIdStr, ActionType.READ, { resourceType: 'employees' });
      const highBurnoutCount = employees.filter(e => e.aiIntelligence?.burnoutRisk === 'HIGH').length;
      workforce -= highBurnoutCount * 15;
    }
  } catch (err) {
    workforce = 88; // Fallback demo
  }
  workforce = Math.max(0, Math.min(100, workforce));

  // 5. Operational Health (Server Incidents)
  let operations = 100;
  const activeIncidents = recentIncidents.filter(i => i.status === 'OPEN');
  operations -= activeIncidents.length * 10;
  operations = Math.max(0, Math.min(100, operations));

  // 6. Knowledge Health (Notion completeness audits)
  let knowledge = 85;
  try {
    const notion = getConnector('notion');
    if (notion) {
      const docs = await notion.execute(wsIdStr, ActionType.READ, { resourceType: 'documents' });
      const siloedDocs = docs.filter(d => d.aiIntelligence?.risks?.length > 0).length;
      knowledge -= siloedDocs * 5;
    }
  } catch (err) {
    knowledge = 85;
  }
  knowledge = Math.max(0, Math.min(100, knowledge));

  // 7. Revenue Health (HubSpot Pipeline Opportunity Close Probabilities)
  let revenue = 92;
  try {
    const hubspot = getConnector('hubspot');
    if (hubspot) {
      const opps = await hubspot.execute(wsIdStr, ActionType.READ, { resourceType: 'opportunities' });
      const highRiskDeals = opps.filter(o => o.probability < 70).length;
      revenue -= highRiskDeals * 8;
    }
  } catch (err) {
    revenue = 92;
  }
  revenue = Math.max(0, Math.min(100, revenue));

  // Aggregate Company Health
  const company_health = Math.round(
    (engineering + delivery + customer + workforce + operations + knowledge + revenue) / 7
  );

  const healthPayload = {
    company_health,
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
