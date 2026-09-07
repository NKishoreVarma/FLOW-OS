/**
 * Schema validator for KG nodes and edges.
 * Throws ValidationError on invalid input before any DB write.
 */

import { ValidationError } from '../../core/errors/index.js';
import { ALL_ENTITY_TYPES, isEntityType } from './EntityTypes.js';
import { ALL_RELATIONSHIP_TYPES, isRelationshipType } from './RelationshipTypes.js';

const MAX_NAME_LEN        = 512;
const MAX_DESCRIPTION_LEN = 4096;
const MAX_EXT_ID_LEN      = 512;

// ── Node validation ───────────────────────────────────────────────────────────

/**
 * Validate a raw node input before upsert.
 * @param {object} input
 * @throws {ValidationError}
 */
export function validateNodeInput(input) {
  const errs = [];

  if (!input || typeof input !== 'object') {
    throw new ValidationError('Node input must be an object');
  }

  if (!isEntityType(input.entityType)) {
    errs.push(`entityType must be one of: ${ALL_ENTITY_TYPES.join(', ')}`);
  }

  if (!input.externalId || typeof input.externalId !== 'string' || !input.externalId.trim()) {
    errs.push('externalId is required and must be a non-empty string');
  } else if (input.externalId.length > MAX_EXT_ID_LEN) {
    errs.push(`externalId exceeds max length of ${MAX_EXT_ID_LEN}`);
  }

  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    errs.push('name is required and must be a non-empty string');
  } else if (input.name.length > MAX_NAME_LEN) {
    errs.push(`name exceeds max length of ${MAX_NAME_LEN}`);
  }

  if (input.description && input.description.length > MAX_DESCRIPTION_LEN) {
    errs.push(`description exceeds max length of ${MAX_DESCRIPTION_LEN}`);
  }

  if (input.confidence !== undefined) {
    const c = Number(input.confidence);
    if (isNaN(c) || c < 0 || c > 1) errs.push('confidence must be a number between 0 and 1');
  }

  if (input.properties !== undefined && (typeof input.properties !== 'object' || Array.isArray(input.properties))) {
    errs.push('properties must be a plain object');
  }

  if (errs.length > 0) throw new ValidationError(`Invalid KG node: ${errs.join('; ')}`);
}

// ── Edge validation ───────────────────────────────────────────────────────────

/**
 * Validate a raw edge input before upsert.
 * @param {object} input
 * @throws {ValidationError}
 */
export function validateEdgeInput(input) {
  const errs = [];

  if (!input || typeof input !== 'object') {
    throw new ValidationError('Edge input must be an object');
  }

  if (!input.sourceId || typeof input.sourceId !== 'string') {
    errs.push('sourceId is required');
  }
  if (!input.targetId || typeof input.targetId !== 'string') {
    errs.push('targetId is required');
  }
  if (input.sourceId && input.targetId && input.sourceId === input.targetId) {
    errs.push('sourceId and targetId must be different (no self-loops)');
  }

  if (!isRelationshipType(input.relationshipType)) {
    errs.push(`relationshipType must be one of: ${ALL_RELATIONSHIP_TYPES.join(', ')}`);
  }

  if (input.confidence !== undefined) {
    const c = Number(input.confidence);
    if (isNaN(c) || c < 0 || c > 1) errs.push('confidence must be 0–1');
  }

  if (input.weight !== undefined) {
    const w = Number(input.weight);
    if (isNaN(w) || w < 0) errs.push('weight must be a non-negative number');
  }

  if (errs.length > 0) throw new ValidationError(`Invalid KG edge: ${errs.join('; ')}`);
}

// ── Node ID construction ──────────────────────────────────────────────────────

/**
 * Build a deterministic node ID from its identity components.
 * Format: `{workspaceId}:{entityType}:{source}:{externalId}`
 *
 * The source is normalized to lowercase and spaces replaced with underscores.
 * The externalId is kept as-is (case-sensitive for external systems).
 */
export function buildNodeId(workspaceId, entityType, source, externalId) {
  const normalSource = (source ?? 'internal').toLowerCase().replace(/\s+/g, '_');
  return `${workspaceId}:${entityType}:${normalSource}:${externalId}`;
}

/**
 * Parse a node ID back to its components.
 * @returns {{ workspaceId, entityType, source, externalId }|null}
 */
export function parseNodeId(nodeId) {
  if (!nodeId || typeof nodeId !== 'string') return null;
  const parts = nodeId.split(':');
  if (parts.length < 4) return null;
  const [workspaceId, entityType, source, ...rest] = parts;
  return { workspaceId, entityType, source, externalId: rest.join(':') };
}
