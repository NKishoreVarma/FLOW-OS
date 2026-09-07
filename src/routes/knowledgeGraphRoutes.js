/**
 * Knowledge Graph REST API — /api/kg/*
 *
 * All routes are read-only via KGQueryGateway.
 * Mutation routes (POST /nodes, POST /edges) go through
 * KGQueryGateway for validation but call SyncEngine for writes.
 *
 * Sync operations (POST /sync) call SyncEngine directly via the
 * admin-only pathway.
 *
 * Authentication: JWT + workspace-id header (tenantIsolation middleware).
 */

import { Router }        from 'express';
import {
  getNode, listNodes, searchNodes, graphStats, getNeighbors, getEdgesForNode,
  traverse, shortestPath, dependencyChain, impactPath, kHop,
  analyzeImpact, rankByBlastRadius,
  analyzeDependencies, buildServiceDependencyMap, findOrphans, findStaleDependencies,
  findOwners, findOwned, getManagementChain, getDirectReports,
  suggestReviewers, resolveApprovalChain, findAffectedCustomers,
  executiveSummary, findBlockedProjects, findAtRiskProjects,
  findCriticalServices, findDependents, findCustomerImpact,
  findTopInfluencers, findBusFactors, findOpenApprovals,
  ALL_ENTITY_TYPES, ALL_RELATIONSHIP_TYPES,
}                        from '../knowledge/KGQueryGateway.js';
import { syncEntities, listSyncStates, updateNodeProperties, addRelationship, removeRelationship }
                         from '../knowledge/sync/SyncEngine.js';
import { validateNodeInput, validateEdgeInput }
                         from '../knowledge/schema/SchemaValidator.js';
import { bulkUpsertNodes, bulkUpsertEdges }
                         from '../knowledge/storage/GraphStore.js';
import { AppError, ValidationError } from '../core/errors/index.js';

const router = Router();

// ── Schema ─────────────────────────────────────────────────────────────────────

router.get('/schema', (_req, res) => {
  res.json({
    entityTypes:       ALL_ENTITY_TYPES,
    relationshipTypes: ALL_RELATIONSHIP_TYPES,
  });
});

// ── Graph stats ────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await graphStats(req.tenantId);
    res.json(stats);
  } catch (err) { next(err); }
});

// ── Node endpoints ─────────────────────────────────────────────────────────────

router.get('/nodes', async (req, res, next) => {
  try {
    const { entityType, q, limit = '50', offset = '0' } = req.query;
    const nodes = q
      ? await searchNodes(req.tenantId, q, { entityType, limit: +limit })
      : await listNodes(req.tenantId, { entityType, limit: +limit, offset: +offset });
    res.json({ nodes, count: nodes.length });
  } catch (err) { next(err); }
});

router.get('/nodes/:id', async (req, res, next) => {
  try {
    const workspaceId = req.tenantId;
    const { id } = req.params;
    const [node, edges, neighbors] = await Promise.all([
      getNode(workspaceId, id),
      getEdgesForNode(workspaceId, id),
      getNeighbors(workspaceId, id, { limit: 20 }),
    ]);
    if (!node) throw new AppError(404, `Node not found: ${id}`);
    res.json({ node, edges, neighbors });
  } catch (err) { next(err); }
});

/** Admin: upsert a single node */
router.post('/nodes', async (req, res, next) => {
  try {
    const workspaceId = req.tenantId;
    const nodeInput   = req.body;
    validateNodeInput(nodeInput);
    const [upserted] = await bulkUpsertNodes(workspaceId, [nodeInput]);
    res.status(201).json({ node: upserted });
  } catch (err) { next(err); }
});

/** Admin: upsert a single edge */
router.post('/edges', async (req, res, next) => {
  try {
    const workspaceId = req.tenantId;
    const edgeInput   = req.body;
    validateEdgeInput(edgeInput);
    const [upserted] = await bulkUpsertEdges(workspaceId, [edgeInput]);
    res.status(201).json({ edge: upserted });
  } catch (err) { next(err); }
});

// ── Traversal ─────────────────────────────────────────────────────────────────

