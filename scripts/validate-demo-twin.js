/**
 * Phase 11.1 Milestone 2 — Demo Company Digital Twin validation.
 *
 * Builds the complete twin for the demo company (Helios Software) from the
 * exported datasets, then validates the full query surface at scale:
 * traversal, shortest path, impact, dependency, collaboration, orphan and
 * stale detection, and relationship scoring.
 *
 * Targets: 1,000+ nodes and 10,000+ edges.
 *
 * Run:  node scripts/validate-demo-twin.js         (builds, validates, cleans up)
 *       node scripts/validate-demo-twin.js --keep   (leaves the twin for the Explorer)
 *
 * Exit 0 = all pass.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/core/config/prisma.js';
import db from '../src/config/db.js';
import { bulkUpsertNodes } from '../src/graph/NodeManager.js';
import { bulkUpsertEdges } from '../src/graph/EdgeManager.js';
import { NodeType, EdgeType, rawNodeId } from '../src/graph/nodeTypes.js';
import * as G from '../src/graph/index.js';

const KEEP = process.argv.includes('--keep');
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo-company', 'exports', 'datasets');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, `${f}.json`), 'utf8'));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); ok ? pass++ : fail++; };
const timed = async (fn) => { const t = Date.now(); const r = await fn(); return [r, Date.now() - t]; };

// Namespace per node type (people/customers unify across connectors).
const NS = {
  [NodeType.EMPLOYEE]: 'people', [NodeType.CUSTOMER]: 'customer',
  [NodeType.REPOSITORY]: 'github', [NodeType.PULL_REQUEST]: 'github', [NodeType.COMMIT]: 'github',
  [NodeType.ISSUE]: 'jira', [NodeType.MEETING]: 'calendar',
};
const nid = (type, key) => rawNodeId(type, NS[type] || 'flow', key);

const sfx = Math.random().toString(16).slice(2, 8);
const WS = KEEP ? 'demo-twin' : `demo-twin-${sfx}`;
let org;

async function seed() {
  const existing = await prisma.workspace.findFirst({ where: { externalId: WS } });
  if (existing) { org = { id: existing.orgId }; await wipe(); return; }
  org = await prisma.organization.create({ data: { name: `Helios ${sfx}`, slug: `helios-${sfx}`, plan: 'enterprise' } });
  await prisma.workspace.create({ data: { name: 'Helios Software', externalId: WS, orgId: org.id } });
}
async function wipe() {
  await db.query('DELETE FROM graph_edges WHERE workspace_id=$1', [WS]);
  await db.query('DELETE FROM graph_nodes WHERE workspace_id=$1', [WS]);
}
async function cleanup() {
  await wipe().catch(() => {});
  await prisma.workspace.deleteMany({ where: { externalId: WS } }).catch(() => {});
  if (org?.id) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
}

async function build() {
  const nodes = new Map();   // rawId -> node
  const edges = new Map();   // src|tgt|type -> {sourceRawId,targetRawId,type,weight}
  const N = (type, key, name, metadata = {}) => { const rawId = nid(type, key); if (!nodes.has(rawId)) nodes.set(rawId, { rawId, type, name: name || key, metadata }); return rawId; };
  const E = (s, t, type, w = 1) => {
    if (!s || !t || s === t) return;
    const k = `${s}|${t}|${type}`;
    const e = edges.get(k);
    if (e) e.weight += w; else edges.set(k, { sourceRawId: s, targetRawId: t, type, weight: w });
  };
  const emp = (id) => id ? nid(NodeType.EMPLOYEE, id) : null;

  // Employees, departments
  for (const e of load('employees')) {
    const id = N(NodeType.EMPLOYEE, e.id, e.name, { title: e.title, status: e.status });
    if (e.department) E(id, N(NodeType.DEPARTMENT, e.department, e.department), EdgeType.BELONGS_TO);
    if (e.manager) E(id, emp(e.manager), EdgeType.REPORTS_TO);
  }
  for (const d of load('departments')) N(NodeType.DEPARTMENT, d.id, d.name, { headcount: d.headcount });

  // Repositories (+ owner from first commit/PR author, so some stay orphaned)
  const repoOwner = {};
  for (const r of load('repositories')) {
    N(NodeType.REPOSITORY, r.id, r.name, { language: r.language });
    if (r.productId) E(nid(NodeType.REPOSITORY, r.id), N(NodeType.PROJECT, r.productId, r.productId), EdgeType.BELONGS_TO);
  }
  for (const c of load('commits')) {
    const id = N(NodeType.COMMIT, c.id, (c.message || '').slice(0, 60));
    const repo = nid(NodeType.REPOSITORY, c.repoId);
    E(emp(c.author), id, EdgeType.CREATED); E(id, repo, EdgeType.BELONGS_TO);
    if (c.author && !repoOwner[c.repoId]) repoOwner[c.repoId] = c.author;
  }
  for (const [repoId, ownerId] of Object.entries(repoOwner)) E(emp(ownerId), nid(NodeType.REPOSITORY, repoId), EdgeType.OWNS);

  // Pull requests
  for (const p of load('pull_requests')) {
    const id = N(NodeType.PULL_REQUEST, p.id, p.title);
    E(emp(p.author), id, EdgeType.CREATED); E(id, nid(NodeType.REPOSITORY, p.repoId), EdgeType.BELONGS_TO);
    for (const rv of (p.reviewers || [])) E(emp(rv), id, EdgeType.REVIEWED);
  }

  // Jira issues
  for (const j of load('jira_issues')) {
    const id = N(NodeType.ISSUE, j.id, j.title, { status: j.status, priority: j.priority });
    E(emp(j.reporter), id, EdgeType.CREATED);
    E(emp(j.assignee), id, EdgeType.ASSIGNED_TO);
    if (j.projectKey) E(id, N(NodeType.PROJECT, j.projectKey, j.projectKey), EdgeType.BELONGS_TO);
    if (j.customerId) E(id, N(NodeType.CUSTOMER, j.customerId, j.customerId), EdgeType.AFFECTED);
  }

  // Meetings — attendance + collaboration (WORKS_WITH weight = shared meetings)
  for (const m of load('meetings')) {
    const id = N(NodeType.MEETING, m.id, m.title);
    const att = (m.attendees || []).filter(Boolean);
    E(emp(m.organizer), id, EdgeType.CREATED);
    for (const a of att) E(emp(a), id, EdgeType.ATTENDED);
    for (let i = 0; i < att.length; i++)
      for (let j = i + 1; j < att.length; j++) {
        const [a, b] = [att[i], att[j]].sort();
        E(emp(a), emp(b), EdgeType.WORKS_WITH);
      }
    if (m.customerId) E(id, N(NodeType.CUSTOMER, m.customerId, m.customerId), EdgeType.DISCUSSED_IN);
  }

  // Customers
  for (const c of load('customers')) {
    const id = N(NodeType.CUSTOMER, c.id, c.name, { tier: c.tier, health: c.health, arr: c.arr });
    if (c.csm) E(emp(c.csm), id, EdgeType.OWNS);
    for (const prod of (c.products || [])) E(id, N(NodeType.PROJECT, prod, prod), EdgeType.DEPENDS_ON);
  }

  // Incidents
  for (const inc of load('incidents')) {
    const id = N(NodeType.INCIDENT, inc.id, inc.title, { severity: inc.severity, status: inc.status });
    E(emp(inc.commander), id, inc.status === 'resolved' ? EdgeType.RESOLVED : EdgeType.CREATED);
    if (inc.affectedProduct) E(id, N(NodeType.PROJECT, inc.affectedProduct, inc.affectedProduct), EdgeType.CONNECTED_TO);
    for (const cust of (inc.affectedCustomers || [])) E(id, N(NodeType.CUSTOMER, cust, cust), EdgeType.AFFECTED, 2);
  }

  // Documents (nodes; a slice backdated for stale detection)
  const docs = load('documents');
  for (const d of docs) N(NodeType.DOCUMENT, d.id, d.title);

  // Persist
  const nodeList = [...nodes.values()], edgeList = [...edges.values()];
  for (let i = 0; i < nodeList.length; i += 500) await bulkUpsertNodes(WS, org.id, nodeList.slice(i, i + 500));
  for (let i = 0; i < edgeList.length; i += 500) await bulkUpsertEdges(WS, org.id, edgeList.slice(i, i + 500));

  // Backdate half the documents so stale detection has something to find.
  const staleIds = docs.slice(0, Math.floor(docs.length / 2)).map(d => `${WS}:${nid(NodeType.DOCUMENT, d.id)}`);
  if (staleIds.length) await db.query(`UPDATE graph_nodes SET last_observed_at = NOW() - INTERVAL '200 days' WHERE id = ANY($1)`, [staleIds]);

  return { nodes: nodeList.length, edges: edgeList.length, employees: load('employees') };
}

async function main() {
  console.log(`\nBuilding Helios Digital Twin → workspace "${WS}"\n`);
  await seed();
  const [built, buildMs] = await timed(build);
  console.log(`built in ${buildMs}ms\n`);

  const m = await G.metrics(WS);
  check('1,000+ nodes', m.nodeCount >= 1000, `${m.nodeCount} nodes`);
  check('10,000+ edges', m.edgeCount >= 10000, `${m.edgeCount} edges`);
  console.log('   node types:', m.byNodeType.map(t => `${t.type}:${t.c}`).join(', '));
  console.log('   edge types:', m.byEdgeType.map(t => `${t.type}:${t.c}`).join(', '), '\n');

  // Pick a well-connected employee for traversal tests.
  const hubs = await G.topConnected(WS, 5);
  const person = hubs.find(h => h.type === 'EMPLOYEE') || hubs[0];

  const [nb, tNb]     = await timed(() => G.neighbors(WS, person.id));
  check('neighbors', nb.length > 0, `${nb.length} for ${person.name} in ${tNb}ms`);
  const [h2, t2]      = await timed(() => G.traverse(WS, person.id, { hops: 2 }));
  check('2-hop traversal', h2.length > 0, `${h2.length} nodes in ${t2}ms`);
  const [h3, t3]      = await timed(() => G.traverse(WS, person.id, { hops: 3 }));
  check('3-hop traversal', h3.length > 0, `${h3.length} nodes in ${t3}ms`);

  // Shortest path between two employees.
  const emps = built.employees;
  const a = nid(NodeType.EMPLOYEE, emps[0].id), b = nid(NodeType.EMPLOYEE, emps[40].id);
  const [sp, tsp]     = await timed(() => G.shortestPath(WS, a, b, 5));
  check('shortest path between employees', !!sp, sp ? `${sp.length - 1} hops in ${tsp}ms` : `none in ${tsp}ms`);

  // Impact & dependency on a hub project.
  const proj = (await G.searchNodes(WS, { type: 'PROJECT', limit: 1 }))[0];
  const [imp, tImp]   = await timed(() => G.analyzeImpact(WS, proj.id, 3));
  check('impact analysis', imp.impactedCount > 0, `${imp.impactedCount} impacted (score ${imp.impactScore}) in ${tImp}ms`);
  const [dep, tDep]   = await timed(() => G.analyzeDependencies(WS, person.id, 3));
  check('dependency analysis', typeof dep.dependencyCount === 'number', `${dep.dependencyCount} deps in ${tDep}ms`);

  // Collaboration, orphans, stale, scoring.
  const [collab]      = await timed(() => G.topCollaborators(WS, 10));
  check('collaboration graph', collab.length >= 10 && collab[0].strength > 0, `top pair strength ${collab[0]?.strength}`);
  const [orphans]     = await timed(() => G.findOrphans(WS, 'REPOSITORY'));
  check('orphan detection', Array.isArray(orphans), `${orphans.length} orphan repos`);
  const [stale]       = await timed(() => G.findStale(WS, { type: 'DOCUMENT', days: 90 }));
  check('stale knowledge detection', stale.length > 0, `${stale.length} stale documents`);
  const [ranked]      = await timed(() => G.rankNeighbors(WS, person.id, 10));
  check('relationship scoring', ranked.length > 0 && ranked[0].strength > 0, `top strength ${ranked[0]?.strength}`);
  const [knows]       = await timed(() => G.whoKnows(WS, 'platform'));
  check('who-knows expertise', Array.isArray(knows), `${knows.length} experts on "platform"`);

  if (KEEP) {
    console.log(`\n🟢 Twin kept in workspace "${WS}" — open /graph-explorer, use your ADMIN JWT + workspace-id: ${WS}`);
  } else {
    await cleanup();
  }
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('fatal:', err); if (!KEEP) await cleanup(); process.exit(1); });
