import { query } from '../../config/db.js';

export const DOMAIN = 'connectors';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  // ── Audit log action outcomes ─────────────────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE outcome = 'success')::int            AS success,
              COUNT(*) FILTER (WHERE outcome = 'failure')::int            AS failure,
              COUNT(*) FILTER (WHERE action LIKE '%sync%')::int           AS sync_total,
              COUNT(*) FILTER (WHERE action LIKE '%sync%' AND outcome = 'success')::int AS sync_success,
              COUNT(*) FILTER (WHERE action LIKE '%oauth%' OR action LIKE '%auth%')::int AS auth_total,
              COUNT(*) FILTER (WHERE action LIKE '%oauth%' AND outcome = 'failure')::int AS auth_failures,
              AVG(EXTRACT(EPOCH FROM ("createdAt" - "createdAt")) * 1000)::numeric AS avg_latency_ms
       FROM "AuditLog"
       WHERE "workspaceId" = $1
         AND "createdAt" > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalActions   = row.total        ?? 0;
    metrics.successActions = row.success       ?? 0;
    metrics.failedActions  = row.failure       ?? 0;
    metrics.syncTotal      = row.sync_total    ?? 0;
    metrics.syncSuccess    = row.sync_success  ?? 0;
    metrics.authTotal      = row.auth_total    ?? 0;
    metrics.authFailures   = row.auth_failures ?? 0;

    metrics.actionSuccessRate = metrics.totalActions > 0
      ? Math.round((metrics.successActions / metrics.totalActions) * 100)
      : null;
    metrics.syncSuccessRate = metrics.syncTotal > 0
      ? Math.round((metrics.syncSuccess / metrics.syncTotal) * 100)
      : null;
    metrics.authFailureRate = metrics.authTotal > 0
      ? Math.round((metrics.authFailures / metrics.authTotal) * 100)
      : null;

    if (metrics.actionSuccessRate !== null && metrics.actionSuccessRate < 80)
      findings.push(`Action success rate is ${metrics.actionSuccessRate}% — below 80% threshold.`);
    if (metrics.syncSuccessRate !== null && metrics.syncSuccessRate < 85)
      findings.push(`Sync success rate is ${metrics.syncSuccessRate}% — connectors may have stale data.`);
    if (metrics.authFailureRate !== null && metrics.authFailureRate > 10)
      findings.push(`Auth failure rate is ${metrics.authFailureRate}% — OAuth tokens may need refresh.`);
  } catch {
    metrics.queryError = true;
  }

  // ── Connector health via credentials table ────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE health_status = 'HEALTHY')::int  AS healthy,
              COUNT(*) FILTER (WHERE health_status = 'DEGRADED')::int AS degraded,
              COUNT(*) FILTER (WHERE health_status = 'DOWN')::int     AS down
       FROM connector_credentials
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalConnectors   = row.total   ?? 0;
    metrics.healthyConnectors = row.healthy  ?? 0;
    metrics.degradedConnectors= row.degraded ?? 0;
    metrics.downConnectors    = row.down     ?? 0;
    metrics.connectorHealthRate = metrics.totalConnectors > 0
      ? Math.round((metrics.healthyConnectors / metrics.totalConnectors) * 100)
      : null;

    if (metrics.downConnectors > 0)
      findings.push(`${metrics.downConnectors} connector(s) are DOWN — syncs will fail.`);
    if (metrics.degradedConnectors > 1)
      findings.push(`${metrics.degradedConnectors} connectors are DEGRADED.`);
  } catch {
    metrics.connectorHealthRate = null;
  }

  // ── Webhook reliability (last 30 days) ───────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE processing_status = 'processed')::int AS processed
       FROM webhook_events
       WHERE workspace_id = $1
         AND received_at > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.webhookTotal     = row.total     ?? 0;
    metrics.webhookProcessed = row.processed ?? 0;
    metrics.webhookReliability = metrics.webhookTotal > 0
      ? Math.round((metrics.webhookProcessed / metrics.webhookTotal) * 100)
      : null;

    if (metrics.webhookReliability !== null && metrics.webhookReliability < 90)
      findings.push(`Webhook reliability is ${metrics.webhookReliability}% — events may be dropped.`);
  } catch {
    metrics.webhookReliability = null;
  }

  if (metrics.totalActions === 0 && metrics.totalConnectors === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings: ['No connector activity in the last 30 days.'] };
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const actionScore    = metrics.actionSuccessRate    ?? 70;
  const syncScore      = metrics.syncSuccessRate      ?? 70;
  const authScore      = 100 - (metrics.authFailureRate ?? 5);
  const healthScore    = metrics.connectorHealthRate   ?? 60;
  const webhookScore   = metrics.webhookReliability    ?? 80;

  const score = Math.round(
    actionScore  * 0.30 +
    syncScore    * 0.25 +
    authScore    * 0.15 +
    healthScore  * 0.20 +
    webhookScore * 0.10
  );

  return { domain: DOMAIN, score, metrics, findings };
}
