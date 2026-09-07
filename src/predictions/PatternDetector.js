/**
 * PatternDetector — finds recurring, causal-ish patterns in event history that
 * precede problems. Deterministic co-occurrence detection, not ML: e.g.
 * deployments closely followed by incidents, or repeated incidents on the same
 * resource.
 */

const DEPLOY_INCIDENT_WINDOW = 48 * 3_600_000; // 48h

/**
 * @param {Array} events chronological unified events
 * @returns {{ deployIncidentLinks, recurringIncidentResources, incidentClusters }}
 */
export function detectPatterns(events = []) {
  const deployments = events.filter(e => e.eventType === 'deployment');
  const incidents = events.filter(e => e.eventType === 'incident' || e.eventType === 'security');

  // Deployment → incident within 48h.
  let deployIncidentLinks = 0;
  for (const dep of deployments) {
    const dt = new Date(dep.timestamp).getTime();
    if (incidents.some(inc => { const it = new Date(inc.timestamp).getTime(); return it >= dt && it - dt <= DEPLOY_INCIDENT_WINDOW; })) deployIncidentLinks++;
  }

  // Resources hit by more than one incident.
  const byResource = {};
  for (const inc of incidents) {
    const key = inc.correlationId || inc.entity?.id || inc.metadata?.channel || 'unknown';
    byResource[key] = (byResource[key] || 0) + 1;
  }
  const recurringIncidentResources = Object.entries(byResource).filter(([, n]) => n >= 2).length;

  return {
    deployIncidentLinks,
    deployIncidentRate: deployments.length ? +(deployIncidentLinks / deployments.length).toFixed(2) : 0,
    recurringIncidentResources,
    incidentCount: incidents.length,
    deploymentCount: deployments.length,
  };
}
