/**
 * FLOW OS — Integration Permissions Routes (Phase 13.1)
 *
 * The governance surface for "what is FLOW allowed to understand?".
 * Reading the catalog is open to any workspace member; changing it is ADMIN/OWNER,
 * and every change is written to the AuditLog.
 *
 * Route map:
 *   GET    /api/integration-permissions                    — all connectors + counts
 *   GET    /api/integration-permissions/:connector         — one connector's catalog (tree)
 *   POST   /api/integration-permissions/:connector/discover — hit the real provider API
 *   PUT    /api/integration-permissions/:connector/resources — bulk allow/hide (ADMIN+)
 *   POST   /api/integration-permissions/:connector/bulk    — select all / none (ADMIN+)
 *   PATCH  /api/integration-permissions/:connector/settings — autoAllowNew / dmPolicy (ADMIN+)
 *   GET    /api/integration-permissions/:connector/audit   — permission change history
 */

import express from 'express';
import { authorize }             from '../core/middleware/index.js';
import { prisma }                from '../core/config/prisma.js';
import { ValidationError, AppError } from '../core/errors/index.js';
import { broadcastToWorkspace }  from '../services/socketService.js';
import { logger }                from '../utils/logger.js';
import {
  runDiscovery,
  NotConnectedError,
  getSettings,
  updateSettings,
  listResources,
  getSummary,
  setAllowed,
  setAllForConnector,
  GOVERNED_CONNECTORS,
  UNAVAILABLE_CONNECTORS,
  CONNECTOR_TAXONOMY,
  isGoverned,
  getTaxonomy,
} from '../core/governance/integrationPermissions/index.js';
import { hasCredentials } from '../services/integrations/ConnectorCredentialStore.js';
import { getConnector as _getAdapter, isRegistered as _isReg } from '../connectors/registry.js';

// Is this a preview (in-memory) connector? Reads are simulated; writes are refused by
// the Execution Engine. Surfaced so the permissions UI can label it honestly.
function _isSimulated(connectorId) {
  try { return _isReg(connectorId) && _getAdapter(connectorId).simulated === true; }
  catch { return false; }
}

const router = express.Router();

// ── Workspace guard ───────────────────────────────────────────────────────────

router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header required' },
    });
  }
  req.workspaceId = workspaceId;
  next();
});

function requireGoverned(req, res, next) {
  const { connector } = req.params;
  if (!isGoverned(connector)) {
    return next(new ValidationError(
      `"${connector}" has no sync adapter, so there is nothing to govern yet.`,
    ));
  }
  next();
}

/** Every permission change is an auditable governance event. */
async function audit(req, connector, action, metadata) {
  try {
    await prisma.auditLog.create({
      data: {
        orgId:       req.user.orgId,
        userId:      req.user.id ?? req.user.userId ?? null,
        workspaceId: req.workspaceId,
        action:      `integration_permissions.${action}`,
        resource:    `connector:${connector}`,
        ip:          req.ip ?? null,
        metadata,
      },
    });
  } catch (err) {
    // An audit failure must not silently swallow the permission change, but it
    // must not fail the request either — log loudly instead.
    logger.error(`integrationPermissions: audit write failed — ${err.message}`);
  }
}