router.get('/traverse', async (req, res, next) => {
  try {
    const workspaceId = req.tenantId;
    const {
      startId, startIds,
      direction = 'outbound',
      maxDepth  = '3',
      entityTypes, relationshipTypes,
      limit = '50',
    } = req.query;

    const ids = startIds ? startIds.split(',') : startId ? [startId] : [];
    if (!ids.length) throw new ValidationError('startId or startIds is required');

    const opts = {
      direction,
      maxDepth:  +maxDepth,
      limit:     +limit,
      entityTypes:       entityTypes ? entityTypes.split(',') : undefined,
      relationshipTypes: relationshipTypes ? relationshipTypes.split(',') : undefined,
    };

    const results = await traverse(workspaceId, ids, opts);
    res.json({ results, count: results.length });
  } catch (err) { next(err); }
});

router.get('/traverse/path', async (req, res, next) => {
  try {
    const { fromId, toId } = req.query;
    if (!fromId || !toId) throw new ValidationError('fromId and toId are required');
    const path = await shortestPath(req.tenantId, fromId, toId);
    res.json({ path });
  } catch (err) { next(err); }
});

router.get('/traverse/deps/:id', async (req, res, next) => {
  try {
    const chain = await dependencyChain(req.tenantId, req.params.id, { maxDepth: +(req.query.maxDepth ?? 5) });
    res.json({ chain });
  } catch (err) { next(err); }
});

// ── Impact analysis ───────────────────────────────────────────────────────────

