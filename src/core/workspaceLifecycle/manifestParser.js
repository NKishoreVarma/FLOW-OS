import { hasDatasetType } from './datasetRegistry.js';

export const ENGINE_VERSION = '2.0';
export const SCHEMA_VERSION_FLOOR = '1.0';

function isVersionCompatible(version) {
  if (!version) return false;
  const [major, minor = 0] = version.split('.').map(Number);
  const [floorMaj, floorMin = 0] = SCHEMA_VERSION_FLOOR.split('.').map(Number);
  return major > floorMaj || (major === floorMaj && minor >= floorMin);
}

export function getCompatibilityStatus(schemaVersion) {
  if (!schemaVersion) return 'INCOMPATIBLE';
  if (!isVersionCompatible(schemaVersion)) return 'INCOMPATIBLE';
  // DEPRECATED branch reserved for when 2.x schema floor is established
  return 'COMPATIBLE';
}

export function parseManifest(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['Manifest must be a JSON object'],
      warnings: [],
      schemaVersion: null,
      engineVersion: null,
      organization: null,
      datasets: [],
      rawManifest: raw,
    };
  }

  const { schemaVersion, engineVersion = null, organization, datasets } = raw;
  const errors = [];
  const warnings = [];

  if (!schemaVersion) {
    errors.push('manifest.schemaVersion is required');
  } else if (getCompatibilityStatus(schemaVersion) === 'INCOMPATIBLE') {
    errors.push(`schemaVersion "${schemaVersion}" is below minimum supported floor "${SCHEMA_VERSION_FLOOR}"`);
  }

  if (!organization?.name) errors.push('manifest.organization.name is required');
  if (!organization?.slug) errors.push('manifest.organization.slug is required');

  if (!Array.isArray(datasets) || datasets.length === 0) {
    errors.push('manifest.datasets must be a non-empty array');
  }

  const parsedDatasets = [];
  for (const [i, entry] of (Array.isArray(datasets) ? datasets : []).entries()) {
    if (!entry.type) {
      errors.push(`datasets[${i}] missing required field "type"`);
      continue;
    }
    if (!hasDatasetType(entry.type)) {
      warnings.push(`datasets[${i}] type "${entry.type}" is unknown — will be skipped during import`);
    }
    parsedDatasets.push({ type: entry.type, file: entry.file ?? null });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schemaVersion: schemaVersion ?? null,
    engineVersion: engineVersion ?? null,
    organization: organization ?? null,
    datasets: parsedDatasets,
    rawManifest: raw,
  };
}
