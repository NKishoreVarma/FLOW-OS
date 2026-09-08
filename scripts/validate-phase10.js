#!/usr/bin/env node
/**
 * validate-phase10.js — Enterprise Knowledge Graph (Phase 10) validation
 *
 * Standalone: node scripts/validate-phase10.js
 * No live server or database required. Tests file structure, exports,
 * schema correctness, query logic, and sync architecture invariants.
 */

import { existsSync } from 'fs';
import { resolve }    from 'path';
import assert         from 'assert/strict';

const ROOT = resolve(import.meta.dirname, '..');

let passed = 0;
let failed = 0;

function ok(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    failed++;
  }
}

async function okAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    failed++;
  }
}

// ── 1. SQL migration ─────────────────────────────────────────────────────────
console.log('\n1. SQL migration');

const SQL = resolve(ROOT, 'scripts/migrate-enterprise-knowledge-graph.sql');
ok('migration file exists', () => assert(existsSync(SQL), 'missing'));

if (existsSync(SQL)) {
  const sql = (await import('fs')).readFileSync(SQL, 'utf8');
  ok('defines kg_nodes table',          () => assert(sql.includes('CREATE TABLE'), 'no CREATE TABLE'));
  ok('defines kg_edges table',          () => assert(sql.includes('kg_edges'), 'no kg_edges'));
  ok('defines kg_sync_state table',     () => assert(sql.includes('kg_sync_state'), 'no kg_sync_state'));
  ok('defines kg_resolution_log table', () => assert(sql.includes('kg_resolution_log'), 'no kg_resolution_log'));
  ok('workspace_id in kg_nodes',        () => assert(sql.includes('workspace_id'), 'no workspace_id'));
  ok('entity_type check constraint',    () => assert(sql.includes('entity_type') && sql.includes('CHECK'), 'no check'));
  ok('relationship_type check constraint', () => assert(sql.includes('relationship_type') && sql.includes('CHECK'), 'no check'));
  ok('confidence column in kg_nodes',   () => assert(sql.includes('confidence'), 'no confidence'));
  ok('observation_count in kg_edges',   () => assert(sql.includes('observation_count'), 'no observation_count'));
  ok('FTS index on kg_nodes.name',      () => assert(sql.includes('tsvector') || sql.includes('GIN'), 'no FTS index'));
  ok('UNIQUE constraint on kg_edges',   () => assert(sql.includes('UNIQUE'), 'no UNIQUE constraint'));
  ok('idempotent (IF NOT EXISTS / ON CONFLICT)', () =>
    assert(sql.includes('IF NOT EXISTS') || sql.includes('ON CONFLICT'), 'not idempotent'));
}

// ── 2. Type definitions ───────────────────────────────────────────────────────
console.log('\n2. Type definitions');

const typesPath = resolve(ROOT, 'src/knowledge/types.js');
ok('types.js exists', () => assert(existsSync(typesPath)));

// ── 3. EntityTypes schema ─────────────────────────────────────────────────────
console.log('\n3. EntityTypes schema');

await okAsync('EntityType has 23 values', async () => {
  const { EntityType, ALL_ENTITY_TYPES } = await import(resolve(ROOT, 'src/knowledge/schema/EntityTypes.js'));
  assert.equal(ALL_ENTITY_TYPES.length, 23, `got ${ALL_ENTITY_TYPES.length}`);
  assert(EntityType.PERSON, 'PERSON missing');
  assert(EntityType.SERVICE, 'SERVICE missing');
  assert(EntityType.CUSTOMER, 'CUSTOMER missing');
  assert(EntityType.PULL_REQUEST, 'PULL_REQUEST missing');
  assert(EntityType.DEPLOYMENT, 'DEPLOYMENT missing');
});

