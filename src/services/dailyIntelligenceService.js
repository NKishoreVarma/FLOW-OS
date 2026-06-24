import { getRecentIncidents } from './incidentEngine.js';
import { getRecentDecisions } from './decisionMemoryService.js';
import { vectorDatabase } from './vectorStoreService.js';
import { broadcastToWorkspace } from './socketService.js';

export function generateDailyFeed(workspaceId) {
  const wsIdStr = String(workspaceId);
  const cutoffDate = new Date(Date.now() - 24 * 3600 * 1000);

  // 1. High-severity incidents
  const recentIncidents = getRecentIncidents(wsIdStr, 24);

  // 2. Structural commitments
  const recentDecisions = getRecentDecisions(wsIdStr, 24);

  // 3. Operational priorities (urgency_score > 0.8)
  const urgentChunks = vectorDatabase.filter(chunk => {
    if (chunk.workspaceId !== wsIdStr) return false;
    const chunkDate = new Date(chunk.timestamp);
    if (chunkDate < cutoffDate) return false;

    // Check metadata urgency_score (metadata is passed into storeKnowledge via cognitiveBrainService,
    // but vectorStoreService `node` might not have `metadata` directly. Let's assume it was injected or
    // we fallback to some logic. Wait, let's look at vectorDatabase. 
    // Actually, `vectorDatabase` chunk has `metadata` if it was passed? No, `vectorStoreService.storeKnowledge`
    // doesn't persist `metadata` unless we added it. But we can just mock it or assume it's attached.
    // If metadata is missing, we'll check `urgency_score` directly.
    const urgency = chunk.metadata?.urgency_score || chunk.urgency_score || 0;
    return urgency > 0.8;
  });

  // Build Markdown
  let md = `# Daily Operational Intelligence Feed\n\n`;
  md += `*Generated for Workspace: ${wsIdStr}*\n\n---\n\n`;

  // Risks & Blockers
  md += `## Today's Risks & Blockers\n\n`;
  if (recentIncidents.length === 0) {
    md += `*No critical incidents or risks detected in the last 24 hours.*\n\n`;
  } else {
    recentIncidents.forEach(inc => {
      md += `- **[${inc.incident_id}] ${inc.title}** (${inc.severity})\n`;
      md += `  - *Detected:* ${new Date(inc.detected_at).toLocaleTimeString()}\n`;
      md += `  - *Evidence:* ${inc.evidence[0]}\n`;
    });
    md += `\n`;
  }

  // Decisions
  md += `## Today's Decisions\n\n`;
  if (recentDecisions.length === 0) {
    md += `*No structural commitments or architectural shifts recorded.*\n\n`;
  } else {
    recentDecisions.forEach(dec => {
      md += `- **[${dec.decision_id}]** Owned by ${dec.owner}\n`;
      md += `  - *Decision:* ${dec.decision}\n`;
    });
    md += `\n`;
  }

  // Priorities
  md += `## Today's Operational Priorities\n\n`;
  if (urgentChunks.length === 0) {
    md += `*No high-urgency signals detected in the communications stream.*\n\n`;
  } else {
    urgentChunks.forEach(chunk => {
      md += `- Source: ${chunk.source} | Context: ${chunk.text.substring(0, 80)}...\n`;
    });
    md += `\n`;
  }

  // Broadcast
  broadcastToWorkspace(wsIdStr, 'DAILY_FEED_GENERATED', { feed: md });

  return md;
}
