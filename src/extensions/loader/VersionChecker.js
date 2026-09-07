import { compareSemver, isValidSemver, FLOW_VERSION } from '../manifest/ManifestParser.js';

export { compareSemver, isValidSemver };

/**
 * Check whether an extension version satisfies a dependency constraint.
 *
 * Constraints are simple semver range strings (no npm-range syntax):
 *   "1.2.3"      — exact match
 *   ">=1.2.0"    — minimum version
 *   "^2.0.0"     — compatible major (>= 2.0.0 and < 3.0.0)
 *   "~1.4.0"     — compatible minor (>= 1.4.0 and < 1.5.0)
 */
export function satisfies(version, constraint) {
  if (!isValidSemver(version)) return false;

  const exact = constraint.match(/^(\d+\.\d+\.\d+)$/);
  if (exact) return compareSemver(version, exact[1]) === 0;

  const gte = constraint.match(/^>=(\d+\.\d+\.\d+)$/);
  if (gte) return compareSemver(version, gte[1]) >= 0;

  const lte = constraint.match(/^<=(\d+\.\d+\.\d+)$/);
  if (lte) return compareSemver(version, lte[1]) <= 0;

  const gt = constraint.match(/^>(\d+\.\d+\.\d+)$/);
  if (gt) return compareSemver(version, gt[1]) > 0;

  const lt = constraint.match(/^<(\d+\.\d+\.\d+)$/);
  if (lt) return compareSemver(version, lt[1]) < 0;

  const caret = constraint.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  if (caret) {
    const [, maj, min, pat] = caret.map(Number);
    const floor = `${maj}.${min}.${pat}`;
    const ceil  = `${maj + 1}.0.0`;
    return compareSemver(version, floor) >= 0 && compareSemver(version, ceil) < 0;
  }

  const tilde = constraint.match(/^~(\d+)\.(\d+)\.(\d+)$/);
  if (tilde) {
    const [, maj, min, pat] = tilde.map(Number);
    const floor = `${maj}.${min}.${pat}`;
    const ceil  = `${maj}.${min + 1}.0`;
    return compareSemver(version, floor) >= 0 && compareSemver(version, ceil) < 0;
  }

  return false;
}

/**
 * Determine whether the host FLOW version satisfies the extension's minimum.
 */
export function checkFlowCompatibility(minimumFlowVersion) {
  if (!isValidSemver(minimumFlowVersion)) {
    return { compatible: false, reason: `Invalid minimumFlowVersion: ${minimumFlowVersion}` };
  }
  const compatible = compareSemver(FLOW_VERSION, minimumFlowVersion) >= 0;
  return {
    compatible,
    hostVersion:    FLOW_VERSION,
    requiredVersion: minimumFlowVersion,
    reason: compatible ? null : `FLOW ${FLOW_VERSION} does not satisfy >=${minimumFlowVersion}`,
  };
}

/**
 * Compare two installed extension versions and decide if upgrade should proceed.
 * Returns 'upgrade', 'downgrade', 'same', or 'incompatible'.
 */
export function compareVersions(installed, candidate) {
  if (!isValidSemver(installed) || !isValidSemver(candidate)) return 'incompatible';
  const cmp = compareSemver(candidate, installed);
  if (cmp > 0) return 'upgrade';
  if (cmp < 0) return 'downgrade';
  return 'same';
}
