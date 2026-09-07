/**
 * apply_rc3_edges.mjs — regenerate the Helios graph relationships through the REAL WLE
 * resolvers (no parallel writer, no fabricated edges). Loads the UNCHANGED synthetic
 * world via loadSyntheticWorld() (now mapping reports_to/manages/assigned_to/
 * incident_commander/start_time), runs the registered resolvers for the affected types,
 * and idempotently upserts nodes + edges. Node ids are unchanged → RC-1 unaffected.
 *
 * Only touches: employees, incidents, calendar_events (the RC-3 types).
 */
import { assertCertificationAllowed, CERTIFICATION_WORKSPACE } from '../../src/config/flowEnv.js';
import '../../src/core/workspaceLifecycle/datasets/index.js';      // side-effect: register types
import { getDatasetHandler } from '../../src/core/workspaceLifecycle/datasetRegistry.js';
import { loadSyntheticWorld } from './loadWorld.js';
import { upsertNode, upsertEdge } from '../../src/services/operationalGraphService.js';
import { prisma } from '../../src/core/config/prisma.js';

const WS = CERTIFICATION_WORKSPACE;
process.env.FLOW_ENV = process.env.FLOW_ENV || 'certification';

const wsRow = await prisma.workspace.findUnique({ where: { externalId: WS }, select: { orgId: true } });
if (!wsRow) { console.error('Helios workspace not found'); process.exit(1); }
const orgId = wsRow.orgId;

const { datasets } = loadSyntheticWorld();
const TYPES = ['employees', 'incidents', 'calendar_events'];
let nodeCount = 0; const edgeCounts = {};

for (const type of TYPES) {
  const recs = datasets[type] || [];
  const handler = getDatasetHandler(type);
  if (!handler?.graphBuilder || !recs.length) { console.log(`  skip ${type} (records=${recs.length})`); continue; }
  const { nodes, edges } = handler.graphBuilder(recs, {});
  for (const n of nodes) { await upsertNode(WS, orgId, n.id, n.type, n.name, n.metadata || {}); nodeCount++; }
  for (const e of edges) {
    try { await upsertEdge(WS, orgId, e.sourceId, e.targetId, e.type, e.weight ?? 1.0); edgeCounts[e.type] = (edgeCounts[e.type] || 0) + 1; }
    catch { /* target node may not exist for some edges — skip, never fabricate */ }
  }
  console.log(`  ${type}: ${nodes.length} nodes upserted, ${edges.length} edges attempted`);
}

console.log(`\nApplied: ${nodeCount} node upserts; edges by type: ${JSON.stringify(edgeCounts)}`);

// Verify the new edges landed
const check = await prisma.$queryRawUnsafe(
  `SELECT relationship_type, count(*)::int c FROM graph_edges WHERE workspace_id=$1
   AND relationship_type IN ('REPORTS_TO','MANAGES','ASSIGNED_TO','COMMANDER') GROUP BY 1 ORDER BY 1`, WS);
console.log('New relationship edges in graph:', JSON.stringify(check));

// Spot-check: Kishore (USER-002) reports_to, and INCIDENT-001 assigned_to
const kishore = await prisma.$queryRawUnsafe(
  `SELECT t.name FROM graph_edges e JOIN graph_nodes t ON t.id=e.target_id
   WHERE e.workspace_id=$1 AND e.relationship_type='REPORTS_TO' AND e.source_id=$2`, WS, `${WS}:USER-002`);
console.log('Kishore (USER-002) REPORTS_TO →', kishore.map(r => r.name).join(', ') || 'none');
const inc = await prisma.$queryRawUnsafe(
  `SELECT e.relationship_type, t.name FROM graph_edges e JOIN graph_nodes t ON t.id=e.target_id
   WHERE e.workspace_id=$1 AND e.source_id=$2 AND e.relationship_type IN ('ASSIGNED_TO','COMMANDER')`, WS, `${WS}:INCIDENT-001`);
console.log('INCIDENT-001 →', inc.map(r => `${r.relationship_type}:${r.name}`).join(', ') || 'none');
const mtg = await prisma.$queryRawUnsafe(
  `SELECT metadata->>'start_time' st FROM graph_nodes WHERE workspace_id=$1 AND type='MEETING' AND metadata->>'start_time' IS NOT NULL LIMIT 1`, WS);
console.log('Meeting start_time now stored:', mtg[0]?.st || 'NONE');

console.log('APPLY_RC3_DONE');
await prisma.$disconnect(); process.exit(0);
