import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
dotenv.config();

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'flow-os-dev-secret-change-in-production';

async function run() {
  const args = process.argv.slice(2);
  const queryText = args[0] || 'What is the database status?';
  const workspaceId = process.env.WORKSPACE_ID || 'workspace_corp_alpha';

  // Generate valid dev JWT for authorization
  const token = jwt.sign({
    userId: 'cli-dev-user',
    email: 'cli-dev@flow-os.local',
    role: 'ADMIN',
    orgId: 'org_corp_alpha'
  }, JWT_SECRET, { expiresIn: '1h' });

  try {
    const response = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'workspace-id': workspaceId,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ queryText })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.log(`Query failed with status ${response.status}:`, errData.error || errData.details || 'Unknown error');
      process.exit(1);
    }

    const result = await response.json();
    
    // Print the exact requested visual pipeline flow
    console.log('Router Agent');
    console.log('↓');
    console.log('Retrieved Context');
    console.log('↓');
    console.log('Memory Boost');
    console.log('↓');
    console.log('Critic');
    console.log('↓');
    console.log('Executive Synthesis\n');
    
    console.log('================================================================');
    console.log('📝 EXECUTIVE SYNTHESIS BRIEF ANSWER');
    console.log('================================================================');
    console.log(result.synthesisBrief || 'No answer generated.');
    console.log('================================================================');

  } catch (err) {
    console.log('================================================================');
    console.log('⚠️  FLOW OS COGNITIVE BRAIN - OFFLINE / NOT CONFIGURED');
    console.log('================================================================');
    console.log(`Could not connect to FLOW OS server at ${BASE_URL}`);
    console.log(`Error: ${err.message}`);
    console.log('Please ensure the server is running (npm start).');
    console.log('================================================================');
  }
}

run();
