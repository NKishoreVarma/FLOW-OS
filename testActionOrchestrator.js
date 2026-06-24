import { evaluateActionTriggers } from './src/services/actionOrchestrator.js';

async function testOrchestrator() {
  console.log('--- Testing Action Orchestrator ---');
  
  const mockEmitCallback = (actionPayload) => {
    console.log('\n[EMIT CALLBACK] Received ACTION_EXECUTED frame:');
    console.log(JSON.stringify(actionPayload, null, 2));
  };

  console.log('\n1. Testing Recipe 1: Incident Alert');
  await evaluateActionTriggers('workspace_corp_alpha', 'INCIDENT_CREATED', {
    incidentId: 'INC-2099',
    incidentName: 'Database Downtime',
    severity: 'CRITICAL'
  }, mockEmitCallback);

  console.log('\n2. Testing Recipe 2: Health Alignment');
  await evaluateActionTriggers('workspace_corp_alpha', 'HEALTH_SCORE_UPDATED', {
    sectors: {
      engineering: 65,
      product: 90,
      operations: 100
    }
  }, mockEmitCallback);

  console.log('\n3. Testing Recipe 3: Customer Blocker Reply (No Gmail Tokens)');
  await evaluateActionTriggers('workspace_corp_alpha', 'INTEL_STORED', {
    channelName: 'GMAIL: Urgent Issue',
    sender: 'customer@example.com',
    text: 'This is a customer interruption blocker. Please help.'
  }, mockEmitCallback);
  
}

testOrchestrator();
