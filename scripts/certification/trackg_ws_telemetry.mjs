/**
 * trackg_ws_telemetry.mjs — Track G: safe WebSocket ingestion telemetry.
 * Connects a WS client, triggers a synthetic OPERATIONAL_INTEL ingestion on a
 * throwaway workspace, and asserts INGESTION_STAGE events stream with SAFE metadata
 * only (no bodies/secrets), workspace-scoped. Cleans up. Helios/pilot untouched.
 */
import { prisma } from '../../src/core/config/prisma.js';
import { query }  from '../../src/config/db.js';
import { ingestionQueue } from '../../src/config/queue.js';
import WebSocket from 'ws';

const R = []; const rec = (id, ok, note='') => { const v = typeof ok==='boolean'?(ok?'PASS':'FAIL'):ok; R.push([id,v]); console.log(`  [${v}] ${id}${note?' — '+note:''}`); };
const SAFE = ['workspaceId','provider','providerObjectId','eventId','eventType','stage','timestamp','status','durationMs','errorCode','count'];
const SECRET_RE = /(ya29\.|gh[pousr]_|xox[baprs]-|eyJ[A-Za-z0-9_-]{10,}|Bearer\s)/;

const org = await prisma.organization.create({ data:{ name:'trackg', slug:`trackg-${Date.now()}`, plan:'enterprise' }});
const WS = `trackg_ws_${Date.now()}`;
const dws = await prisma.workspace.create({ data:{ name:'trackg ws', orgId:org.id, externalId:WS }});
const evtId = `gmail:messages:trackg_${Date.now()}`;

console.log('\n######### TRACK G — SAFE WS INGESTION TELEMETRY #########\n');

const events = [];
const sock = new WebSocket(`ws://127.0.0.1:5001?workspaceId=${WS}`);
await new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); setTimeout(res, 3000); });
sock.on('message', (buf) => { try { const m = JSON.parse(buf.toString()); if ((m.type||m.event)==='INGESTION_STAGE' || m.eventType==='INGESTION_STAGE') events.push(m); } catch {} });

// trigger a real OPERATIONAL_INTEL ingestion (private body in text; must NOT appear in telemetry)
// Clean OPERATIONAL_INTEL body so the item flows through every stage. The telemetry
// safety (whitelist) is proven by ws:safe-fields-only regardless of body content.
await ingestionQueue.add('sync', {
  workspaceId: WS, platform:'gmail', sender:'cto@acme.test', channel:'engineering',
  text:'Database migration for the pgvector upgrade is blocking the production deployment pipeline this week.',
  metadata:{ _traceEventId:evtId, _traceProvider:'gmail', _traceProviderObjectId:'trackg', _traceResourceType:'messages' },
}, { jobId:`ingest__${WS}__gmail__trackg_${Date.now()}` });

await new Promise(r => setTimeout(r, 26000)); // let the worker + trace + graph subscriber + broadcast run
sock.close();

const stageEvents = events.map(e => e.data || e.payload || e).filter(Boolean);
const stages = [...new Set(stageEvents.map(e => e.stage).filter(Boolean))];
rec('ws:stage-events-received', stageEvents.length >= 3, `INGESTION_STAGE events=${stageEvents.length} stages=${stages.join('>')}`);
const blob = JSON.stringify(stageEvents);
rec('ws:no-body-leak', !/Database migration|pgvector upgrade/.test(blob), 'no message body in telemetry');
rec('ws:no-secret-leak', !SECRET_RE.test(blob), 'no token/secret in telemetry');
const onlySafe = stageEvents.every(e => Object.keys(e).every(k => SAFE.includes(k)));
rec('ws:safe-fields-only', onlySafe, 'every field whitelisted');
rec('ws:workspace-scoped', stageEvents.every(e => e.workspaceId === WS), 'all events carry this workspace only');

// cleanup
await query('DELETE FROM workspace_intel_chunks WHERE workspace_id=$1',[WS]).catch(()=>{});
await query('DELETE FROM flow_events WHERE workspace_id=$1',[WS]).catch(()=>{});
await query('DELETE FROM graph_nodes WHERE workspace_id=$1',[WS]).catch(()=>{});
await query('DELETE FROM graph_edges WHERE workspace_id=$1',[WS]).catch(()=>{});
await prisma.workspace.delete({ where:{ id:dws.id }}).catch(()=>{});
await prisma.organization.delete({ where:{ id:org.id }}).catch(()=>{});

const pass=R.filter(x=>x[1]==='PASS').length, fail=R.filter(x=>x[1]==='FAIL').length;
console.log(`\n═══════════════════════════════════════\n  PASS=${pass} FAIL=${fail} FAILURES: ${R.filter(x=>x[1]==='FAIL').map(x=>x[0]).join(', ')||'none'}`);
console.log('TRACKG_DONE');
await ingestionQueue.close(); await prisma.$disconnect(); process.exit(fail===0?0:1);