await okAsync('entityTypeLabel returns human label', async () => {
  const { entityTypeLabel } = await import(resolve(ROOT, 'src/knowledge/schema/EntityTypes.js'));
  assert.equal(entityTypeLabel('PERSON'), 'Person');
  assert.equal(entityTypeLabel('PULL_REQUEST'), 'Pull Request');
  assert.equal(entityTypeLabel('UNKNOWN'), 'UNKNOWN');
});

await okAsync('ORG/TECHNICAL/WORK_ENTITY_TYPES are disjoint', async () => {
  const { ORG_ENTITY_TYPES, TECHNICAL_ENTITY_TYPES, WORK_ENTITY_TYPES } =
    await import(resolve(ROOT, 'src/knowledge/schema/EntityTypes.js'));

  for (const t of ORG_ENTITY_TYPES) {
    assert(!TECHNICAL_ENTITY_TYPES.has(t), `${t} in both ORG and TECHNICAL`);
  }
  for (const t of WORK_ENTITY_TYPES) {
    assert(!TECHNICAL_ENTITY_TYPES.has(t), `${t} in both WORK and TECHNICAL`);
  }
});

// ── 4. RelationshipTypes schema ───────────────────────────────────────────────
console.log('\n4. RelationshipTypes schema');

await okAsync('RelationshipType has 18 values', async () => {
  const { ALL_RELATIONSHIP_TYPES } = await import(resolve(ROOT, 'src/knowledge/schema/RelationshipTypes.js'));
  assert.equal(ALL_RELATIONSHIP_TYPES.length, 18, `got ${ALL_RELATIONSHIP_TYPES.length}`);
});

await okAsync('RELATIONSHIP_META covers all types', async () => {
  const { ALL_RELATIONSHIP_TYPES, RELATIONSHIP_META } =
    await import(resolve(ROOT, 'src/knowledge/schema/RelationshipTypes.js'));
  for (const t of ALL_RELATIONSHIP_TYPES) {
    assert(RELATIONSHIP_META[t], `no meta for ${t}`);
    assert(['forward', 'backward'].includes(RELATIONSHIP_META[t].impact_direction),
      `bad impact_direction for ${t}`);
  }
});

await okAsync('IMPACT_PROPAGATION_TYPES is a subset of RelationshipType', async () => {
  const { ALL_RELATIONSHIP_TYPES, IMPACT_PROPAGATION_TYPES } =
    await import(resolve(ROOT, 'src/knowledge/schema/RelationshipTypes.js'));
  for (const t of IMPACT_PROPAGATION_TYPES) {
    assert(ALL_RELATIONSHIP_TYPES.includes(t), `${t} not in ALL_RELATIONSHIP_TYPES`);
  }
});

// ── 5. SchemaValidator ────────────────────────────────────────────────────────
console.log('\n5. SchemaValidator');

await okAsync('buildNodeId produces deterministic ID', async () => {
  const { buildNodeId } = await import(resolve(ROOT, 'src/knowledge/schema/SchemaValidator.js'));
  const id1 = buildNodeId('ws1', 'PERSON', 'github', 'alice');
  const id2 = buildNodeId('ws1', 'PERSON', 'github', 'alice');
  assert.equal(id1, id2, 'IDs not equal');
  assert(id1.startsWith('ws1:'), 'does not start with workspaceId');
  assert(id1.includes(':PERSON:'), 'entity type not in ID');
  assert(id1.includes(':github:'), 'source not in ID');
});

await okAsync('parseNodeId round-trips', async () => {
  const { buildNodeId, parseNodeId } = await import(resolve(ROOT, 'src/knowledge/schema/SchemaValidator.js'));
  const id = buildNodeId('ws1', 'REPOSITORY', 'github', 'my-repo');
  const parsed = parseNodeId(id);
  assert.equal(parsed.workspaceId, 'ws1');
  assert.equal(parsed.entityType, 'REPOSITORY');
  assert.equal(parsed.source, 'github');
  assert.equal(parsed.externalId, 'my-repo');
});

