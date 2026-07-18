/**
 * FLOW OS — Integration Permission Gate (Phase 13.1)
 *
 * The chokepoint. Every item entering FLOW from a connector — whether via the
 * sync engine, a webhook, or a capability sync route — passes through here first.
 *
 * A denied item is not filtered later, or scored lower, or hidden in the UI.
 * It never enters the pipeline: never queued, never stored, never embedded,
 * never graphed, never replayed, never predicted, never simulated.
 *
 * Decision order:
 *   1. Connector has no sync adapter        → ALLOW  (nothing to govern)
 *   2. Connector is legacy-grandfathered    → ALLOW  (see below)
 *   3. Item maps to no resource             → DENY   (ungovernable ⇒ not ingested)
 *   4. Slack DM                             → dmPolicy
 *   5. Any candidate resource is allowed    → ALLOW
 *   6. Resource unknown to the catalog      → autoAllowNew ? ALLOW : DENY
 *   7. Otherwise                            → DENY
 *
 * On legacy-grandfathering (step 2): connectors that were already syncing before
 * this feature shipped keep working until an admin runs discovery once. Without
 * this, deploying deny-by-default would silently stop ingestion for every
 * existing workspace. The first discovery seeds the catalog as allowed and clears
 * the flag, after which deny-by-default governs normally. The UI marks these
 * connectors "Ungoverned" until then.
 */

import { logger } from '../../../utils/logger.js';
import { isGoverned } from './resourceTypes.js';
import { loadPermissionMap } from './permissionStore.js';
import { extractFromSyncItem, extractFromWebhook } from './resourceKeyExtractor.js';

export const GateReason = {
  NOT_GOVERNED:    'connector_not_governed',
  LEGACY:          'legacy_ungoverned',
  UNATTRIBUTABLE:  'unattributable',
  ALLOWED:         'resource_allowed',
  HIDDEN:          'resource_hidden',
  UNDISCOVERED:    'resource_not_discovered',
  AUTO_ALLOWED:    'auto_allowed_new',
  DM_BLOCKED:      'dm_policy_blocked',
  DM_ALLOWED:      'dm_policy_allowed',
};

// Warn once per workspace+connector rather than on every item in the batch.
const legacyWarned = new Set();

function decide(candidates, map, settings) {
  if (!candidates.length) {
    return { allowed: false, reason: GateReason.UNATTRIBUTABLE, resourceId: null };
  }

  // Slack DMs are governed by a policy, not a checkbox.
  const dm = candidates.find(c => c.resourceType === 'dm');
  if (dm) {
    const policy = settings.dmPolicy ?? 'NEVER';
    if (policy === 'ALL') {
      return { allowed: true, reason: GateReason.DM_ALLOWED, resourceId: dm.resourceId };
    }
    if (policy === 'SELECTED' || policy === 'BOT_ONLY') {
      const entry = map.get(dm.resourceId);
      return entry?.allowed
        ? { allowed: true,  reason: GateReason.DM_ALLOWED, resourceId: dm.resourceId }
        : { allowed: false, reason: GateReason.DM_BLOCKED, resourceId: dm.resourceId };
    }
    return { allowed: false, reason: GateReason.DM_BLOCKED, resourceId: dm.resourceId };
  }

  let sawUndiscovered = null;

  for (const c of candidates) {
    const entry = map.get(c.resourceId);

    if (entry?.allowed) {
      return { allowed: true, reason: GateReason.ALLOWED, resourceId: c.resourceId };
    }
    if (!entry) sawUndiscovered = c.resourceId;
  }

  // Every candidate is either explicitly hidden or absent from the catalog.
  if (sawUndiscovered && settings.autoAllowNew) {
    return { allowed: true, reason: GateReason.AUTO_ALLOWED, resourceId: sawUndiscovered };
  }
  if (sawUndiscovered) {
    return { allowed: false, reason: GateReason.UNDISCOVERED, resourceId: sawUndiscovered };
  }

  return { allowed: false, reason: GateReason.HIDDEN, resourceId: candidates[0].resourceId };
}

