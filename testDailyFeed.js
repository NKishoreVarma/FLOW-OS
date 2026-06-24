import { detectIncidents } from './src/services/incidentEngine.js';
import { extractDecisions } from './src/services/decisionMemoryService.js';
import { generateDailyFeed } from './src/services/dailyIntelligenceService.js';

async function run() {
  const wsId = 'workspace_test';

  console.log('--- Seeding mock data ---');
  detectIncidents(wsId, 'PROD IS DOWN, DB crashed again!');
  extractDecisions(wsId, 'We decided to shift to micro-services next quarter.', {}, 'Alice');

  console.log('\n--- Generating Daily Feed ---');
  const feed = generateDailyFeed(wsId);
  
  console.log('\n--- Output Markdown ---');
  console.log(feed);
}
run();
