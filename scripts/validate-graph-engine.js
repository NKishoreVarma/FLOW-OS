/**
 * Phase 11.1 — Operational Graph Engine acceptance checks.
 *
 * Seeds a real org + workspace (Prisma), builds a small Digital Twin by
 * publishing events through the Unified Event Platform (the graph subscriber
 * writes incrementally), then verifies node/edge creation, taxonomy, traversal,
 * impact/dependency analysis, relationship scoring, and workspace isolation.
 *
 * Run: node scripts/validate-graph-engine.js   (exit 0 = all pass)
 */

import { prisma } from '../src/core/config/prisma.js';
import * as EP from '../src/events/index.js';
import '../src/graph/index.js';
import * as G from '../src/graph/index.js';
import db from '../src/config/db.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); ok ? pass++ : fail++; };

const sfx = Math.random().toString(16).slice(2, 8);
let org, ws2org;
const WS  = `graph-twin-${sfx}`;
const WSB = `graph-twin-b-${sfx}`;

async function seed() {
  org = await prisma.organization.create({ data: { name: `GraphOrg ${sfx}`, slug: `graph-${sfx}`, plan: 'pro' } });
  await prisma.workspace.create({ data: { name: 'A', externalId: WS,  orgId: org.id } });
  ws2org = await prisma.organization.create({ data: { name: `GraphOrgB ${sfx}`, slug: `graph-b-${sfx}`, plan: 'pro' } });
  await prisma.workspace.create({ data: { name: 'B', externalId: WSB, orgId: ws2org.id } });
}

async function cleanup() {
  for (const w of [WS, WSB]) {
    await db.query('DELETE FROM graph_edges WHERE workspace_id=$1', [w]).catch(() => {});
    await db.query('DELETE FROM graph_nodes WHERE workspace_id=$1', [w]).catch(() => {});
    await db.query('DELETE FROM flow_events WHERE workspace_id=$1', [w]).catch(() => {});
    await db.query('DELETE FROM flow_event_deliveries WHERE workspace_id=$1', [w]).catch(() => {});
  }
  await prisma.workspace.deleteMany({ where: { externalId: { in: [WS, WSB] } } }).catch(() => {});
  if (org)    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
  if (ws2org) await prisma.organization.delete({ where: { id: ws2org.id } }).catch(() => {});
}

async function main() {
  await seed();

  // ── Build the twin ─────────────────────────────────────────────────────────
  const e1 = await EP.publish('github', 'pull_request',
    { workspaceId: WS, number: 1, title: 'Add payments gateway', author: 'alice', repo: 'payments-svc', id: 'PR-1' }, { workspaceId: WS });
  await EP.publish('github', 'pull_request',
    { workspaceId: WS, number: 2, title: 'Fix payments retry', author: 'alice', repo: 'payments-svc', id: 'PR-2' }, { workspaceId: WS });
  await EP.publish('slack', 'message',
    { workspaceId: WS, text: 'prod payments outage sev1', sender: 'charlie', channel: 'incidents', id: 'INC-1' },
    { workspaceId: WS, causationId: e1.eventId });
  await EP.publish('hubspot', 'customer',
    { workspaceId: WS, id: 'ACME', name: 'Acme Corp', summary: 'churn risk after outage', owner: 'charlie' }, { workspaceId: WS });
  await EP.publish('calendar', 'event',
    { workspaceId: WS, id: 'MTG-1', title: 'Payments incident review',
      attendees: [{ email: 'alice', name: 'alice' }, { email: 'bob', name: 'bob' }, { email: 'charlie', name: 'charlie' }],
      start: new Date().toISOString() }, { workspaceId: WS });
  // Workspace B — isolation probe
  await EP.publish('github', 'pull_request', { workspaceId: WSB, number: 9, title: 'B secret', author: 'zoe', repo: 'b-repo', id: 'PR-B' }, { workspaceId: WSB });

  // ── Structure ──────────────────────────────────────────────────────────────
  const m = await G.metrics(WS);
  check('nodes created', m.nodeCount > 0, `${m.nodeCount} nodes`);
  check('edges created', m.edgeCount > 0, `${m.edgeCount} edges`);
  const nodeTypes = new Set(m.byNodeType.map(t => t.type));
  const edgeTypes = new Set(m.byEdgeType.map(t => t.type));
  check('node taxonomy populated', ['EMPLOYEE', 'PULL_REQUEST', 'REPOSITORY', 'CUSTOMER', 'MEETING', 'INTEGRATION', 'TIMELINE_EVENT'].every(t => nodeTypes.has(t)),
    [...nodeTypes].join(','));
  check('edge taxonomy populated', ['CREATED', 'BELONGS_TO', 'GENERATED', 'WORKS_WITH', 'ATTENDED'].every(t => edgeTypes.has(t)), [...edgeTypes].join(','));
  check('causation edge recorded', edgeTypes.has('CAUSED'), edgeTypes.has('CAUSED') ? 'CAUSED present' : 'missing');

  // ── Traversal ──────────────────────────────────────────────────────────────
  const aliceId = G.rawNodeId('EMPLOYEE', 'people', 'alice');
  const nb = await G.neighbors(WS, aliceId);
  check('neighbors resolves relationships', nb.some(x => x.relation === 'CREATED' && x.node.type === 'PULL_REQUEST'),
    nb.map(x => x.relation).join(','));
  const repoId = G.rawNodeId('REPOSITORY', 'github', 'payments-svc');
  const path = await G.shortestPath(WS, aliceId, repoId, 4);
  check('shortest path (alice → repo)', !!path && path.length >= 3, path ? path.map(p => p.type).join('→') : 'none');
  const hop2 = await G.traverse(WS, aliceId, { hops: 2 });
  check('2-hop traversal returns neighborhood', hop2.length > 0, `${hop2.length} nodes`);

  // ── Relationship intelligence ──────────────────────────────────────────────
  const collab = await G.topCollaborators(WS, 10);
  check('collaborators detected (WORKS_WITH)', collab.length >= 3, collab.map(c => `${c.a}~${c.b}`).join(', '));
  const knows = await G.whoKnows(WS, 'payments');
  check('who-knows resolves experts', knows.some(k => k.name === 'alice'), knows.map(k => k.name).join(','));
  const ranked = await G.rankNeighbors(WS, aliceId, 5);
  check('relationship scoring ranks neighbors', ranked.length > 0 && ranked[0].strength > 0, `top=${ranked[0]?.strength}`);

  // ── Impact / dependency ────────────────────────────────────────────────────
  const imp = await G.analyzeImpact(WS, repoId);
  check('impact analysis runs', imp.impactedCount > 0, `count=${imp.impactedCount} score=${imp.impactScore}`);
  const dep = await G.analyzeDependencies(WS, G.rawNodeId('PULL_REQUEST', 'github', 'PR-1'));
  check('dependency analysis runs', typeof dep.dependencyCount === 'number', `deps=${dep.dependencyCount}`);
  const orphans = await G.findOrphans(WS, 'REPOSITORY');
  check('orphan detection runs', Array.isArray(orphans), `${orphans.length} orphan repos`);

  // ── Isolation ──────────────────────────────────────────────────────────────
  const mB = await G.metrics(WSB);
  const searchLeak = await G.searchNodes(WS, { text: 'b-repo' });
  check('workspace isolation on metrics', mB.nodeCount > 0 && mB.nodeCount !== m.nodeCount, `A=${m.nodeCount} B=${mB.nodeCount}`);
  check('workspace isolation on search', searchLeak.length === 0, `leak=${searchLeak.length}`);

  await cleanup();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('fatal:', err); await cleanup(); process.exit(1); });