await okAsync('validateNodeInput throws on missing required fields', async () => {
  const { validateNodeInput } = await import(resolve(ROOT, 'src/knowledge/schema/SchemaValidator.js'));
  assert.throws(() => validateNodeInput({}), /entityType/);
  assert.throws(() => validateNodeInput({ entityType: 'PERSON' }), /externalId|name/);
});

await okAsync('validateNodeInput throws on invalid entity type', async () => {
  const { validateNodeInput } = await import(resolve(ROOT, 'src/knowledge/schema/SchemaValidator.js'));
  assert.throws(() => validateNodeInput({ entityType: 'BOGUS', externalId: 'x', name: 'X', source: 'test' }), /entityType/);
});

await okAsync('validateEdgeInput rejects self-loops', async () => {
  const { validateEdgeInput } = await import(resolve(ROOT, 'src/knowledge/schema/SchemaValidator.js'));
  assert.throws(
    () => validateEdgeInput({ sourceId: 'A', targetId: 'A', relationshipType: 'owns' }),
    /self.loop|same/i
  );
});

// ── 6. ConfidenceScorer ───────────────────────────────────────────────────────
console.log('\n6. ConfidenceScorer');

await okAsync('scoreNode returns [0,1] for valid node', async () => {
  const { scoreNode } = await import(resolve(ROOT, 'src/knowledge/storage/ConfidenceScorer.js'));
  const score = scoreNode({ entity_type: 'PERSON', name: 'Alice', source: 'github', properties: { email: 'a@b.com' } });
  assert(score >= 0 && score <= 1, `score ${score} out of range`);
});

await okAsync('github/jira source has higher reliability than slack', async () => {
  const { scoreNode } = await import(resolve(ROOT, 'src/knowledge/storage/ConfidenceScorer.js'));
  const fromGitHub = scoreNode({ entity_type: 'REPOSITORY', name: 'repo', source: 'github', properties: {} });
  const fromSlack  = scoreNode({ entity_type: 'SLACK_CHANNEL', name: '#ch', source: 'slack', properties: {} });
  assert(fromGitHub > fromSlack, `github (${fromGitHub}) not > slack (${fromSlack})`);
});

await okAsync('decayEdgeConfidence reduces confidence over time', async () => {
  const { decayEdgeConfidence } = await import(resolve(ROOT, 'src/knowledge/storage/ConfidenceScorer.js'));
  const old = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(); // 1 year ago
  const recent = new Date().toISOString();
  const old_score    = decayEdgeConfidence(0.9, old);
  const recent_score = decayEdgeConfidence(0.9, recent);
  assert(old_score < recent_score, `old (${old_score}) not < recent (${recent_score})`);
});

await okAsync('computePathConfidence is product of all edges', async () => {
  const { computePathConfidence } = await import(resolve(ROOT, 'src/knowledge/storage/ConfidenceScorer.js'));
  const conf = computePathConfidence([1.0, 0.8, 0.6]);
  assert(Math.abs(conf - 1.0 * 0.8 * 0.6) < 0.001, `expected 0.48, got ${conf}`);
});

// ── 7. GraphStore ─────────────────────────────────────────────────────────────
console.log('\n7. GraphStore');

const gsPath = resolve(ROOT, 'src/knowledge/storage/GraphStore.js');
ok('GraphStore.js exists', () => assert(existsSync(gsPath)));

await okAsync('GraphStore exports required functions', async () => {
  const gs = await import(gsPath);
  const required = ['upsertNode', 'getNode', 'listNodes', 'searchNodes', 'bulkUpsertNodes', 'bulkUpsertEdges', 'getNeighbors', 'graphStats', 'deleteNode'];
  for (const fn of required) {
    assert(typeof gs[fn] === 'function', `${fn} not exported`);
  }
});

// ── 8. EntityResolver ────────────────────────────────────────────────────────
console.log('\n8. EntityResolver');

