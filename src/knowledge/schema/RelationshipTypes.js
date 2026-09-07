/**
 * Canonical relationship type enumeration for the Enterprise Knowledge Graph.
 * These match the CHECK constraint in kg_edges.relationship_type.
 */

export const RelationshipType = Object.freeze({
  OWNS:            'owns',
  REPORTS_TO:      'reports_to',
  MEMBER_OF:       'member_of',
  ASSIGNED_TO:     'assigned_to',
  DEPENDS_ON:      'depends_on',
  BLOCKS:          'blocks',
  CREATED_BY:      'created_by',
  REVIEWED_BY:     'reviewed_by',
  APPROVES:        'approves',
  PARTICIPATES_IN: 'participates_in',
  REFERENCES:      'references',
  AFFECTS:         'affects',
  SUPPORTS:        'supports',
  SERVES:          'serves',
  LINKED_TO:       'linked_to',
  RELATED_TO:      'related_to',
  IMPLEMENTS:      'implements',
  BELONGS_TO:      'belongs_to',
});

export const ALL_RELATIONSHIP_TYPES = Object.values(RelationshipType);

export function isRelationshipType(t) {
  return ALL_RELATIONSHIP_TYPES.includes(t);
}

/**
 * Relationship directionality metadata.
 *
 * impact_direction: which direction to traverse when propagating impact.
 *   'forward'  — impact flows source→target (B is affected if A affects B)
 *   'backward' — impact flows target→source (if A depends_on B, then B's failure affects A)
 *
 * inverse: logical inverse of the relationship (for display).
 */
export const RELATIONSHIP_META = Object.freeze({
  owns:            { impact_direction: 'forward',  inverse: 'owned_by',        label: 'owns' },
  reports_to:      { impact_direction: 'backward', inverse: 'manages',         label: 'reports to' },
  member_of:       { impact_direction: 'forward',  inverse: 'has_member',      label: 'member of' },
  assigned_to:     { impact_direction: 'forward',  inverse: 'assigned',        label: 'assigned to' },
  depends_on:      { impact_direction: 'backward', inverse: 'depended_on_by',  label: 'depends on' },
  blocks:          { impact_direction: 'forward',  inverse: 'blocked_by',      label: 'blocks' },
  created_by:      { impact_direction: 'forward',  inverse: 'created',         label: 'created by' },
  reviewed_by:     { impact_direction: 'forward',  inverse: 'reviews',         label: 'reviewed by' },
  approves:        { impact_direction: 'forward',  inverse: 'approved_by',     label: 'approves' },
  participates_in: { impact_direction: 'forward',  inverse: 'has_participant', label: 'participates in' },
  references:      { impact_direction: 'forward',  inverse: 'referenced_by',   label: 'references' },
  affects:         { impact_direction: 'forward',  inverse: 'affected_by',     label: 'affects' },
  supports:        { impact_direction: 'forward',  inverse: 'supported_by',    label: 'supports' },
  serves:          { impact_direction: 'forward',  inverse: 'served_by',       label: 'serves' },
  linked_to:       { impact_direction: 'forward',  inverse: 'linked_to',       label: 'linked to' },
  related_to:      { impact_direction: 'forward',  inverse: 'related_to',      label: 'related to' },
  implements:      { impact_direction: 'forward',  inverse: 'implemented_by',  label: 'implements' },
  belongs_to:      { impact_direction: 'forward',  inverse: 'contains',        label: 'belongs to' },
});

/**
 * Relationship types that propagate blast-radius impact forward.
 * "If source is impacted, target is also impacted."
 */
export const IMPACT_PROPAGATION_TYPES = new Set([
  RelationshipType.AFFECTS,
  RelationshipType.BLOCKS,
  RelationshipType.SERVES,
  RelationshipType.SUPPORTS,
]);

/**
 * Relationship types where impact travels in reverse.
 * "If target fails, source is impacted."
 */
export const REVERSE_IMPACT_TYPES = new Set([
  RelationshipType.DEPENDS_ON,
]);

/**
 * Relationships that define organizational hierarchy.
 * Used by OrgExplorer and ApprovalChainResolver.
 */
export const ORG_HIERARCHY_TYPES = new Set([
  RelationshipType.REPORTS_TO,
  RelationshipType.MEMBER_OF,
  RelationshipType.OWNS,
]);
