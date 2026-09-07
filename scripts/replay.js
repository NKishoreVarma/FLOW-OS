import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  const args = process.argv.slice(2);
  const targetId = args[0]; // Optional specific trace ID

  try {
    // Fetch ingestion traces
    const ingestRes = await fetch(`${BASE_URL}/api/dev/traces`);
    const queryRes = await fetch(`${BASE_URL}/api/dev/query-traces`);

    if (!ingestRes.ok || !queryRes.ok) {
      console.log(`[FLOW OS CLI] Server returned error fetching traces`);
      process.exit(1);
    }

    const ingestTraces = await ingestRes.json();
    const queryTraces = await queryRes.json();

    // Find the requested trace or the latest one
    let selectedTrace = null;
    let traceType = '';

    if (targetId) {
      selectedTrace = ingestTraces.find(t => t.traceId === targetId);
      if (selectedTrace) {
        traceType = 'Ingestion';
      } else {
        selectedTrace = queryTraces.find(t => t.queryTraceId === targetId);
        if (selectedTrace) {
          traceType = 'RAG Query';
        }
      }
    } else {
      // Find the absolute latest trace by timestamp
      const allTraces = [
        ...ingestTraces.map(t => ({ ...t, _type: 'Ingestion', _time: new Date(t.timestamp).getTime(), _id: t.traceId })),
        ...queryTraces.map(t => ({ ...t, _type: 'RAG Query', _time: new Date(t.timestamp).getTime(), _id: t.queryTraceId }))
      ];

      allTraces.sort((a, b) => b._time - a._time);

      if (allTraces.length > 0) {
        selectedTrace = allTraces[0];
        traceType = selectedTrace._type;
      }
    }

    if (!selectedTrace) {
      console.log('No traces available.');
      return;
    }

    const id = selectedTrace.traceId || selectedTrace.queryTraceId;

    console.log('================================================================');
    console.log(`🔁 FLOW OS CHROMEDEVTOOLS TRACE REPLAY`);
    console.log('================================================================');
    console.log(`ID        : ${id}`);
    console.log(`Type      : ${traceType}`);
    console.log(`Status    : ${selectedTrace.status === 'SUCCESS' ? '✅ SUCCESS' : selectedTrace.status === 'FAILED' ? '❌ FAILED' : '⏳ ' + selectedTrace.status}`);
    console.log(`Timestamp : ${new Date(selectedTrace.timestamp).toLocaleString()}`);
    console.log('================================================================\n');

    const stages = Object.entries(selectedTrace.stages || {});
    if (stages.length === 0) {
      console.log('No stage details recorded for this trace.');
    } else {
      stages.forEach(([stageName, stage], index) => {
        const icon = stage.status === 'SUCCESS' ? '✅' : stage.status === 'FAILED' ? '❌' : '⏳';
        console.log(`[${index + 1}] ${icon} Stage: ${stageName} (${stage.latencyMs || 0}ms)`);
        
        // Print Inputs
        if (stage.input !== undefined && stage.input !== null) {
          console.log(`    ├── Input:`);
          const formattedInput = typeof stage.input === 'object' 
            ? JSON.stringify(stage.input, null, 2) 
            : String(stage.input);
          
          formattedInput.split('\n').forEach(line => {
            console.log(`    │   ${line}`);
          });
        }
        
        // Print Outputs
        if (stage.output !== undefined && stage.output !== null) {
          console.log(`    ├── Output:`);
          const formattedOutput = typeof stage.output === 'object' 
            ? JSON.stringify(stage.output, null, 2) 
            : String(stage.output);
          
          formattedOutput.split('\n').forEach(line => {
            console.log(`    │   ${line}`);
          });
        }

        // Print Errors
        if (stage.errors) {
          console.log(`    └── 🚨 Errors:`);
          const formattedErrors = typeof stage.errors === 'object' 
            ? JSON.stringify(stage.errors, null, 2) 
            : String(stage.errors);
          
          formattedErrors.split('\n').forEach(line => {
            console.log(`    │   ${line}`);
          });
        } else {
          console.log(`    └── Done.`);
        }
        console.log('');
      });
    }
    console.log('================================================================');

  } catch (err) {
    console.log('================================================================');
    console.log('⚠️  FLOW OS TRACE REPLAY - OFFLINE / NOT CONFIGURED');
    console.log('================================================================');
    console.log(`Could not connect to FLOW OS server at ${BASE_URL}`);
    console.log(`Error: ${err.message}`);
    console.log('Please ensure the server is running (npm start).');
    console.log('================================================================');
  }
}

run();