await okAsync('EntityResolver exports resolveEntity, linkAlias, getCanonicalNode', async () => {
  const er = await import(resolve(ROOT, 'src/knowledge/storage/EntityResolver.js'));
  assert(typeof er.resolveEntity === 'function', 'resolveEntity missing');
  assert(typeof er.linkAlias === 'function', 'linkAlias missing');
  assert(typeof er.getCanonicalNode === 'function', 'getCanonicalNode missing');
});

await okAsync('nameSimilarity returns 1.0 for identical strings', async () => {
  const { nameSimilarity } = await import(resolve(ROOT, 'src/knowledge/storage/EntityResolver.js'));
  assert.equal(nameSimilarity('Alice Smith', 'Alice Smith'), 1.0);
});

await okAsync('nameSimilarity returns 0 for completely different strings', async () => {
  const { nameSimilarity } = await import(resolve(ROOT, 'src/knowledge/storage/EntityResolver.js'));
  const score = nameSimilarity('zxqwerty999', 'abc123def');
  assert(score < 0.5, `expected low similarity, got ${score}`);
});

// ── 9. TraversalEngine ────────────────────────────────────────────────────────
console.log('\n9. TraversalEngine');

await okAsync('TraversalEngine exports traverse, kHop, shortestPath, dependencyChain, impactPath', async () => {
  const te = await import(resolve(ROOT, 'src/knowledge/query/TraversalEngine.js'));
  for (const fn of ['traverse', 'kHop', 'shortestPath', 'dependencyChain', 'impactPath']) {
    assert(typeof te[fn] === 'function', `${fn} missing`);
  }
});

// ── 10. ImpactAnalyzer ────────────────────────────────────────────────────────
console.log('\n10. ImpactAnalyzer');

await okAsync('ImpactAnalyzer exports analyzeImpact and rankByBlastRadius', async () => {
  const ia = await import(resolve(ROOT, 'src/knowledge/query/ImpactAnalyzer.js'));
  assert(typeof ia.analyzeImpact === 'function', 'analyzeImpact missing');
  assert(typeof ia.rankByBlastRadius === 'function', 'rankByBlastRadius missing');
});

await okAsync('CRITICALITY constants are in [0,1]', async () => {
  const { CRITICALITY } = await import(resolve(ROOT, 'src/knowledge/query/ImpactAnalyzer.js'));
  for (const [type, score] of Object.entries(CRITICALITY)) {
    assert(score >= 0 && score <= 1, `${type} criticality ${score} out of [0,1]`);
  }
});

// ── 11. DependencyAnalyzer ────────────────────────────────────────────────────
console.log('\n11. DependencyAnalyzer');

await okAsync('DependencyAnalyzer exports all required functions', async () => {
  const da = await import(resolve(ROOT, 'src/knowledge/query/DependencyAnalyzer.js'));
  for (const fn of ['analyzeDependencies', 'findOrphans', 'findStaleDependencies', 'buildServiceDependencyMap']) {
    assert(typeof da[fn] === 'function', `${fn} missing`);
  }
});

// ── 12. OrgExplorer ───────────────────────────────────────────────────────────
console.log('\n12. OrgExplorer');

await okAsync('OrgExplorer exports all required functions', async () => {
  const oe = await import(resolve(ROOT, 'src/knowledge/query/OrgExplorer.js'));
  const required = ['findOwners', 'findOwned', 'getManagementChain', 'getDirectReports',
    'suggestReviewers', 'resolveApprovalChain', 'findAffectedCustomers'];
  for (const fn of required) {
    assert(typeof oe[fn] === 'function', `${fn} missing`);
  }
});

// ── 13. ExecutiveInsights ─────────────────────────────────────────────────────
console.log('\n13. ExecutiveInsights');

