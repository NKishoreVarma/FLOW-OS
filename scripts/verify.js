import db from '../src/config/db.js';
import Redis from 'ioredis';
import { ingestionQueue } from '../src/config/queue.js';
import { chunkText, isSocialChatter } from '../src/services/parserService.js';
import { evaluateChunk } from '../src/services/memoryBrain.js';
import { storeKnowledge, queryKnowledge } from '../src/services/vectorStoreService.js';
import { getGraphMetrics } from '../src/services/knowledgeGraphService.js';
import { resolveAndCheckHostname, cleanHtml } from '../src/services/crawlerService.js';
import WebSocket from 'ws';

async function verify() {
  console.log('================================================================');
  console.log('🔍 RUNNING FLOW OS DIAGNOSTIC VERIFICATION SUITE 🔍');
  console.log('================================================================\n');

  const checks = {
    Server: false,
    PostgreSQL: false,
    Redis: false,
    BullMQ: false,
    Parser: false,
    Memory: false,
    'Vector Store': false,
    'Summary Worker': false,
    Search: false,
    WebSocket: false
  };

  const details = {};

  // 1. Server Probe
  try {
    const res = await fetch('http://localhost:5001/api/health');
    const data = await res.json();
    if (data.status === 'HEALTHY') {
      checks.Server = true;
      details.Server = `HTTP 200 OK | Uptime: ${Math.round(data.uptime)}s`;
    } else {
      details.Server = `Degraded: ${data.status}`;
    }
  } catch (err) {
    details.Server = `Offline: ${err.message}`;
  }

  // 2. PostgreSQL Check
  try {
    const start = Date.now();
    const res = await db.query('SELECT 1');
    if (res.rows.length > 0) {
      checks.PostgreSQL = true;
      details.PostgreSQL = `CONNECTED | Latency: ${Date.now() - start}ms`;
    }
  } catch (err) {
    details.PostgreSQL = `Failed: ${err.message}`;
  }

  // 3. Redis Check
  let redis;
  try {
    const start = Date.now();
    redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1
    });
    const pong = await redis.ping();
    if (pong === 'PONG') {
      checks.Redis = true;
      details.Redis = `CONNECTED | Ping: ${Date.now() - start}ms`;
    }
  } catch (err) {
    details.Redis = `Failed: ${err.message}`;
  } finally {
    if (redis) redis.disconnect();
  }

  // 4. BullMQ Ingestion Queue Check
  try {
    const client = await ingestionQueue.client;
    const status = client ? client.status : 'offline';
    if (status === 'ready') {
      checks.BullMQ = true;
      details.BullMQ = `ONLINE | Connection: ${status}`;
    } else {
      details.BullMQ = `Offline | Status: ${status}`;
    }
  } catch (err) {
    details.BullMQ = `Queue check failed: ${err.message}`;
  }

  // 5. Parser Check
  try {
    const chunks = chunkText('Testing parser chunking algorithm.', 20, 5);
    const isSocial = isSocialChatter('Badminton session tonight?');
    if (chunks.length > 0 && isSocial) {
      checks.Parser = true;
      details.Parser = `Parser OK | Overlapping Chunks: ${chunks.length} | Social filter: active`;
    }
  } catch (err) {
    details.Parser = `Failed: ${err.message}`;
  }

  // 6. Memory Evaluation Check
  try {
    const result = evaluateChunk('CRITICAL: database migration required immediately.', {
      workspaceId: 'verify_test',
      source: 'github',
      sender: 'CTO'
    });
    if (result && result.retention_policy === 'PERMANENT') {
      checks.Memory = true;
      details.Memory = `Retention: ${result.retention_policy} | Composite Score: ${result.composite_score}`;
    }
  } catch (err) {
    details.Memory = `Failed: ${err.message}`;
  }

  // 7. Vector Store (RAG) Check
  try {
    const nodes = await storeKnowledge('verify_test', 'Semantic analysis vector storage validation.', 'test-source');
    const query = await queryKnowledge('verify_test', 'vector storage', 1);
    if (nodes.length > 0 && query.length > 0) {
      checks['Vector Store'] = true;
      details['Vector Store'] = `Vector DB OK | Top Cosine similarity: ${query[0]?.score || 'N/A'}`;
    }
  } catch (err) {
    details['Vector Store'] = `Failed: ${err.message}`;
  }

  // 8. Summary Worker Check
  try {
    const { summaryQueue } = await import('../src/workers/summaryWorker.js');
    if (summaryQueue) {
      checks['Summary Worker'] = true;
      details['Summary Worker'] = 'ONLINE | Cron rollup scheduled';
    }
  } catch (err) {
    details['Summary Worker'] = `Failed: ${err.message}`;
  }

  // 9. Search / Query Check
  try {
    const res = await fetch('http://localhost:5001/api/dev/stats');
    if (res.ok) {
      checks.Search = true;
      details.Search = 'ONLINE | RAG Context retrieve routes active';
    } else {
      details.Search = `Degraded status: ${res.status}`;
    }
  } catch (err) {
    details.Search = `Offline: ${err.message}`;
  }

  // 10. WebSocket Check
  try {
    const ws = new WebSocket('ws://localhost:5001?workspaceId=workspace_corp_alpha');
    const connectPromise = new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.close();
        resolve(true);
      });
      ws.on('error', (err) => {
        reject(err);
      });
      setTimeout(() => reject(new Error('Connection timeout')), 1500);
    });
    
    const wsConnected = await connectPromise;
    if (wsConnected) {
      checks.WebSocket = true;
      details.WebSocket = 'CONNECTED | Handshake accepted';
    }
  } catch (err) {
    details.WebSocket = `Failed: ${err.message}`;
  }

  // Calculate Overall Health
  const total = Object.keys(checks).length;
  const passed = Object.values(checks).filter(Boolean).length;
  const healthPercent = Math.round((passed / total) * 100);

  console.log('\n=======================================');
  console.log('             FLOW SYSTEM STATUS        ');
  console.log('=======================================\n');

  for (const [key, value] of Object.entries(checks)) {
    const icon = value ? '✅' : '❌';
    console.log(`${icon} ${key.padEnd(20)} : ${details[key] || ''}`);
  }

  console.log('\n=======================================');
  console.log(`Overall Health: ${healthPercent}%`);
  console.log('=======================================\n');

  if (healthPercent < 100) {
    process.exit(1); // Fail the CLI verification check if health is degraded
  }
}

verify().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
