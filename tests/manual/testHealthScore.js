import { calculateWorkspaceHealth } from './src/services/healthScoreService.js';
import { detectIncidents } from './src/services/incidentEngine.js';
import { vectorDatabase } from './src/services/vectorStoreService.js';

async function run() {
  const wsId = 'workspace_health_test';

  console.log('--- Seeding mock data ---');
  // Inject a CRITICAL engineering incident
  detectIncidents(wsId, 'PROD IS DOWN, DB crashed again!'); // affected_teams includes Engineering
  
  // Inject high-urgency operations chunks
  vectorDatabase.push({
    workspaceId: wsId,
    timestamp: new Date().toISOString(),
    urgency_score: 0.9,
    channelName: 'operations',
    text: 'Urgent Ops issue'
  });
  vectorDatabase.push({
    workspaceId: wsId,
    timestamp: new Date().toISOString(),
    urgency_score: 0.9,
    channelName: 'ops',
    text: 'Another urgent ops issue'
  });
  vectorDatabase.push({
    workspaceId: wsId,
    timestamp: new Date().toISOString(),
    urgency_score: 0.85,
    channelName: 'general',
    text: 'General fallback urgent issue goes to ops'
  });
  
  console.log('\n--- Calculating Workspace Health ---');
  const health = calculateWorkspaceHealth(wsId);
  console.log(JSON.stringify(health, null, 2));
}

run();