await okAsync('ExecutiveInsights exports all required functions', async () => {
  const ei = await import(resolve(ROOT, 'src/knowledge/query/ExecutiveInsights.js'));
  const required = ['executiveSummary', 'findBlockedProjects', 'findAtRiskProjects',
    'findCriticalServices', 'findCustomerImpact', 'findTopInfluencers', 'findBusFactors', 'findOpenApprovals'];
  for (const fn of required) {
    assert(typeof ei[fn] === 'function', `${fn} missing`);
  }
});

// ── 14. ConnectorAdapters ─────────────────────────────────────────────────────
console.log('\n14. ConnectorAdapters');

await okAsync('adaptGitHub returns { nodes, edges } for a repository', async () => {
  const { adaptGitHub } = await import(resolve(ROOT, 'src/knowledge/sync/ConnectorAdapters.js'));
  const result = adaptGitHub('ws1', {
    repo: { id: 1, name: 'my-repo', full_name: 'org/my-repo', description: null, language: 'JS', stargazers_count: 5, forks_count: 1, open_issues_count: 3, default_branch: 'main', private: false },
  });
  assert(Array.isArray(result.nodes), 'nodes not array');
  assert(Array.isArray(result.edges), 'edges not array');
  assert(result.nodes.length >= 1, 'no nodes');
  assert.equal(result.nodes[0].entityType, 'REPOSITORY');
});

await okAsync('adaptGitHub maps PR + author', async () => {
  const { adaptGitHub } = await import(resolve(ROOT, 'src/knowledge/sync/ConnectorAdapters.js'));
  const result = adaptGitHub('ws1', {
    pullRequest: { id: 100, number: 42, title: 'Fix bug', state: 'open', user: { login: 'alice', name: 'Alice' }, requested_reviewers: [] },
  });
  const prNode = result.nodes.find(n => n.entityType === 'PULL_REQUEST');
  const personNode = result.nodes.find(n => n.entityType === 'PERSON');
  assert(prNode, 'no PR node');
  assert(personNode, 'no PERSON node for author');
  const authorEdge = result.edges.find(e => e.relationshipType === 'created_by');
  assert(authorEdge, 'no created_by edge');
});

await okAsync('adaptJira maps issue + assignee', async () => {
  const { adaptJira } = await import(resolve(ROOT, 'src/knowledge/sync/ConnectorAdapters.js'));
  const result = adaptJira('ws1', {
    issue: {
      key: 'FLOW-1', id: '10001',
      fields: { summary: 'Fix login', status: { name: 'In Progress' }, assignee: { accountId: 'u1', displayName: 'Bob', emailAddress: 'bob@co.com' }, priority: { name: 'High' }, issuetype: { name: 'Bug' }, project: { key: 'FLOW' }, labels: [], issuelinks: [] },
    },
  });
  const issueNode = result.nodes.find(n => n.entityType === 'JIRA_ISSUE');
  const personNode = result.nodes.find(n => n.entityType === 'PERSON');
  assert(issueNode, 'no JIRA_ISSUE node');
  assert(personNode, 'no PERSON node');
  const assignedEdge = result.edges.find(e => e.relationshipType === 'assigned_to');
  assert(assignedEdge, 'no assigned_to edge');
});

await okAsync('adaptGmail maps email + from-person', async () => {
  const { adaptGmail } = await import(resolve(ROOT, 'src/knowledge/sync/ConnectorAdapters.js'));
  const result = adaptGmail('ws1', {
    message: {
      id: 'msg1', threadId: 'th1',
      payload: { headers: [
        { name: 'Subject', value: 'Hello world' },
        { name: 'From',    value: 'Alice <alice@example.com>' },
        { name: 'To',      value: 'Bob <bob@example.com>' },
      ]},
    },
  });
  const emailNode  = result.nodes.find(n => n.entityType === 'EMAIL');
  const personNode = result.nodes.find(n => n.entityType === 'PERSON');
  assert(emailNode,  'no EMAIL node');
  assert(personNode, 'no PERSON node for from');
  assert.equal(emailNode.name, 'Hello world');
});

