/**
 * testContext — creates and tears down ephemeral test workspaces.
 *
 * Each test run gets an isolated (workspaceId, orgId) pair so tests cannot
 * bleed into each other or into production data. Cleanup is always attempted
 * on teardown even if tests fail.
 */

import crypto from 'crypto';
import db      from '../../config/db.js';

const CREATED_WORKSPACES = new Set();

/**
 * Create an ephemeral test workspace.
 * Returns { workspaceId, orgId, userId } — all prefixed with 'test-'.
 */
export async function createTestContext(label = 'default') {
  const suffix      = crypto.randomBytes(5).toString('hex');
  const workspaceId = `test-ws-${label}-${suffix}`;
  const orgId       = `test-org-${label}-${suffix}`;
  const userId      = `test-user-${suffix}`;

  // Use raw SQL — Prisma may not be available in all validation environments
  try {
    await db.query(
      `INSERT INTO "Org" (id, name, slug, plan, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'professional', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [orgId, `Test Org ${suffix}`, `test-${suffix}`],
    );

    await db.query(
      `INSERT INTO "Workspace" (id, name, "externalId", "orgId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [workspaceId, `Test Workspace ${suffix}`, workspaceId, orgId],
    );

    await db.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", "orgId", role, "createdAt", "updatedAt")
       VALUES ($1, $2, 'Test User', 'hash', $3, 'OWNER', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [userId, `test-${suffix}@flow-test.internal`, orgId],
    );
  } catch { /* tables may not exist in all environments — tests handle gracefully */ }

  CREATED_WORKSPACES.add(workspaceId);
  return { workspaceId, orgId, userId, suffix };
}

/**
 * Destroy a test workspace and all associated data.
 * Safe to call multiple times.
 */
export async function destroyTestContext(ctx) {
  if (!ctx?.workspaceId) return;
  const { workspaceId, orgId } = ctx;

  const tables = [
    'connector_credentials',
    'sync_records',
    'sync_items',
    'dead_letter_queue',
    'webhook_events',
    'webhook_registrations',
    'webhook_notifications',
  ];

  for (const table of tables) {
    await db.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]).catch(() => {});
  }

  await db.query(`DELETE FROM "Workspace" WHERE id = $1`, [workspaceId]).catch(() => {});
  await db.query(`DELETE FROM "User" WHERE "orgId" = $1`, [orgId]).catch(() => {});
  await db.query(`DELETE FROM "Org" WHERE id = $1`, [orgId]).catch(() => {});

  CREATED_WORKSPACES.delete(workspaceId);
}

/**
 * Destroy all test workspaces created during this process lifetime.
 * Call from a process.on('exit') handler in the validation runner.
 */
export async function destroyAllTestContexts() {
  for (const workspaceId of CREATED_WORKSPACES) {
    await destroyTestContext({ workspaceId }).catch(() => {});
  }
}

/**
 * Check if the database is reachable.
 * Used by suites to skip DB-dependent tests gracefully.
 */
export async function isDatabaseReachable() {
  try {
    await db.query('SELECT 1');
    return true;
  } catch { return false; }
}

/**
 * Check if Redis is reachable.
 */
export async function isRedisReachable() {
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      connectTimeout: 2000, maxRetriesPerRequest: 1,
    });
    await r.ping();
    await r.quit();
    return true;
  } catch { return false; }
}