router.get('/impact/:id', async (req, res, next) => {
  try {
    const result = await analyzeImpact(req.tenantId, req.params.id, {
      maxDepth: +(req.query.maxDepth ?? 4),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/impact/rank', async (req, res, next) => {
  try {
    const { nodeIds } = req.body;
    if (!Array.isArray(nodeIds) || !nodeIds.length) throw new ValidationError('nodeIds array is required');
    const ranked = await rankByBlastRadius(req.tenantId, nodeIds);
    res.json({ ranked });
  } catch (err) { next(err); }
});

// ── Dependency analysis ────────────────────────────────────────────────────────

router.get('/dependencies/:id', async (req, res, next) => {
  try {
    const result = await analyzeDependencies(req.tenantId, req.params.id, {
      maxDepth: +(req.query.maxDepth ?? 4),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/dependencies/services/map', async (req, res, next) => {
  try {
    const map = await buildServiceDependencyMap(req.tenantId);
    res.json(map);
  } catch (err) { next(err); }
});

router.get('/dependencies/orphans', async (req, res, next) => {
  try {
    const orphans = await findOrphans(req.tenantId, { entityType: req.query.entityType });
    res.json({ orphans, count: orphans.length });
  } catch (err) { next(err); }
});

router.get('/dependencies/stale', async (req, res, next) => {
  try {
    const staleDays = +(req.query.staleDays ?? 90);
    const stale     = await findStaleDependencies(req.tenantId, staleDays);
    res.json({ stale, count: stale.length });
  } catch (err) { next(err); }
});

// ── Org explorer ───────────────────────────────────────────────────────────────

router.get('/org/owners/:id', async (req, res, next) => {
  try {
    const owners = await findOwners(req.tenantId, req.params.id);
    res.json({ owners });
  } catch (err) { next(err); }
});

router.get('/org/owned/:id', async (req, res, next) => {
  try {
    const owned = await findOwned(req.tenantId, req.params.id, {
      limit: +(req.query.limit ?? 50),
    });
    res.json({ owned, count: owned.length });
  } catch (err) { next(err); }
});

router.get('/org/management-chain/:id', async (req, res, next) => {
  try {
    const chain = await getManagementChain(req.tenantId, req.params.id);
    res.json({ chain });
  } catch (err) { next(err); }
});

router.get('/org/direct-reports/:id', async (req, res, next) => {
  try {
    const reports = await getDirectReports(req.tenantId, req.params.id);
    res.json({ reports, count: reports.length });
  } catch (err) { next(err); }
});

router.get('/org/reviewers/:id', async (req, res, next) => {
  try {
    const suggestions = await suggestReviewers(req.tenantId, req.params.id);
    res.json({ suggestions });
  } catch (err) { next(err); }
});

router.get('/org/approval-chain/:id', async (req, res, next) => {
  try {
    const chain = await resolveApprovalChain(req.tenantId, req.params.id);
    res.json(chain);
  } catch (err) { next(err); }
});

router.get('/org/affected-customers/:id', async (req, res, next) => {
  try {
    const customers = await findAffectedCustomers(req.tenantId, req.params.id);
    res.json({ customers, count: customers.length });
  } catch (err) { next(err); }
});

// ── Customer impact ───────────────────────────────────────────────────────────

router.get('/customers/impact/:id', async (req, res, next) => {
  try {
    const result = await findCustomerImpact(req.tenantId, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// ── Executive insights ────────────────────────────────────────────────────────

router.get('/insights/summary', async (req, res, next) => {
  try {
    const summary = await executiveSummary(req.tenantId);
    res.json(summary);
  } catch (err) { next(err); }
});

router.get('/insights/bus-factors', async (req, res, next) => {
  try {
    const busFactors = await findBusFactors(req.tenantId);
    res.json({ busFactors });
  } catch (err) { next(err); }
});

router.get('/insights/blocked-projects', async (req, res, next) => {
  try {
    const { targetId } = req.query;
    const blocked = await findBlockedProjects(req.tenantId, targetId ?? null);
    res.json({ blocked });
  } catch (err) { next(err); }
});

router.get('/insights/at-risk-projects', async (req, res, next) => {
  try {
    const projects = await findAtRiskProjects(req.tenantId);
    res.json({ projects });
  } catch (err) { next(err); }
});

router.get('/insights/critical-services', async (req, res, next) => {
  try {
    const services = await findCriticalServices(req.tenantId);
    res.json({ services });
  } catch (err) { next(err); }
});

router.get('/insights/influencers', async (req, res, next) => {
  try {
    const influencers = await findTopInfluencers(req.tenantId, +(req.query.limit ?? 10));
    res.json({ influencers });
  } catch (err) { next(err); }
});

router.get('/insights/open-approvals', async (req, res, next) => {
  try {
    const approvals = await findOpenApprovals(req.tenantId);
    res.json({ approvals });
  } catch (err) { next(err); }
});

// ── Services ──────────────────────────────────────────────────────────────────

router.get('/services/dependency-map', async (req, res, next) => {
  try {
    const map = await buildServiceDependencyMap(req.tenantId);
    res.json(map);
  } catch (err) { next(err); }
});

router.get('/services/dependents/:id', async (req, res, next) => {
  try {
    const result = await findDependents(req.tenantId, req.params.id);
    res.json({ result });
  } catch (err) { next(err); }
});

// ── Sync (admin) ───────────────────────────────────────────────────────────────

router.get('/sync/state', async (req, res, next) => {
  try {
    const states = await listSyncStates(req.tenantId);
    res.json({ states });
  } catch (err) { next(err); }
});

router.post('/sync', async (req, res, next) => {
  try {
    const { source, entityType, nodes, edges, cursor } = req.body;
    if (!source)     throw new ValidationError('source is required');
    if (!entityType) throw new ValidationError('entityType is required');
    if (!Array.isArray(nodes)) throw new ValidationError('nodes must be an array');

    const result = await syncEntities(req.tenantId, source, entityType, { nodes, edges: edges ?? [], cursor: cursor ?? null });
    res.json(result);
  } catch (err) { next(err); }
});

/** Admin: patch a single node's properties */
router.patch('/nodes/:id/properties', async (req, res, next) => {
  try {
    const updated = await updateNodeProperties(req.tenantId, req.params.id, req.body);
    if (!updated) throw new AppError(404, 'Node not found');
    res.json({ node: updated });
  } catch (err) { next(err); }
});

/** Admin: add a relationship */
router.post('/relationships', async (req, res, next) => {
  try {
    validateEdgeInput(req.body);
    const edge = await addRelationship(req.tenantId, req.body);
    res.status(201).json({ edge });
  } catch (err) { next(err); }
});

/** Admin: remove a relationship */
router.delete('/relationships', async (req, res, next) => {
  try {
    const { sourceId, targetId, relationshipType } = req.body;
    if (!sourceId || !targetId || !relationshipType) {
      throw new ValidationError('sourceId, targetId, and relationshipType are required');
    }
    const removed = await removeRelationship(req.tenantId, sourceId, targetId, relationshipType);
    if (!removed) throw new AppError(404, 'Relationship not found');
    res.json({ removed: true });
  } catch (err) { next(err); }
});

export default router;