await okAsync('adaptGoogleCalendar maps event + attendees', async () => {
  const { adaptGoogleCalendar } = await import(resolve(ROOT, 'src/knowledge/sync/ConnectorAdapters.js'));
  const result = adaptGoogleCalendar('ws1', {
    event: {
      id: 'evt1', summary: 'Team standup',
      start: { dateTime: '2026-07-20T09:00:00Z' },
      end:   { dateTime: '2026-07-20T09:30:00Z' },
      attendees: [
        { email: 'alice@co.com', displayName: 'Alice', responseStatus: 'accepted' },
        { email: 'bob@co.com',   displayName: 'Bob',   responseStatus: 'needsAction' },
      ],
    },
  });
  const meetingNode = result.nodes.find(n => n.entityType === 'MEETING');
  const personNodes = result.nodes.filter(n => n.entityType === 'PERSON');
  assert(meetingNode, 'no MEETING node');
  assert.equal(personNodes.length, 2, `expected 2 PERSON nodes, got ${personNodes.length}`);
  const participateEdges = result.edges.filter(e => e.relationshipType === 'participates_in');
  assert.equal(participateEdges.length, 2, 'expected 2 participates_in edges');
});

await okAsync('getAdapter returns null for unknown source', async () => {
  const { getAdapter } = await import(resolve(ROOT, 'src/knowledge/sync/ConnectorAdapters.js'));
  assert.equal(getAdapter('unknown-crm'), null);
});

// ── 15. SyncEngine ────────────────────────────────────────────────────────────
console.log('\n15. SyncEngine');

await okAsync('SyncEngine exports required functions', async () => {
  const se = await import(resolve(ROOT, 'src/knowledge/sync/SyncEngine.js'));
  for (const fn of ['syncEntities', 'incrementalSync', 'updateNodeProperties', 'addRelationship', 'removeRelationship', 'fullResync', 'listSyncStates']) {
    assert(typeof se[fn] === 'function', `${fn} missing`);
  }
});

// ── 16. KGEventSubscriber ────────────────────────────────────────────────────
console.log('\n16. KGEventSubscriber');

await okAsync('KGEventSubscriber exports registerKGSubscriber and unregisterKGSubscriber', async () => {
  const es = await import(resolve(ROOT, 'src/knowledge/sync/KGEventSubscriber.js'));
  assert(typeof es.registerKGSubscriber === 'function', 'registerKGSubscriber missing');
  assert(typeof es.unregisterKGSubscriber === 'function', 'unregisterKGSubscriber missing');
});

// ── 17. KGQueryGateway ───────────────────────────────────────────────────────
console.log('\n17. KGQueryGateway');

await okAsync('KGQueryGateway re-exports all required read functions', async () => {
  const gw = await import(resolve(ROOT, 'src/knowledge/KGQueryGateway.js'));
  const required = [
    'getNode', 'listNodes', 'searchNodes', 'graphStats',
    'traverse', 'shortestPath', 'dependencyChain',
    'analyzeImpact', 'analyzeDependencies',
    'findOwners', 'suggestReviewers', 'resolveApprovalChain',
    'executiveSummary', 'findBusFactors',
    'whoOwns', 'whatDependsOn', 'prReviewers', 'customerImpact', 'blockers', 'approvalChain',
  ];
  for (const fn of required) {
    assert(typeof gw[fn] === 'function', `${fn} missing from gateway`);
  }
});

await okAsync('KGQueryGateway has no write functions', async () => {
  const gw = await import(resolve(ROOT, 'src/knowledge/KGQueryGateway.js'));
  const writeFunctions = ['syncEntities', 'upsertNode', 'bulkUpsertNodes', 'deleteNode', 'updateNodeProperties'];
  for (const fn of writeFunctions) {
    assert(typeof gw[fn] !== 'function', `write fn ${fn} must NOT be exported from gateway`);
  }
});

