/**
 * Prompt Store — versioned, A/B-testable prompt management.
 *
 * Every prompt has a name, a version number, and an active flag.
 * Multiple versions can be active simultaneously with different ab_weight values
 * for traffic-split testing. The Brain always calls getPrompt(name) — it never
 * references a version number directly.
 */
import { query } from '../../config/db.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieve the active prompt for a name. Respects A/B weights.
 * Falls back to a literal string if no versioned prompt exists.
 */
export async function getPrompt(name, variables = {}) {
  try {
    const r = await query(
      `SELECT id, version, content, ab_weight
       FROM prompt_versions
       WHERE name = $1 AND active = true
       ORDER BY ab_weight DESC, version DESC`,
      [name]
    );
    if (r.rows.length === 0) return null;

    const selected = _weightedSelect(r.rows);
    return { content: _interpolate(selected.content, variables), version: selected.version, promptId: selected.id };
  } catch {
    return null;
  }
}

/**
 * Create a new version of a named prompt.
 * The new version is NOT active by default — call activate() to make it live.
 */
export async function createVersion(name, content, { description, tags = [], abWeight = 1.0, createdBy } = {}) {
  const versionRes = await query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM prompt_versions WHERE name = $1`,
    [name]
  );
  const version = versionRes.rows[0]?.next ?? 1;

  const r = await query(
    `INSERT INTO prompt_versions (name, version, content, description, tags, ab_weight, active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, false, $7) RETURNING *`,
    [name, version, content, description ?? null, tags, abWeight, createdBy ?? null]
  );
  return r.rows[0];
}

/**
 * Activate a specific version. Optionally deactivate all other versions.
 */
export async function activate(name, version, { exclusive = false } = {}) {
  if (exclusive) {
    await query(`UPDATE prompt_versions SET active = false WHERE name = $1`, [name]);
  }
  await query(
    `UPDATE prompt_versions SET active = true WHERE name = $1 AND version = $2`,
    [name, version]
  );
}

/**
 * Deactivate a specific version.
 */
export async function deactivate(name, version) {
  await query(
    `UPDATE prompt_versions SET active = false WHERE name = $1 AND version = $2`,
    [name, version]
  );
}

/**
 * Roll back to the previous active version.
 */
export async function rollback(name) {
  // Deactivate all active, then activate the highest non-active version
  const r = await query(
    `SELECT version FROM prompt_versions
     WHERE name = $1 AND active = false
     ORDER BY version DESC LIMIT 1`,
    [name]
  );
  if (r.rows.length === 0) throw new Error(`No previous version to roll back to for prompt "${name}"`);
  await query(`UPDATE prompt_versions SET active = false WHERE name = $1`, [name]);
  await activate(name, r.rows[0].version, { exclusive: false });
  return r.rows[0].version;
}

/**
 * List all versions for a prompt name.
 */
export async function listVersions(name) {
  const r = await query(
    `SELECT id, name, version, description, tags, active, ab_weight, created_by, created_at
     FROM prompt_versions WHERE name = $1 ORDER BY version DESC`,
    [name]
  );
  return r.rows;
}

/**
 * List all distinct prompt names.
 */
export async function listPromptNames() {
  const r = await query(
    `SELECT DISTINCT name, MAX(version) AS latest_version,
            COUNT(*) FILTER (WHERE active) AS active_versions,
            MAX(created_at) AS last_updated
     FROM prompt_versions GROUP BY name ORDER BY name`
  );
  return r.rows;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _weightedSelect(rows) {
  if (rows.length === 1) return rows[0];
  const totalWeight = rows.reduce((sum, r) => sum + parseFloat(r.ab_weight ?? 1), 0);
  let rand = Math.random() * totalWeight;
  for (const row of rows) {
    rand -= parseFloat(row.ab_weight ?? 1);
    if (rand <= 0) return row;
  }
  return rows[0];
}

function _interpolate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}
