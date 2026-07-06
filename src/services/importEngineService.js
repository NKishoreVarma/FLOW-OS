/**
 * FLOW OS — Universal Company Import Engine Service (legacy shim)
 *
 * Delegates to the Workspace Lifecycle Engine (src/core/workspaceLifecycle/).
 * This module is kept for backward compatibility with /api/import routes only.
 * New callers should use runLifecycleOperation() directly or POST /api/lifecycle/import.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runLifecycleOperation } from '../core/workspaceLifecycle/lifecycleEngine.js';
import { ValidationError } from '../core/errors/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '../../demo-company/exports');

function loadDemoDatasets() {
  const manifestPath = path.join(DEMO_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const datasets = {};
  for (const entry of manifest.datasets) {
    const filePath = path.join(DEMO_DIR, entry.file);
    if (fs.existsSync(filePath)) datasets[entry.type] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return { manifest, datasets };
}

// Process-level stub retained so existing /api/import/history route compiles.
export const importHistory = [];

const LEGACY_TYPE_MAP = {
  departments: 'departments',
  teams: 'departments',
  users: 'employees',
  projects: 'projects',
  customers: 'customers',
  repositories: 'repositories',
  knowledge: 'documents',
  timeline: 'timeline',
  relationships: 'relationships',
};

function buildManifestFromLegacyPayload(payload) {
  return {
    schemaVersion: '1.0',
    organization: payload.organization ?? { name: 'Imported Workspace', slug: 'imported' },
    datasets: Object.keys(LEGACY_TYPE_MAP)
      .filter(k => payload[k]?.length > 0)
      .map(k => ({ type: LEGACY_TYPE_MAP[k] })),
  };
}

function buildDatasetsFromLegacyPayload(payload) {
  const ds = {};
  if (payload.departments?.length) ds.departments = payload.departments;
  if (payload.teams?.length) ds.departments = [...(ds.departments ?? []), ...payload.teams];
  if (payload.users?.length) ds.employees = payload.users.map(u => ({ ...u, name: u.fullName ?? u.name }));
  if (payload.projects?.length) ds.projects = payload.projects;
  if (payload.customers?.length) ds.customers = payload.customers;
  if (payload.repositories?.length) ds.repositories = payload.repositories;
  if (payload.knowledge?.length) ds.documents = payload.knowledge.map(k => ({ ...k, content: k.body ?? k.content }));
  if (payload.timeline?.length) ds.timeline = payload.timeline;
  if (payload.relationships?.length) ds.relationships = payload.relationships;
  return ds;
}

/**
 * Validates import payloads using the legacy field schema.
 * Retained for backward compatibility with POST /api/import/validate.
 */
