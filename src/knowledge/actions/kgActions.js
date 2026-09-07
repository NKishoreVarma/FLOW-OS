/**
 * Knowledge Graph registered actions — workflow steps that mutate the KG.
 *
 * These are registered in the Action Registry so that workflows can mutate
 * the KG through the governed execution pipeline. Direct calls to SyncEngine
 * from within workflows are not permitted.
 *
 * Registration: import this file as a side-effect in server.js.
 */

import { updateNodeProperties, addRelationship, removeRelationship, syncEntities } from '../sync/SyncEngine.js';
import { validateNodeInput, validateEdgeInput } from '../schema/SchemaValidator.js';
import { AppError, ValidationError } from '../../core/errors/index.js';
import { logger } from '../../utils/logger.js';

// ── Action definitions ────────────────────────────────────────────────────────

export const KG_ACTIONS = [
  {
    id:          'kg.update_node_properties',
    name:        'Update KG Node Properties',
    description: 'Merge a property patch into an existing KG node.',
    category:    'knowledge_graph',
    requiredRole: 'MEMBER',
    parameters: {
      nodeId:        { type: 'string', required: true },
      propertyPatch: { type: 'object', required: true },
    },
    async execute({ workspaceId, parameters }) {
      const { nodeId, propertyPatch } = parameters;
      if (!nodeId)        throw new ValidationError('nodeId is required');
      if (!propertyPatch || typeof propertyPatch !== 'object') throw new ValidationError('propertyPatch must be an object');

      const updated = await updateNodeProperties(workspaceId, nodeId, propertyPatch);
      if (!updated) throw new AppError(404, `KG node not found: ${nodeId}`);
      logger.info(`[KGAction] updated node ${nodeId} in ${workspaceId}`);
      return { updated };
    },
  },

  {
    id:          'kg.add_relationship',
    name:        'Add KG Relationship',
    description: 'Create a directed relationship between two existing KG nodes.',
    category:    'knowledge_graph',
    requiredRole: 'MEMBER',
    parameters: {
      sourceId:         { type: 'string', required: true },
      targetId:         { type: 'string', required: true },
      relationshipType: { type: 'string', required: true },
      sourceSystem:     { type: 'string', required: false },
      properties:       { type: 'object', required: false },
    },
    async execute({ workspaceId, parameters }) {
      const edgeInput = {
        sourceId:         parameters.sourceId,
        targetId:         parameters.targetId,
        relationshipType: parameters.relationshipType,
        sourceSystem:     parameters.sourceSystem ?? 'workflow',
        properties:       parameters.properties   ?? {},
      };
      validateEdgeInput(edgeInput);
      const edge = await addRelationship(workspaceId, edgeInput);
      logger.info(`[KGAction] added edge ${parameters.sourceId} --[${parameters.relationshipType}]--> ${parameters.targetId}`);
      return { edge };
    },
  },

  {
    id:          'kg.remove_relationship',
    name:        'Remove KG Relationship',
    description: 'Delete a directed relationship between two KG nodes.',
    category:    'knowledge_graph',
    requiredRole: 'ADMIN',
    parameters: {
      sourceId:         { type: 'string', required: true },
      targetId:         { type: 'string', required: true },
      relationshipType: { type: 'string', required: true },
    },
    async execute({ workspaceId, parameters }) {
      const { sourceId, targetId, relationshipType } = parameters;
      if (!sourceId || !targetId || !relationshipType) {
        throw new ValidationError('sourceId, targetId, and relationshipType are required');
      }
      const removed = await removeRelationship(workspaceId, sourceId, targetId, relationshipType);
      if (!removed) throw new AppError(404, 'Relationship not found');
      logger.info(`[KGAction] removed edge ${sourceId} --[${relationshipType}]--> ${targetId}`);
      return { removed: true };
    },
  },

  {
    id:          'kg.sync_entities',
    name:        'Sync Entities to KG',
    description: 'Batch-upsert a set of pre-normalized nodes and edges into the KG.',
    category:    'knowledge_graph',
    requiredRole: 'ADMIN',
    parameters: {
      source:     { type: 'string', required: true },
      entityType: { type: 'string', required: true },
      nodes:      { type: 'array',  required: true },
      edges:      { type: 'array',  required: false },
      cursor:     { type: 'string', required: false },
    },
    async execute({ workspaceId, parameters }) {
      const { source, entityType, nodes, edges = [], cursor = null } = parameters;
      if (!source)     throw new ValidationError('source is required');
      if (!entityType) throw new ValidationError('entityType is required');
      if (!Array.isArray(nodes)) throw new ValidationError('nodes must be an array');

      const result = await syncEntities(workspaceId, source, entityType, { nodes, edges, cursor });
      return result;
    },
  },
];

// ── Registration helper ────────────────────────────────────────────────────────

let _registered = false;

/**
 * Register all KG actions in the Action Registry.
 * Called once at server boot.
 */
export async function registerKGActions() {
  if (_registered) return;
  _registered = true;

  try {
    const { registerAction } = await import('../../execution/actionRegistry.js');
    for (const action of KG_ACTIONS) {
      registerAction(action);
    }
    logger.info(`[KGActions] Registered ${KG_ACTIONS.length} knowledge graph actions`);
  } catch (err) {
    // Action Registry may not be available in all configurations
    logger.warn(`[KGActions] Could not register with Action Registry: ${err.message}`);
  }
}
