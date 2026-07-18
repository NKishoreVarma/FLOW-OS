import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  try {
    const res = await fetch(`${BASE_URL}/api/dev/stats`);
    if (!res.ok) {
      console.log(`[FLOW OS CLI] Server returned status: ${res.status}`);
      process.exit(1);
    }
    const stats = await res.json();
    
    // Output the exact expected structure from the prompt
    console.log(`Chunks: ${stats.dbChunksCount || 0}`);
    console.log(`Graph Nodes: ${stats.graph?.nodesCount || 0}`);
    console.log(`Decisions: ${stats.memories?.decisionsCount || 0}`);
    console.log(`Incidents: ${stats.memories?.incidentsCount || 0}`);
    
  } catch (err) {
    console.log('================================================================');
    console.log('⚠️  FLOW OS METRICS - OFFLINE / NOT CONFIGURED');
    console.log('================================================================');
    console.log(`Could not connect to FLOW OS server at ${BASE_URL}`);
    console.log(`Error: ${err.message}`);
    console.log('Please ensure the server is running (npm start).');
    console.log('================================================================');
  }
}

run();
