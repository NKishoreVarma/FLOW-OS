/**
 * PayloadTransformer — maps event fields to workflow params using dot-path notation.
 *
 * A paramMapping is a plain object:
 *   { workflowParamName: "eventDotPath", ... }
 *
 * Supported special paths:
 *   "workspaceId"          →  event.workspaceId
 *   "connector"            →  event.connector
 *   "eventType"            →  event.eventType
 *   "sourceEventId"        →  event.sourceEventId
 *   "correlationId"        →  event.correlationId
 *   "payload.<dotPath>"    →  event.payload.<dotPath>
 *   "metadata.<dotPath>"   →  event.metadata.<dotPath>
 *   anything else          →  top-level event property
 *
 * Literal string values:
 *   If the path starts with '"' it is treated as a literal string (strip quotes).
 */

export function transform(paramMapping, event) {
  if (!paramMapping || typeof paramMapping !== 'object') return {};
  const result = {};
  for (const [param, path] of Object.entries(paramMapping)) {
    if (typeof path !== 'string') {
      result[param] = path;  // Pass through literals (numbers, booleans)
      continue;
    }
    if (path.startsWith('"') && path.endsWith('"')) {
      result[param] = path.slice(1, -1);
      continue;
    }
    result[param] = resolvePath(path, event);
  }
  return result;
}

function resolvePath(dotPath, event) {
  const parts = dotPath.split('.');
  let cur = event;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}