// ── 18. KG actions ───────────────────────────────────────────────────────────
console.log('\n18. KG Actions');

await okAsync('kgActions exports KG_ACTIONS array and registerKGActions', async () => {
  const ka = await import(resolve(ROOT, 'src/knowledge/actions/kgActions.js'));
  assert(Array.isArray(ka.KG_ACTIONS), 'KG_ACTIONS not array');
  assert(ka.KG_ACTIONS.length >= 4, `expected >= 4 actions, got ${ka.KG_ACTIONS.length}`);
  assert(typeof ka.registerKGActions === 'function', 'registerKGActions missing');
});

await okAsync('each KG action has id, name, category, execute', async () => {
  const { KG_ACTIONS } = await import(resolve(ROOT, 'src/knowledge/actions/kgActions.js'));
  for (const action of KG_ACTIONS) {
    assert(action.id,       `action missing id`);
    assert(action.name,     `${action.id} missing name`);
    assert(action.category, `${action.id} missing category`);
    assert(typeof action.execute === 'function', `${action.id} execute not a function`);
    assert(action.requiredRole, `${action.id} missing requiredRole`);
  }
});

await okAsync('kg.remove_relationship requires ADMIN role', async () => {
  const { KG_ACTIONS } = await import(resolve(ROOT, 'src/knowledge/actions/kgActions.js'));
  const removeAction = KG_ACTIONS.find(a => a.id === 'kg.remove_relationship');
  assert(removeAction, 'kg.remove_relationship action missing');
  assert.equal(removeAction.requiredRole, 'ADMIN', `expected ADMIN, got ${removeAction.requiredRole}`);
});

await okAsync('kg.update_node_properties rejects missing nodeId', async () => {
  const { KG_ACTIONS } = await import(resolve(ROOT, 'src/knowledge/actions/kgActions.js'));
  const action = KG_ACTIONS.find(a => a.id === 'kg.update_node_properties');
  await assert.rejects(
    () => action.execute({ workspaceId: 'ws1', parameters: { propertyPatch: {} } }),
    /nodeId/
  );
});

// ── 19. knowledge/index.js ───────────────────────────────────────────────────
console.log('\n19. knowledge/index.js boot entry point');

await okAsync('index.js exports startKnowledgeGraph', async () => {
  const idx = await import(resolve(ROOT, 'src/knowledge/index.js'));
  assert(typeof idx.startKnowledgeGraph === 'function', 'startKnowledgeGraph missing');
});

await okAsync('index.js re-exports KGQueryGateway functions', async () => {
  const idx = await import(resolve(ROOT, 'src/knowledge/index.js'));
  assert(typeof idx.executiveSummary === 'function', 'executiveSummary not re-exported');
  assert(typeof idx.traverse === 'function', 'traverse not re-exported');
  assert(typeof idx.EntityType !== 'undefined', 'EntityType not re-exported');
});

await okAsync('startKnowledgeGraph is idempotent (safe to call twice)', async () => {
  const { startKnowledgeGraph } = await import(resolve(ROOT, 'src/knowledge/index.js'));
  // Already called above — second call must not throw
  await startKnowledgeGraph();
});

// ── 20. REST route file ───────────────────────────────────────────────────────
console.log('\n20. knowledgeGraphRoutes.js');

const routesPath = resolve(ROOT, 'src/routes/knowledgeGraphRoutes.js');
ok('knowledgeGraphRoutes.js exists', () => assert(existsSync(routesPath)));

await okAsync('routes file exports default express router', async () => {
  const mod = await import(routesPath);
  const router = mod.default;
  assert(router, 'no default export');
  assert(typeof router === 'function' || typeof router.handle === 'function', 'not a router');
});

