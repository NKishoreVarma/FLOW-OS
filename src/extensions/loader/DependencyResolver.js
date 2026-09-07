import { satisfies } from './VersionChecker.js';

/**
 * DependencyResolver — topological sort of extensions and dependency satisfaction.
 *
 * Given a set of extension manifests to load, this resolver:
 *   1. Checks that all declared dependencies are present in the set (or already installed)
 *   2. Verifies version constraints are satisfied
 *   3. Returns a load order (dependents after their dependencies)
 *   4. Reports any unresolvable conflicts
 */
export class DependencyResolver {
  /**
   * @param {Map<string, string>} installed  — extensionId → installedVersion (already loaded)
   */
  constructor(installed = new Map()) {
    this.installed = installed;
  }

  /**
   * Resolve load order for a batch of manifests.
   *
   * @param {object[]} manifests — parsed manifest objects
   * @returns {{ order: string[], errors: string[] }}
   *   order  — extension ids in dependency order (safe to load sequentially)
   *   errors — human-readable problems; non-empty means the batch cannot load
   */
  resolve(manifests) {
    const errors = [];
    const byId   = new Map(manifests.map(m => [m.id, m]));

    // Check every dependency is either installed or in the batch
    for (const m of manifests) {
      for (const [depId, constraint] of Object.entries(m.dependencies || {})) {
        const installedVer = this.installed.get(depId);
        const batchVer     = byId.get(depId)?.version;
        const resolvedVer  = installedVer ?? batchVer;

        if (!resolvedVer) {
          errors.push(`"${m.id}" requires "${depId}" but it is not installed`);
          continue;
        }
        if (!satisfies(resolvedVer, constraint)) {
          errors.push(
            `"${m.id}" requires "${depId}@${constraint}" but ${resolvedVer} is installed`,
          );
        }
      }
    }

    if (errors.length) return { order: [], errors };

    // Kahn's algorithm — topological sort
    const graph    = new Map();
    const inDegree = new Map();

    for (const m of manifests) {
      graph.set(m.id, []);
      inDegree.set(m.id, 0);
    }

    for (const m of manifests) {
      for (const depId of Object.keys(m.dependencies || {})) {
        if (byId.has(depId)) {
          graph.get(depId).push(m.id);
          inDegree.set(m.id, (inDegree.get(m.id) || 0) + 1);
        }
      }
    }

    const queue = [...inDegree.entries()]
      .filter(([, d]) => d === 0)
      .map(([id]) => id);

    const order = [];

    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const neighbor of (graph.get(id) || [])) {
        const deg = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) queue.push(neighbor);
      }
    }

    if (order.length !== manifests.length) {
      errors.push('Circular dependency detected — cannot determine load order');
      return { order: [], errors };
    }

    return { order, errors: [] };
  }
}
