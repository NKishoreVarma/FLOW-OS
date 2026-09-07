import { validatePermissions } from './PermissionModel.js';

export const MANIFEST_VERSION = '1.0';
export const FLOW_VERSION     = '14.0.0';

const REQUIRED_FIELDS = [
  'id', 'name', 'version', 'author', 'description',
  'category', 'license', 'permissions', 'minimumFlowVersion',
];

const VALID_CATEGORIES = [
  'connector', 'agent_pack', 'workflow_pack', 'capability_pack',
  'dashboard_widget', 'executive_report', 'autonomy_policy',
  'prediction_model', 'event_handler', 'knowledge_provider',
];

const VALID_LICENSES = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'PROPRIETARY', 'FLOW-ENTERPRISE'];

/**
 * Manually compare two semver strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareSemver(a, b) {
  const parse = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  return (aMaj - bMaj) || (aMin - bMin) || (aPat - bPat);
}

export function isValidSemver(v) {
  return /^\d+\.\d+\.\d+$/.test(String(v));
}

// Accept bare semver OR common constraint prefixes: >=, <=, >, <, ^, ~
export function isValidConstraint(v) {
  return /^([~^]|[<>]=?)?(\d+\.\d+\.\d+)$/.test(String(v).trim());
}

/**
 * Parse and validate an extension manifest JSON object.
 * Returns { manifest, errors } — errors is empty on success.
 *
 * Does NOT load or execute any code.
 */
export function parseManifest(raw) {
  const errors = [];

  if (!raw || typeof raw !== 'object') {
    return { manifest: null, errors: ['Manifest must be a JSON object'] };
  }

  // Required field presence
  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null || raw[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length) return { manifest: null, errors };

  // ID format: reverse-dns style, e.g. com.acme.github-connector
  if (!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(raw.id)) {
    errors.push(`Invalid id "${raw.id}" — must be lowercase alphanumeric with dots/hyphens, 3–64 chars`);
  }

  // Version must be semver
  if (!isValidSemver(raw.version)) {
    errors.push(`Invalid version "${raw.version}" — must be semver (MAJOR.MINOR.PATCH)`);
  }

  // minimumFlowVersion must be semver
  if (!isValidSemver(raw.minimumFlowVersion)) {
    errors.push(`Invalid minimumFlowVersion "${raw.minimumFlowVersion}" — must be semver`);
  } else if (compareSemver(raw.minimumFlowVersion, FLOW_VERSION) > 0) {
    errors.push(`Extension requires FLOW ${raw.minimumFlowVersion} but this host is ${FLOW_VERSION}`);
  }

  // Category
  if (!VALID_CATEGORIES.includes(raw.category)) {
    errors.push(`Invalid category "${raw.category}" — must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  // License
  if (!VALID_LICENSES.includes(raw.license)) {
    errors.push(`Invalid license "${raw.license}" — must be one of: ${VALID_LICENSES.join(', ')}`);
  }

  // Permissions array
  if (!Array.isArray(raw.permissions)) {
    errors.push('permissions must be an array');
  } else {
    const { valid, unknown } = validatePermissions(raw.permissions);
    if (!valid) errors.push(`Unknown permissions: ${unknown.join(', ')}`);
  }

  // Dependencies map (optional) — values are semver constraints, not necessarily bare semver
  if (raw.dependencies !== undefined) {
    if (typeof raw.dependencies !== 'object' || Array.isArray(raw.dependencies)) {
      errors.push('dependencies must be a key:version object');
    } else {
      for (const [dep, ver] of Object.entries(raw.dependencies)) {
        if (!isValidConstraint(ver)) errors.push(`Dependency "${dep}" has invalid version constraint "${ver}"`);
      }
    }
  }

  // Entrypoints (optional but validated if present)
  if (raw.entrypoints !== undefined) {
    if (typeof raw.entrypoints !== 'object') {
      errors.push('entrypoints must be an object');
    } else {
      for (const [key, val] of Object.entries(raw.entrypoints)) {
        if (typeof val !== 'string') errors.push(`Entrypoint "${key}" must be a string path`);
      }
    }
  }

  // Routes (optional) — each must have method + path + handler
  if (raw.routes !== undefined) {
    if (!Array.isArray(raw.routes)) {
      errors.push('routes must be an array');
    } else {
      const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      raw.routes.forEach((r, i) => {
        if (!r.method || !VALID_METHODS.includes(r.method.toUpperCase())) {
          errors.push(`routes[${i}].method must be one of ${VALID_METHODS.join('/')}`);
        }
        if (!r.path || typeof r.path !== 'string') errors.push(`routes[${i}].path is required`);
        if (!r.handler || typeof r.handler !== 'string') errors.push(`routes[${i}].handler is required`);
      });
    }
  }

  // Author shape (optional string or object)
  if (raw.author && typeof raw.author === 'object') {
    if (!raw.author.name) errors.push('author.name is required when author is an object');
  }

  if (errors.length) return { manifest: null, errors };

  const manifest = {
    id:                 raw.id,
    name:               raw.name,
    version:            raw.version,
    author:             typeof raw.author === 'string'
      ? { name: raw.author, email: null, url: null }
      : { name: raw.author.name, email: raw.author.email || null, url: raw.author.url || null },
    description:        raw.description,
    category:           raw.category,
    license:            raw.license,
    permissions:        [...raw.permissions],
    minimumFlowVersion: raw.minimumFlowVersion,
    dependencies:       raw.dependencies ? { ...raw.dependencies } : {},
    entrypoints:        raw.entrypoints  ? { ...raw.entrypoints  } : {},
    routes:             raw.routes       ? [...raw.routes]          : [],
    actions:            raw.actions      ? [...raw.actions]          : [],
    events:             raw.events       ? [...raw.events]           : [],
    agents:             raw.agents       ? [...raw.agents]           : [],
    widgets:            raw.widgets      ? [...raw.widgets]          : [],
    migrations:         raw.migrations   ? [...raw.migrations]       : [],
    // Preserve any extra metadata fields
    homepage:           raw.homepage     || null,
    repository:         raw.repository   || null,
    icon:               raw.icon         || null,
    tags:               Array.isArray(raw.tags) ? [...raw.tags] : [],
    _raw:               raw,
  };

  return { manifest, errors: [] };
}

export function getCompatibilityStatus(minimumFlowVersion) {
  const cmp = compareSemver(minimumFlowVersion, FLOW_VERSION);
  if (cmp > 0) return 'incompatible';
  if (cmp === 0) return 'compatible';
  return 'compatible'; // older minimumFlowVersion is always compatible
}