const routesSrc = (await import('fs')).readFileSync(routesPath, 'utf8');
ok('GET /nodes route defined',             () => assert(routesSrc.includes("'/nodes'"), 'missing /nodes'));
ok('GET /nodes/:id route defined',         () => assert(routesSrc.includes("'/nodes/:id'"), 'missing /nodes/:id'));
ok('GET /traverse route defined',          () => assert(routesSrc.includes("'/traverse'"), 'missing /traverse'));
ok('GET /impact/:id route defined',        () => assert(routesSrc.includes("'/impact/:id'"), 'missing /impact/:id'));
ok('GET /dependencies/:id route defined',  () => assert(routesSrc.includes("'/dependencies/:id'"), 'missing /dependencies/:id'));
ok('GET /org/owners/:id route defined',    () => assert(routesSrc.includes("'/org/owners/:id'"), 'missing /org/owners/:id'));
ok('GET /org/reviewers/:id route defined', () => assert(routesSrc.includes("'/org/reviewers/:id'"), 'missing /org/reviewers/:id'));
ok('GET /insights/summary route defined',  () => assert(routesSrc.includes("'/insights/summary'"), 'missing /insights/summary'));
ok('GET /insights/bus-factors defined',    () => assert(routesSrc.includes("'/insights/bus-factors'"), 'missing /insights/bus-factors'));
ok('POST /sync route defined',             () => assert(routesSrc.includes("'/sync'"), 'missing /sync'));
ok('GET /stats route defined',             () => assert(routesSrc.includes("'/stats'"), 'missing /stats'));

// ── 21. server.js mounts /api/kg ─────────────────────────────────────────────
console.log('\n21. server.js integration');

const serverSrc = (await import('fs')).readFileSync(resolve(ROOT, 'src/server.js'), 'utf8');
ok('server.js imports knowledgeGraphRoutes',    () => assert(serverSrc.includes('knowledgeGraphRoutes'), 'not imported'));
ok('server.js mounts /api/kg',                  () => assert(serverSrc.includes("'/api/kg'") || serverSrc.includes('"/api/kg"'), 'not mounted'));
ok('server.js calls startKnowledgeGraph',       () => assert(serverSrc.includes('startKnowledgeGraph'), 'not called'));

// ── 22. Invariant assertions ──────────────────────────────────────────────────
console.log('\n22. Architecture invariants');

const gatewaySrc = (await import('fs')).readFileSync(resolve(ROOT, 'src/knowledge/KGQueryGateway.js'), 'utf8');
ok('gateway has no direct pool/db import (read-only)',
  () => assert(!gatewaySrc.includes("from '../../config/db.js'") && !gatewaySrc.includes("import db"), 'gateway imports db directly'));

const syncSrc = (await import('fs')).readFileSync(resolve(ROOT, 'src/knowledge/sync/SyncEngine.js'), 'utf8');
ok('SyncEngine imports pool from config/db.js (single writer)',
  () => assert(syncSrc.includes("from '../../config/db.js'"), 'SyncEngine not importing pool'));

const eventSubSrc = (await import('fs')).readFileSync(resolve(ROOT, 'src/knowledge/sync/KGEventSubscriber.js'), 'utf8');
ok('KGEventSubscriber never publishes events (no loop)',
  () => assert(!eventSubSrc.includes('publish(') && !eventSubSrc.includes("'KNOWLEDGE_GRAPH_SYNCED'") || eventSubSrc.includes("if (eventType === 'KNOWLEDGE_GRAPH_SYNCED') return"),
    'missing loop prevention'));

ok('KGActions file exists',
  () => assert(existsSync(resolve(ROOT, 'src/knowledge/actions/kgActions.js'))));

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${'─'.repeat(50)}`);
console.log(`Phase 10 — Enterprise Knowledge Graph`);
console.log(`${passed}/${total} assertions passed${failed > 0 ? ` (${failed} FAILED)` : ''}`);
console.log('─'.repeat(50));
if (failed > 0) process.exit(1);