async function gate(workspaceId, connector, candidates) {
  if (!isGoverned(connector)) {
    return { allowed: true, reason: GateReason.NOT_GOVERNED, resourceId: null };
  }

  const { map, settings } = await loadPermissionMap(workspaceId, connector);

  if (settings.legacyGrandfathered) {
    const key = `${workspaceId}:${connector}`;
    if (!legacyWarned.has(key)) {
      legacyWarned.add(key);
      logger.security(
        `integrationPermissions: ${connector} in ${workspaceId} is UNGOVERNED — connected before ` +
        'Integration Permissions shipped. Run discovery to bring it under governance.',
      );
    }
    return { allowed: true, reason: GateReason.LEGACY, resourceId: null };
  }

  return decide(candidates, map, settings);
}

/**
 * Is FLOW allowed to ingest this sync item?
 * @returns {Promise<{allowed: boolean, reason: string, resourceId: string|null}>}
 */
export async function isResourceAllowed(workspaceId, connector, item) {
  return gate(workspaceId, connector, extractFromSyncItem(connector, item));
}

/**
 * Is FLOW allowed to ingest this webhook?
 * @returns {Promise<{allowed: boolean, reason: string, resourceId: string|null}>}
 */
export async function isWebhookAllowed(workspaceId, connector, payload) {
  return gate(workspaceId, connector, extractFromWebhook(connector, payload));
}

/**
 * Direct check for callers that already know exactly which resource they are
 * about to read — the capability sync routes (`/api/engineering/sync` targets one
 * repo, `/api/communication/sync` one set of labels) rather than a stream of
 * items to be attributed.
 *
 * @param {string|string[]} resourceId — any-of semantics when an array is given
 */
export async function isResourceIdAllowed(workspaceId, connector, resourceType, resourceId) {
  const ids = Array.isArray(resourceId) ? resourceId : [resourceId];
  const candidates = ids
    .filter(Boolean)
    .map(id => ({ resourceType, resourceId: String(id) }));

  return gate(workspaceId, connector, candidates);
}

/**
 * Split a batch of sync items into what FLOW may read and what it may not.
 * The blocked list carries no item text — only the reason and resource id — so a
 * hidden channel's content never reaches a log line.
 *
 * @returns {Promise<{allowed: object[], blocked: Array<{reason,resourceId,externalId}>, allowedResourceIds: string[]}>}
 */
export async function filterItems(workspaceId, connector, items = []) {
  const allowed = [];
  const blocked = [];
  const allowedResourceIds = new Set();

  for (const item of items) {
    const verdict = await isResourceAllowed(workspaceId, connector, item);

    if (verdict.allowed) {
      allowed.push(item);
      if (verdict.resourceId) allowedResourceIds.add(verdict.resourceId);
    } else {
      blocked.push({
        reason:     verdict.reason,
        resourceId: verdict.resourceId,
        externalId: item.externalId ?? null,
      });
    }
  }

  if (blocked.length) {
    logger.security(
      `integrationPermissions: blocked ${blocked.length}/${items.length} ${connector} item(s) ` +
      `for ${workspaceId} — not authorized by Integration Permissions`,
    );
  }

  return { allowed, blocked, allowedResourceIds: [...allowedResourceIds] };
}

/**
 * Resource ids an ingesting caller is allowed to read, for connectors whose sync
 * should fan out per resource (e.g. only sync the calendars an admin allowed)
 * rather than fetch-then-discard.
 */
export async function getAllowedResourceIds(workspaceId, connector, resourceType) {
  const { map, settings } = await loadPermissionMap(workspaceId, connector);

  if (settings.legacyGrandfathered) return null; // null = "no restriction yet"

  const ids = [];
  for (const [resourceId, entry] of map.entries()) {
    if (entry.allowed && entry.resourceType === resourceType) ids.push(resourceId);
  }
  return ids;
}

/** Test seam. */
export function resetLegacyWarnings() {
  legacyWarned.clear();
}
