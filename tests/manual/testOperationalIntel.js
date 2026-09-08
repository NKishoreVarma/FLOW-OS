import { evaluateScores } from './src/services/operationalScoringService.js';
import { detectIncidents } from './src/services/incidentEngine.js';
import { extractDecisions } from './src/services/decisionMemoryService.js';

async function run() {
  console.log('--- TEST 1: Incident Engine ---');
  const incidentText = 'PROD IS DOWN! the database crashed and we have an outage.';
  const incidentScore = evaluateScores('Alice', 'engineering', incidentText);
  console.log('Scores:', incidentScore);
  const incident = detectIncidents('workspace_test', incidentText, {});
  console.log('Detected Incident:', incident);

  console.log('\n--- TEST 2: Decision Memory Service ---');
  const decisionText = 'We decided to move to micro-vaults for better isolation. Going with this approach ASAP.';
  const decisionScore = evaluateScores('Bob', 'architecture', decisionText);
  console.log('Scores:', decisionScore);
  const decision = extractDecisions('workspace_test', decisionText, {}, 'Bob');
  console.log('Extracted Decision:', decision);

  console.log('\n--- TEST 3: Privacy Shield Trigger ---');
  const privacyText = 'Here is my social security number and password for the new system.';
  const privacyScore = evaluateScores('Charlie', 'dms', privacyText);
  console.log('Scores:', privacyScore);
  if (privacyScore.privacy_score > 0.85) {
    console.log('🚨 Privacy Shield Triggered correctly.');
  } else {
    console.log('❌ Privacy Shield Failed to trigger.');
  }
}
run();
