import db          from '../../config/db.js';
import { logger }  from '../../utils/logger.js';

/**
 * ExtensionRegistry — durable store for installed extension metadata.
 *
 * The ExtensionLoader manages in-memory lifecycle; this registry persists
 * the installed state to PostgreSQL so extensions survive server restarts.
 *
 * Table: extension_installations
 *   - id (PK), extension_id, version, manifest_json, status, installed_at,
 *     updated_at, installed_by, workspace_id (nullable for global extensions)
 */

export class ExtensionRegistry {
  async register(manifest, installedBy, workspaceId = null) {
    const { rows } = await db.query(
      `INSERT INTO extension_installations
         (extension_id, version, manifest_json, status, installed_by, workspace_id, installed_at, updated_at)
       VALUES ($1, $2, $3, 'enabled', $4, $5, NOW(), NOW())
       ON CONFLICT (extension_id, COALESCE(workspace_id, ''))
       DO UPDATE SET
         version       = EXCLUDED.version,
         manifest_json = EXCLUDED.manifest_json,
         status        = 'enabled',
         updated_at    = NOW()
       RETURNING id`,
      [manifest.id, manifest.version, JSON.stringify(manifest), installedBy, workspaceId],
    );
    logger('extensions', `registered: ${manifest.id}@${manifest.version}`);
    return rows[0].id;
  }

  async setStatus(extensionId, status, workspaceId = null) {
    await db.query(
      `UPDATE extension_installations
         SET status = $1, updated_at = NOW()
       WHERE extension_id = $2 AND COALESCE(workspace_id, '') = COALESCE($3, '')`,
      [status, extensionId, workspaceId],
    );
  }

  async remove(extensionId, workspaceId = null) {
    await db.query(
      `DELETE FROM extension_installations
       WHERE extension_id = $1 AND COALESCE(workspace_id, '') = COALESCE($2, '')`,
      [extensionId, workspaceId],
    );
    logger('extensions', `removed: ${extensionId}`);
  }

  async get(extensionId, workspaceId = null) {
    const { rows } = await db.query(
      `SELECT * FROM extension_installations
       WHERE extension_id = $1 AND COALESCE(workspace_id, '') = COALESCE($2, '')
       LIMIT 1`,
      [extensionId, workspaceId],
    );
    return rows[0] || null;
  }

  async listAll(workspaceId = null, status = null) {
    const conditions = ['1=1'];
    const params     = [];

    if (workspaceId !== undefined) {
      conditions.push(`COALESCE(workspace_id, '') = COALESCE($${params.length + 1}, '')`);
      params.push(workspaceId);
    }
    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    const { rows } = await db.query(
      `SELECT * FROM extension_installations
       WHERE ${conditions.join(' AND ')}
       ORDER BY installed_at DESC`,
      params,
    );
    return rows;
  }

  async getInstalledVersionMap(workspaceId = null) {
    const rows = await this.listAll(workspaceId);
    return new Map(rows.map(r => [r.extension_id, r.version]));
  }

  async exists(extensionId, workspaceId = null) {
    const { rows } = await db.query(
      `SELECT 1 FROM extension_installations
       WHERE extension_id = $1 AND COALESCE(workspace_id, '') = COALESCE($2, '')
       LIMIT 1`,
      [extensionId, workspaceId],
    );
    return rows.length > 0;
  }
}

export const extensionRegistry = new ExtensionRegistry();
