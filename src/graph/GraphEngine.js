/**
 * GraphEngine — applies FLOW events to the Operational Graph incrementally.
 *
 * Never rebuilds. Each event is translated by GraphSchema into nodes + edges and
 * upserted (nodes first for FK integrity). This is the only writer to the graph.
 */

import { deriveGraph } from './GraphSchema.js';
import { bulkUpsertNodes } from './NodeManager.js';
import { bulkUpsertEdges } from './EdgeManager.js';
import { resolveOrgId } from '../events/orgResolver.js';

/**
 * Apply a single unified FLOW Event to the graph.
 * @returns {Promise<{nodes:number, edges:number}>}
 */
export async function applyEvent(event) {
  const workspaceId = event.workspaceId;
  const orgId = event.organizationId || await resolveOrgId(workspaceId);
  if (!workspaceId || !orgId) return { nodes: 0, edges: 0 }; // graph requires a tenant + org

  const { nodes, edges } = deriveGraph(event);
  const n = await bulkUpsertNodes(workspaceId, orgId, nodes);
  const e = await bulkUpsertEdges(workspaceId, orgId, edges);
  return { nodes: n, edges: e };
}

/**
 * Apply many events (backfill). Nodes are upserted across the whole batch before
 * edges so cross-event references resolve.
 * @returns {Promise<{nodes:number, edges:number}>}
 */
export async function applyEvents(workspaceId, orgId, events) {
  const resolvedOrg = orgId || await resolveOrgId(workspaceId);
  if (!resolvedOrg) return { nodes: 0, edges: 0 };

  const allNodes = [];
  const allEdges = [];
  for (const event of events) {
    const { nodes, edges } = deriveGraph({ ...event, workspaceId, organizationId: resolvedOrg });
    allNodes.push(...nodes);
    allEdges.push(...edges);
  }
  // De-dupe nodes by rawId within the batch to shrink the insert.
  const nodeMap = new Map();
  for (const n of allNodes) nodeMap.set(n.rawId, n);

  let nCount = 0, eCount = 0;
  const nodeList = [...nodeMap.values()];
  for (let i = 0; i < nodeList.length; i += 500) nCount += await bulkUpsertNodes(workspaceId, resolvedOrg, nodeList.slice(i, i + 500));
  for (let i = 0; i < allEdges.length; i += 500) eCount += await bulkUpsertEdges(workspaceId, resolvedOrg, allEdges.slice(i, i + 500));
  return { nodes: nCount, edges: eCount };
}
