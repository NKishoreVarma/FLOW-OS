import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  try {
    const res = await fetch(`${BASE_URL}/api/dev/traces`);
    if (!res.ok) {
      console.log(`[FLOW OS CLI] Server returned status: ${res.status}`);
      process.exit(1);
    }
    const traces = await res.json();
    if (traces.length === 0) {
      console.log('----------------------------------------------------------------');
      console.log('🔍 FLOW OS PIPELINE TRACES');
      console.log('----------------------------------------------------------------');
      console.log('No ingestion traces recorded yet.');
      console.log('Run some ingestion tasks to see traces here.');
      console.log('----------------------------------------------------------------');
      return;
    }

    console.log('================================================================');
    console.log(`🔍 FLOW OS PIPELINE TRACES (${traces.length} active)`);
    console.log('================================================================\n');

    traces.forEach(trace => {
      console.log(`🔹 Trace ID:   ${trace.traceId}`);
      console.log(`   Workspace:  ${trace.workspaceId}`);
      console.log(`   Platform:   ${trace.platform} (Sender: ${trace.sender})`);
      console.log(`   Status:     ${trace.status === 'SUCCESS' ? '✅ SUCCESS' : trace.status === 'FAILED' ? '❌ FAILED' : '⏳ ' + trace.status}`);
      console.log(`   Time:       ${new Date(trace.timestamp).toLocaleString()}`);
      console.log(`   Stages:`);
      
      const stages = Object.values(trace.stages);
      if (stages.length === 0) {
        console.log(`      No stages executed yet.`);
      } else {
        stages.forEach(stage => {
          const statusChar = stage.status === 'SUCCESS' ? '✅' : stage.status === 'FAILED' ? '❌' : '⏳';
          console.log(`      ${statusChar} [${stage.stage.padEnd(20)}] - Latency: ${stage.latencyMs}ms`);
          if (stage.errors) {
            console.log(`         Error: ${stage.errors}`);
          }
        });
      }
      console.log('----------------------------------------------------------------');
    });
  } catch (err) {
    console.log('================================================================');
    console.log('⚠️  FLOW OS PIPELINE TRACES - OFFLINE / NOT CONFIGURED');
    console.log('================================================================');
    console.log(`Could not connect to FLOW OS server at ${BASE_URL}`);
    console.log(`Error: ${err.message}`);
    console.log('Please ensure the server is running (npm start).');
    console.log('================================================================');
  }
}

run();
