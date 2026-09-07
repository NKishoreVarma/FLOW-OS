import { Router }                  from 'express';
import { parseManifest }           from '../extensions/manifest/ManifestParser.js';
import { extensionRegistry }       from '../extensions/registry/ExtensionRegistry.js';
import { marketplaceRegistry }     from '../extensions/registry/MarketplaceRegistry.js';
import { getLoader }               from '../extensions/index.js';
import { ValidationError, AppError } from '../core/errors/index.js';
import { authorize }               from '../core/middleware/authorize.js';

const router = Router();

const workspaceGuard = (req, _res, next) => {
  if (!req.headers['workspace-id']) {
    return next(new ValidationError('workspace-id header is required'));
  }
  next();
};

// GET /api/extensions — list installed extensions
router.get('/', workspaceGuard, async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    const installed   = await marketplaceRegistry.getInstalled(workspaceId);
    const loader      = getLoader();
    const live        = loader ? loader.listLoaded() : [];
    res.json({ installed, live, total: installed.length });
  } catch (err) { next(err); }
});

// GET /api/extensions/marketplace — browse available extensions
router.get('/marketplace', workspaceGuard, async (req, res, next) => {
  try {
    const { category, search, limit } = req.query;
    const available = marketplaceRegistry.listAvailable({
      category,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ extensions: available, total: available.length });
  } catch (err) { next(err); }
});

// GET /api/extensions/updates — check for available updates
router.get('/updates', workspaceGuard, async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    const updates     = await marketplaceRegistry.checkUpdates(workspaceId);
    res.json({ updates, total: updates.length });
  } catch (err) { next(err); }
});

// GET /api/extensions/:id — single extension detail
router.get('/:id', workspaceGuard, async (req, res, next) => {
  try {
    const { id }      = req.params;
    const workspaceId = req.headers['workspace-id'];
    const record      = await extensionRegistry.get(id, workspaceId);
    const catalog     = marketplaceRegistry.getPackage(id);
    const loader      = getLoader();
    const health      = loader ? await marketplaceRegistry.getHealth(id, loader) : null;

    if (!record && !catalog) {
      return next(new AppError(404, `Extension "${id}" not found`));
    }

    res.json({ id, record, catalog, health });
  } catch (err) { next(err); }
});

// POST /api/extensions/validate — validate a manifest (dry-run, no install)
router.post('/validate', workspaceGuard, async (req, res, next) => {
  try {
    const { manifest: errors } = req.body;
    const raw = req.body.manifest ?? req.body;
    const result = parseManifest(raw);
    if (result.errors.length) {
      return res.status(400).json({ valid: false, errors: result.errors });
    }
    res.json({ valid: true, manifest: result.manifest });
  } catch (err) { next(err); }
});

// POST /api/extensions/install — install an extension
router.post('/install', workspaceGuard, authorize(['OWNER', 'ADMIN']), async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    const raw         = req.body.manifest ?? req.body;
    const { manifest, errors } = parseManifest(raw);
    if (errors.length) throw new ValidationError(`Invalid manifest: ${errors.join(', ')}`);

    const loader = getLoader();
    if (!loader) throw new AppError(503, 'Extension system not initialized');

    const { loaded, skipped, errors: loadErrors } = await loader.loadAll([manifest]);
    if (loadErrors.length) throw new AppError(400, loadErrors.map(e => e.error || e).join(', '));

    await extensionRegistry.register(manifest, req.user.id, workspaceId);
    marketplaceRegistry.registerBuiltin(manifest);

    res.status(201).json({
      extensionId: manifest.id,
      version:     manifest.version,
      status:      loaded.includes(manifest.id) ? 'installed' : 'already_loaded',
    });
  } catch (err) { next(err); }
});

// PUT /api/extensions/upgrade — upgrade an extension
router.put('/upgrade', workspaceGuard, authorize(['OWNER', 'ADMIN']), async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    const raw         = req.body.manifest ?? req.body;
    const { manifest, errors } = parseManifest(raw);
    if (errors.length) throw new ValidationError(`Invalid manifest: ${errors.join(', ')}`);

    const loader = getLoader();
    if (!loader) throw new AppError(503, 'Extension system not initialized');

    const result = await loader.upgrade(manifest);
    await extensionRegistry.register(manifest, req.user.id, workspaceId);

    res.json({ extensionId: manifest.id, ...result });
  } catch (err) { next(err); }
});

// POST /api/extensions/:id/enable — enable a loaded extension
router.post('/:id/enable', workspaceGuard, authorize(['OWNER', 'ADMIN']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const loader = getLoader();
    if (!loader) throw new AppError(503, 'Extension system not initialized');
    await loader.enable(id);
    await extensionRegistry.setStatus(id, 'enabled', req.headers['workspace-id']);
    res.json({ extensionId: id, status: 'enabled' });
  } catch (err) { next(err); }
});

// POST /api/extensions/:id/disable — disable an extension
router.post('/:id/disable', workspaceGuard, authorize(['OWNER', 'ADMIN']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const loader = getLoader();
    if (!loader) throw new AppError(503, 'Extension system not initialized');
    await loader.disable(id);
    await extensionRegistry.setStatus(id, 'disabled', req.headers['workspace-id']);
    res.json({ extensionId: id, status: 'disabled' });
  } catch (err) { next(err); }
});

// DELETE /api/extensions/:id — uninstall an extension
router.delete('/:id', workspaceGuard, authorize(['OWNER']), async (req, res, next) => {
  try {
    const { id }      = req.params;
    const workspaceId = req.headers['workspace-id'];
    const loader      = getLoader();
    if (!loader) throw new AppError(503, 'Extension system not initialized');

    await loader.uninstall(id);
    await extensionRegistry.remove(id, workspaceId);
    res.json({ extensionId: id, status: 'uninstalled' });
  } catch (err) { next(err); }
});

// GET /api/extensions/:id/health — health check a specific extension
router.get('/:id/health', workspaceGuard, async (req, res, next) => {
  try {
    const loader = getLoader();
    const health = loader
      ? await marketplaceRegistry.getHealth(req.params.id, loader)
      : { extensionId: req.params.id, status: 'not_loaded' };
    res.json(health);
  } catch (err) { next(err); }
});

export default router;
