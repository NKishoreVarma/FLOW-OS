/**
 * ConditionEvaluator — safe JSON-based condition language. No eval().
 *
 * Supported condition objects:
 *
 *   // Leaf predicate
 *   { field: "payload.pr.draft", op: "eq", value: false }
 *
 *   // Logical combinators
 *   { all: [predicate, ...] }   — AND
 *   { any: [predicate, ...] }   — OR
 *   { not: predicate }
 *
 * Supported ops:
 *   eq, ne, gt, lt, gte, lte, in, nin, contains, startsWith,
 *   endsWith, exists, regex, isEmpty
 *
 * Field path resolution: dot-separated path from the event root.
 *   "payload.pr.number"  →  event.payload?.pr?.number
 *   "workspaceId"        →  event.workspaceId
 *   "metadata.sender"    →  event.metadata?.sender
 */

export class ConditionError extends Error {
  constructor(msg) { super(msg); this.code = 'CONDITION_ERROR'; }
}

/**
 * Evaluate a condition against a FLOW event.
 * @param {object} condition
 * @param {object} event — full FLOW event
 * @returns {boolean}
 */
export function evaluate(condition, event) {
  if (!condition || typeof condition !== 'object') return true; // empty → pass
  if (Array.isArray(condition)) return condition.every(c => evaluate(c, event));

  // Logical combinators
  if ('all' in condition) {
    if (!Array.isArray(condition.all)) throw new ConditionError('"all" must be an array');
    return condition.all.every(c => evaluate(c, event));
  }
  if ('any' in condition) {
    if (!Array.isArray(condition.any)) throw new ConditionError('"any" must be an array');
    return condition.any.some(c => evaluate(c, event));
  }
  if ('not' in condition) {
    return !evaluate(condition.not, event);
  }

  // Leaf predicate
  if ('field' in condition) return evaluateLeaf(condition, event);

  // Unknown structure — pass-through (permissive)
  return true;
}

function evaluateLeaf({ field, op, value }, event) {
  const actual = resolvePath(field, event);

  switch (op) {
    case 'eq':         return actual === value;
    case 'ne':         return actual !== value;
    case 'gt':         return actual >   value;
    case 'lt':         return actual <   value;
    case 'gte':        return actual >=  value;
    case 'lte':        return actual <=  value;
    case 'in':
      if (!Array.isArray(value)) throw new ConditionError('"in" requires array value');
      return value.includes(actual);
    case 'nin':
      if (!Array.isArray(value)) throw new ConditionError('"nin" requires array value');
      return !value.includes(actual);
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(value);
      return typeof actual === 'string' && actual.includes(String(value));
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(String(value));
    case 'endsWith':
      return typeof actual === 'string' && actual.endsWith(String(value));
    case 'exists':
      return value ? (actual !== undefined && actual !== null) : (actual === undefined || actual === null);
    case 'isEmpty':
      return actual === null || actual === undefined || actual === '' ||
             (Array.isArray(actual) && actual.length === 0) ||
             (typeof actual === 'object' && actual !== null && Object.keys(actual).length === 0);
    case 'regex': {
      const re = value instanceof RegExp ? value : new RegExp(String(value));
      return re.test(String(actual ?? ''));
    }
    default:
      throw new ConditionError(`Unknown op: "${op}"`);
  }
}

function resolvePath(dotPath, obj) {
  const parts = String(dotPath).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}