// ── GET / — dashboard overview ────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const connectors = await Promise.all(
      GOVERNED_CONNECTORS.map(async (connector) => {
        const taxonomy = getTaxonomy(connector);

        const [summary, settings, connected] = await Promise.all([
          getSummary(req.workspaceId, connector),
          getSettings(req.workspaceId, connector),
          hasCredentials(req.workspaceId, connector).catch(() => false),
        ]);

        return {
          id:        connector,
          name:      taxonomy.label,
          icon:      taxonomy.icon,
          category:  taxonomy.category,
          available: true,
          connected,
          simulated: _isSimulated(connector),
          ...summary,
          // A connector that was syncing before permissions shipped is not yet
          // governed: it keeps reading everything until discovery runs once.
          ungoverned:       settings.legacyGrandfathered === true,
          autoAllowNew:     settings.autoAllowNew,
          dmPolicy:         settings.dmPolicy,
          supportsDmPolicy: !!taxonomy.supportsDmPolicy,
          lastDiscoveredAt: settings.lastDiscoveredAt,
        };
      }),
    );

    // Surfaced so the page shows the full intended surface — with no invented data.
    const unavailable = UNAVAILABLE_CONNECTORS.map(c => ({
      ...c, available: false, connected: false, total: 0, allowed: 0, hidden: 0,
    }));

    res.json({
      connectors,
      unavailable,
      totals: {
        governed: connectors.length,
        allowed:  connectors.reduce((n, c) => n + c.allowed, 0),
        hidden:   connectors.reduce((n, c) => n + c.hidden, 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /:connector — catalog for one connector ───────────────────────────────

router.get('/:connector', requireGoverned, async (req, res, next) => {
  try {
    const { connector } = req.params;
    const { q, status, type } = req.query;

    const allowedFilter =
      status === 'allowed' ? true :
      status === 'hidden'  ? false : undefined;

    const [resources, settings, summary, connected] = await Promise.all([
      listResources(req.workspaceId, connector, {
        q:            q || undefined,
        allowed:      allowedFilter,
        resourceType: type || undefined,
      }),
      getSettings(req.workspaceId, connector),
      getSummary(req.workspaceId, connector),
      hasCredentials(req.workspaceId, connector).catch(() => false),
    ]);

    const taxonomy = getTaxonomy(connector);

    res.json({
      connector: {
        id:               connector,
        name:             taxonomy.label,
        icon:             taxonomy.icon,
        category:         taxonomy.category,
        supportsDmPolicy: !!taxonomy.supportsDmPolicy,
        resourceTypes:    taxonomy.resourceTypes,
      },
      connected,
      settings: {
        autoAllowNew:     settings.autoAllowNew,
        dmPolicy:         settings.dmPolicy,
        ungoverned:       settings.legacyGrandfathered === true,
        lastDiscoveredAt: settings.lastDiscoveredAt,
      },
      summary,
      resources: resources.map(r => ({
        resourceType: r.resourceType,
        resourceId:   r.resourceId,
        resourceName: r.resourceName,
        parentId:     r.parentId,
        allowed:      r.allowed,
        metadata:     r.metadata,
        lastSyncedAt: r.lastSyncedAt,
        discoveredAt: r.discoveredAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /:connector/discover — real provider API ─────────────────────────────

router.post('/:connector/discover', requireGoverned, authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { connector } = req.params;
    const result = await runDiscovery(req.workspaceId, connector);

    await audit(req, connector, 'discover', {
      discovered:    result.discovered,
      created:       result.created,
      seededAllowed: result.seededAllowed,
    });

    broadcastToWorkspace(req.workspaceId, 'INTEGRATION_PERMISSIONS_UPDATED', {
      connector,
      action:  'discover',
      summary: result.summary,
      ts:      Date.now(),
    });

    res.json(result);
  } catch (err) {
    if (err instanceof NotConnectedError || err.code === 'NOT_CONNECTED') {
      return next(new AppError(
        `${err.connector ?? req.params.connector} is not connected for this workspace. ` +
        'Connect it first, then discover its resources.',
        409,
        'NOT_CONNECTED',
      ));
    }
    next(err);
  }
});

// ── PUT /:connector/resources — bulk allow/hide ───────────────────────────────

router.put('/:connector/resources', requireGoverned, authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { connector } = req.params;
    const { changes }   = req.body;

    if (!Array.isArray(changes) || !changes.length) {
      throw new ValidationError('changes[] is required');
    }

    const applied = await setAllowed(req.workspaceId, connector, changes, {
      userId: req.user.id ?? req.user.userId ?? null,
    });

    const summary = await getSummary(req.workspaceId, connector);

    await audit(req, connector, 'update', {
      requested: changes.length,
      applied:   applied.length,
      allowed:   applied.filter(a => a.allowed).map(a => a.resourceId),
      hidden:    applied.filter(a => !a.allowed).map(a => a.resourceId),
    });

    broadcastToWorkspace(req.workspaceId, 'INTEGRATION_PERMISSIONS_UPDATED', {
      connector,
      action:  'update',
      changed: applied.length,
      summary,
      ts:      Date.now(),
    });

    res.json({ applied, summary });
  } catch (err) {
    next(err);
  }
});

// ── POST /:connector/bulk — select all / none ─────────────────────────────────

router.post('/:connector/bulk', requireGoverned, authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { connector } = req.params;
    const { allowed, resourceType = null } = req.body;

    if (typeof allowed !== 'boolean') {
      throw new ValidationError('allowed (boolean) is required');
    }

    const { count } = await setAllForConnector(req.workspaceId, connector, allowed, {
      resourceType,
      userId: req.user.id ?? req.user.userId ?? null,
    });

    const summary = await getSummary(req.workspaceId, connector);

    await audit(req, connector, 'bulk', { allowed, resourceType, count });

    broadcastToWorkspace(req.workspaceId, 'INTEGRATION_PERMISSIONS_UPDATED', {
      connector,
      action: 'bulk',
      allowed,
      count,
      summary,
      ts: Date.now(),
    });

    res.json({ count, summary });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /:connector/settings ────────────────────────────────────────────────

const DM_POLICIES = new Set(['NEVER', 'BOT_ONLY', 'SELECTED', 'ALL']);

router.patch('/:connector/settings', requireGoverned, authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { connector } = req.params;
    const { autoAllowNew, dmPolicy } = req.body;

    if (dmPolicy !== undefined && !DM_POLICIES.has(dmPolicy)) {
      throw new ValidationError(`dmPolicy must be one of ${[...DM_POLICIES].join(', ')}`);
    }
    if (dmPolicy !== undefined && !CONNECTOR_TAXONOMY[connector]?.supportsDmPolicy) {
      throw new ValidationError(`${connector} does not support a DM policy`);
    }

    const settings = await updateSettings(req.workspaceId, connector, { autoAllowNew, dmPolicy });

    await audit(req, connector, 'settings', { autoAllowNew, dmPolicy });

    broadcastToWorkspace(req.workspaceId, 'INTEGRATION_PERMISSIONS_UPDATED', {
      connector,
      action: 'settings',
      ts:     Date.now(),
    });

    res.json({
      autoAllowNew: settings.autoAllowNew,
      dmPolicy:     settings.dmPolicy,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /:connector/audit ─────────────────────────────────────────────────────

router.get('/:connector/audit', requireGoverned, authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { connector } = req.params;

    const entries = await prisma.auditLog.findMany({
      where: {
        workspaceId: req.workspaceId,
        resource:    `connector:${connector}`,
        action:      { startsWith: 'integration_permissions.' },
      },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });

    res.json({
      entries: entries.map(e => ({
        id:        e.id,
        action:    e.action.replace('integration_permissions.', ''),
        userId:    e.userId,
        metadata:  e.metadata,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
