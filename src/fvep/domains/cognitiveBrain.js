import { query } from '../../config/db.js';

export const DOMAIN = 'cognitiveBrain';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  // ── Conversation depth & evidence quality ─────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(DISTINCT cc.id)::int AS total_conversations,
              AVG(msg_counts.cnt)::numeric AS avg_messages_per_conv,
              COUNT(DISTINCT cc.id) FILTER (WHERE cc.metadata->>'hasCitations' = 'true')::int AS with_citations
       FROM "CopilotConversation" cc
       LEFT JOIN (
         SELECT "conversationId", COUNT(*)::int AS cnt
         FROM "CopilotMessage"
         WHERE role = 'assistant'
         GROUP BY "conversationId"
       ) msg_counts ON msg_counts."conversationId" = cc.id
       WHERE cc."workspaceId" = $1
         AND cc."createdAt" > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalConversations  = row.total_conversations ?? 0;
    metrics.avgMessagesPerConv  = parseFloat(row.avg_messages_per_conv ?? 0).toFixed(1);
    metrics.conversationsWithCitations = row.with_citations ?? 0;
    metrics.citationRate        = metrics.totalConversations > 0
      ? Math.round((metrics.conversationsWithCitations / metrics.totalConversations) * 100)
      : null;

    if (metrics.totalConversations === 0) findings.push('No copilot conversations in the last 30 days.');
    if (metrics.citationRate !== null && metrics.citationRate < 40)
      findings.push(`Only ${metrics.citationRate}% of conversations include cited evidence.`);
  } catch {
    metrics.conversationQueryError = true;
  }

  // ── Agent agreement proxy (council responses stored in memory) ───────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE metadata->>'agentCount' IS NOT NULL AND
                               (metadata->>'agentCount')::int >= 3)::int AS multi_agent
       FROM "OrgMemoryRecord"
       WHERE "workspaceId" = $1
         AND type = 'COUNCIL_RESPONSE'
         AND "createdAt" > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.councilResponses = row.total ?? 0;
    metrics.agentAgreementRate = row.total > 0
      ? Math.round((row.multi_agent / row.total) * 100)
      : null;
  } catch {
    metrics.agentAgreementRate = null;
  }

  // ── Routing accuracy: avg reasoning confidence from audit ─────────────────
  try {
    const r = await query(
      `SELECT AVG((metadata->>'confidence')::numeric)::numeric AS avg_confidence,
              COUNT(*)::int AS total
       FROM "AuditLog"
       WHERE "workspaceId" = $1
         AND action LIKE '%brain%'
         AND "createdAt" > NOW() - INTERVAL '30 days'
         AND metadata->>'confidence' IS NOT NULL`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.avgReasoningConfidence = row.total > 0
      ? Math.round(parseFloat(row.avg_confidence ?? 0))
      : null;
    metrics.auditedReasoningCalls  = row.total ?? 0;
  } catch {
    metrics.avgReasoningConfidence = null;
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const citScore   = metrics.citationRate           ?? 55;
  const depthScore = Math.min(100, parseFloat(metrics.avgMessagesPerConv) * 20);  // 5+ msgs = 100
  const agentScore = metrics.agentAgreementRate     ?? 60;
  const confScore  = metrics.avgReasoningConfidence ?? 60;
  const hasConvs   = (metrics.totalConversations ?? 0) > 0 ? 100 : 20;

  const score = Math.round(
    citScore   * 0.30 +
    depthScore * 0.20 +
    agentScore * 0.20 +
    confScore  * 0.15 +
    hasConvs   * 0.15
  );

  if ((metrics.totalConversations ?? 0) === 0 && (metrics.councilResponses ?? 0) === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings };
  }

  return { domain: DOMAIN, score, metrics, findings };
}