// Kept as standalone to avoid shape-translation overhead; /api/import/validate is a legacy compat path only.
export function validateImportPayload(payload) {
  const errors = [];
  const brokenReferences = [];
  const duplicates = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload is empty or not a valid object.'], brokenReferences, duplicates, statistics: {} };
  }

  const { organization, departments = [], teams = [], users = [], projects = [], customers = [], repositories = [], knowledge = [], timeline = [], relationships = [] } = payload;

  if (!organization || !organization.name || !organization.slug) {
    errors.push('Organization name and slug are required fields.');
  }

  const definedIds = new Set();
  const emails = new Set();

  departments.forEach((d, idx) => {
    if (!d.id || !d.name) errors.push(`Department at index ${idx} is missing id or name.`);
    if (definedIds.has(d.id)) duplicates.push(`Duplicate Department ID detected: "${d.id}"`);
    definedIds.add(d.id);
  });

  teams.forEach((t, idx) => {
    if (!t.id || !t.name) errors.push(`Team at index ${idx} is missing id or name.`);
    if (definedIds.has(t.id)) duplicates.push(`Duplicate Team ID detected: "${t.id}"`);
    definedIds.add(t.id);
    if (t.departmentId && !definedIds.has(t.departmentId)) {
      brokenReferences.push(`Team "${t.id}" references non-existent Department ID: "${t.departmentId}"`);
    }
  });

  users.forEach((u, idx) => {
    if (!u.id || !u.email || !u.fullName) errors.push(`User at index ${idx} is missing id, email or fullName.`);
    if (definedIds.has(u.id)) duplicates.push(`Duplicate User ID detected: "${u.id}"`);
    definedIds.add(u.id);
    if (emails.has(u.email)) duplicates.push(`Duplicate User email detected: "${u.email}"`);
    emails.add(u.email);
    if (u.teamId && !definedIds.has(u.teamId)) {
      brokenReferences.push(`User "${u.id}" references non-existent Team ID: "${u.teamId}"`);
    }
  });

  projects.forEach((p, idx) => {
    if (!p.id || !p.name) errors.push(`Project at index ${idx} is missing id or name.`);
    if (definedIds.has(p.id)) duplicates.push(`Duplicate Project ID detected: "${p.id}"`);
    definedIds.add(p.id);
    if (p.teamId && !definedIds.has(p.teamId)) {
      brokenReferences.push(`Project "${p.id}" references non-existent Team ID: "${p.teamId}"`);
    }
  });

  customers.forEach((c, idx) => {
    if (!c.id || !c.name) errors.push(`Customer at index ${idx} is missing id or name.`);
    if (definedIds.has(c.id)) duplicates.push(`Duplicate Customer ID detected: "${c.id}"`);
    definedIds.add(c.id);
  });

  repositories.forEach((r, idx) => {
    if (!r.id || !r.name) errors.push(`Repository at index ${idx} is missing id or name.`);
    if (definedIds.has(r.id)) duplicates.push(`Duplicate Repository ID detected: "${r.id}"`);
    definedIds.add(r.id);
    if (r.projectId && !definedIds.has(r.projectId)) {
      brokenReferences.push(`Repository "${r.id}" references non-existent Project ID: "${r.projectId}"`);
    }
  });

  knowledge.forEach((k, idx) => {
    if (!k.id || !k.title || !k.body) errors.push(`Knowledge doc at index ${idx} is missing id, title or body.`);
    if (definedIds.has(k.id)) duplicates.push(`Duplicate Knowledge ID detected: "${k.id}"`);
    definedIds.add(k.id);
  });

  timeline.forEach((evt, idx) => {
    if (!evt.id || !evt.type || !evt.title) errors.push(`Timeline event at index ${idx} is missing id, type or title.`);
    if (definedIds.has(evt.id)) duplicates.push(`Duplicate Timeline ID detected: "${evt.id}"`);
    definedIds.add(evt.id);
  });

  relationships.forEach((rel, idx) => {
    if (!rel.sourceId || !rel.targetId || !rel.type) {
      errors.push(`Relationship at index ${idx} is missing sourceId, targetId or type.`);
      return;
    }
    if (!definedIds.has(rel.sourceId)) {
      brokenReferences.push(`Relationship at index ${idx} points to non-existent sourceId: "${rel.sourceId}"`);
    }
    if (!definedIds.has(rel.targetId)) {
      brokenReferences.push(`Relationship at index ${idx} points to non-existent targetId: "${rel.targetId}"`);
    }
  });

  const statistics = {
    departmentsCount: departments.length,
    teamsCount: teams.length,
    usersCount: users.length,
    projectsCount: projects.length,
    customersCount: customers.length,
    repositoriesCount: repositories.length,
    knowledgeCount: knowledge.length,
    timelineCount: timeline.length,
    relationshipsCount: relationships.length,
  };

  return { valid: errors.length === 0, errors, brokenReferences, duplicates, statistics };
}

/**
 * Executes a workspace import by delegating to the Lifecycle Engine.
 * Accepts the legacy flat-payload shape from POST /api/import, or the string "demo"
 * to import the bundled Helios Software Inc. demo company.
 */
export async function executeImport(workspaceId, rawPayload) {
  // Demo shortcut: OnboardingWizard sends { payload: "demo" }
  if (rawPayload === 'demo' || rawPayload?.demo === true) {
    const demo = loadDemoDatasets();
    if (!demo) throw new ValidationError('Demo company datasets not found. Run: cd demo-company && npm run generate');
    return runLifecycleOperation('IMPORT', workspaceId, demo).then(record => ({
      importId: record.importId,
      workspaceId: record.workspaceId,
      organization: demo.manifest.organization?.name ?? 'Helios Software Inc.',
      timestamp: record.completedAt?.toISOString() ?? new Date().toISOString(),
      statistics: record.statistics,
      graphMetrics: record.graphMetrics,
      validation: { valid: record.status === 'COMPLETED', errors: record.errors ?? [] },
    }));
  }

  const payload = rawPayload ?? {};

  const manifest = payload._manifest ?? buildManifestFromLegacyPayload(payload);
  const datasets = payload._datasets ?? buildDatasetsFromLegacyPayload(payload);

  if (manifest.datasets.length === 0) {
    throw new ValidationError('Import payload contains no recognized dataset fields');
  }

  const record = await runLifecycleOperation('IMPORT', workspaceId, { manifest, datasets });

  return {
    importId: record.importId,
    workspaceId: record.workspaceId,
    organization: manifest.organization?.name ?? String(workspaceId),
    timestamp: record.completedAt?.toISOString() ?? new Date().toISOString(),
    statistics: record.statistics,
    graphMetrics: record.graphMetrics,
    validation: { valid: record.status === 'COMPLETED', errors: record.errors ?? [] },
  };
}
