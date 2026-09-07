/**
 * FLOW OS — Autonomous Operational Brain Service
 *
 * Provides role-aware briefings, copilot Q&A, and explainable recommendations.
 * All context is derived from real workspace data (incidents, decisions, vector
 * store, knowledge graph). No hardcoded company names, people, or incidents.
 */

import { ask } from '../ai/BrainRouter.js';
import { TaskType } from '../ai/types.js';
import { retrieveContext } from './retrievalService.js';
import { getGraphMetrics, getRelatedContext } from './knowledgeGraphService.js';
import { getRecentDecisions } from './decisionMemoryService.js';
import { getRecentIncidents } from './incidentEngine.js';
import { calculateWorkspaceHealth } from './healthScoreService.js';
import { getConnector } from '../connectors/registry.js';
import { ActionType } from '../connectors/capabilities.js';

/**
 * 1. Role-aware Briefing
 *
 * Builds context exclusively from real workspace data: health scores, incidents,
 * decisions, and live connector signals. Sends this real context to the LLM.
 */
export async function generateRoleBriefing(workspaceId, role) {
  const wsId           = String(workspaceId);
  const normalizedRole = String(role).toLowerCase();

  const health    = await calculateWorkspaceHealth(wsId);
  const decisions = getRecentDecisions(wsId, 48);
  const incidents = getRecentIncidents(wsId, 24);

  // Build live connector signals
  const connectorSignals = [];

  try {
    const github = getConnector('github');
    if (github) {
      const repos = await github.execute(wsId, ActionType.READ, { resourceType: 'repos', limit: 3 });
      if (repos?.length) connectorSignals.push(`GitHub: ${repos.length} repositories connected. Most recent: ${repos[0]?.name || repos[0]?.fullName || 'unknown'}.`);
    }
  } catch { /* non-fatal */ }

  try {
    const gmail = getConnector('gmail');
    if (gmail) {
      const msgs = await gmail.execute(wsId, ActionType.READ, { folder: 'INBOX', limit: 5, q: 'is:unread' });
      const count = Array.isArray(msgs) ? msgs.length : 0;
      if (count > 0) connectorSignals.push(`Gmail: ${count} unread messages in inbox.`);
    }
  } catch { /* non-fatal */ }

  try {
    const cal = getConnector('google-calendar');
    if (cal) {
      const events = await cal.execute(wsId, ActionType.READ, { days: 1, limit: 5 });
      const count  = Array.isArray(events) ? events.length : 0;
      if (count > 0) connectorSignals.push(`Calendar: ${count} event(s) today.`);
    }
  } catch { /* non-fatal */ }

  const incidentSummary = incidents.length
    ? incidents.slice(0, 3).map(i => `- [${i.severity || 'UNKNOWN'}] ${i.title || i.type}`).join('\n')
    : 'No active incidents.';

  const decisionSummary = decisions.length
    ? decisions.slice(0, 3).map(d => `- ${d.decision || d.text || ''}`).join('\n')
    : 'No recent decisions recorded.';

  const healthSummary = health.hasData
    ? `Overall: ${health.company_health}% | Engineering: ${health.sectors.engineering ?? 'n/a'}% | Operations: ${health.sectors.operations ?? 'n/a'}%`
    : 'No workspace data yet — connect integrations to generate health signals.';

  const rawContext = `
Role: ${role}
Workspace Health: ${healthSummary}

Active Incidents:
${incidentSummary}

Recent Decisions:
${decisionSummary}

Live Connector Signals:
${connectorSignals.length ? connectorSignals.join('\n') : 'No connectors active.'}
`.trim();

  let responseText = '';
  try {
    const prompt = `You are the Autonomous Operational Brain of FLOW OS, acting as an elite Chief Operating Officer.
Generate a personalized, structured Markdown Daily Briefing for a user with the role: ${role}.

Use ONLY the following real workspace data. Do NOT invent company names, people, incidents, or tickets.
If data is missing, say so honestly.

${rawContext}

Structure:
### 1. Today's Strategic Focus
### 2. Live Risks & Blockers
### 3. Key Opportunities & Decisions
### 4. Recommended Actions`;

    const result = await ask({
      taskType:    TaskType.BRIEF,
      messages:    [{ role: 'user', content: prompt }],
      maxTokens:   800,
      temperature: 0.4,
    });
    responseText = (result.text || '').trim();
  } catch (err) {
    console.warn('[OperationalBrain] AI Briefing failed:', err.message);
  }

  if (!responseText) {
    responseText = _buildEmptyBrief(normalizedRole, health, incidents, decisions);
  }

  return { role, brief: responseText, timestamp: new Date().toISOString() };
}

function _buildEmptyBrief(role, health, incidents, decisions) {
  const lines = [`# FLOW OS Daily Briefing — ${role.toUpperCase()}`];
  if (!health.hasData) {
    lines.push('\n> No workspace data yet. Connect your integrations and run a sync to generate your first briefing.');
    return lines.join('\n');
  }

  lines.push(`\n*Workspace Health:* **${health.company_health}%**\n`);
  lines.push('### 1. Today\'s Strategic Focus');
  if (incidents.length) {
    lines.push(`- **${incidents.length} active incident(s)** requiring attention.`);
  } else {
    lines.push('- No active incidents. Focus on planned work.');
  }

  lines.push('\n### 2. Live Risks & Blockers');
  const critical = incidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  if (critical.length) {
    critical.slice(0, 3).forEach(i => lines.push(`- [${i.severity}] ${i.title || i.type}`));
  } else {
    lines.push('- No critical blockers detected.');
  }

  lines.push('\n### 3. Key Opportunities & Decisions');
  if (decisions.length) {
    decisions.slice(0, 2).forEach(d => lines.push(`- ${d.decision || d.text || ''}`));
  } else {
    lines.push('- No recent decisions in memory.');
  }

  lines.push('\n### 4. Recommended Actions');
  lines.push('- Review active incidents and prioritize resolution.');
  lines.push('- Check connected integrations for new signals.');

  return lines.join('\n');
}

/**
 * 2. Context-aware Copilot
 *
 * Routes questions to live connectors when intent is clear (GitHub repos, Gmail,
 * Calendar), then enriches with RAG and Knowledge Graph context before calling LLM.
 */
export async function askCopilot(workspaceId, queryText) {
  const wsId      = String(workspaceId);
  const queryLow  = queryText.toLowerCase();

  // ── Live connector routing ────────────────────────────────────────────────
  // For questions clearly targeting a specific integration, fetch live data first.
  const liveContext = [];

  const isGitHubQuery = queryLow.includes('repo') || queryLow.includes('repository') ||
    queryLow.includes('pr ') || queryLow.includes('pull request') ||
    queryLow.includes('commit') || queryLow.includes('branch') || queryLow.includes('github');

  const isGmailQuery = queryLow.includes('email') || queryLow.includes('inbox') ||
    queryLow.includes('mail') || queryLow.includes('gmail') || queryLow.includes('message');

  const isCalendarQuery = queryLow.includes('meeting') || queryLow.includes('calendar') ||
    queryLow.includes('event') || queryLow.includes('schedule') || queryLow.includes('today');

  if (isGitHubQuery) {
    try {
      const github = getConnector('github');
      if (github) {
        const repos = await github.execute(wsId, ActionType.READ, { resourceType: 'repos', limit: 5 });
        if (repos?.length) {
          liveContext.push(`[GitHub] You have ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'}.`);
          repos.slice(0, 5).forEach(r => {
            liveContext.push(`  - ${r.fullName || r.name} (last updated: ${r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : 'unknown'})`);
          });
          // Try to get PRs for the most recent repo
          const top = repos[0];
          if (top?.owner && top?.name) {
            const pulls = await github.execute(wsId, ActionType.READ, {
              resourceType: 'pulls', owner: top.owner, repo: top.name, state: 'open', limit: 5,
            });
            if (pulls?.length) {
              liveContext.push(`[GitHub] ${pulls.length} open PR(s) in ${top.name}:`);
              pulls.slice(0, 3).forEach(p => liveContext.push(`  - PR #${p.number}: ${p.title} (${p.author || 'Unknown'}) — ${p.mergeReadinessScore ?? '?'}% ready`));
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Copilot] GitHub live fetch failed:', err.message);
    }
  }

  if (isGmailQuery) {
    try {
      const gmail = getConnector('gmail');
      if (gmail) {
        const msgs = await gmail.execute(wsId, ActionType.READ, { folder: 'INBOX', limit: 5, q: 'is:unread' });
        if (Array.isArray(msgs) && msgs.length) {
          liveContext.push(`[Gmail] ${msgs.length} unread message(s) in inbox:`);
          msgs.slice(0, 3).forEach(m => liveContext.push(`  - From: ${m.from || 'Unknown'} | Subject: ${m.subject || '(no subject)'}`));
        } else {
          liveContext.push('[Gmail] Inbox is empty or no unread messages.');
        }
      }
    } catch (err) {
      console.warn('[Copilot] Gmail live fetch failed:', err.message);
    }
  }

  if (isCalendarQuery) {
    try {
      const cal = getConnector('google-calendar');
      if (cal) {
        const events = await cal.execute(wsId, ActionType.READ, { days: 1, limit: 5 });
        if (Array.isArray(events) && events.length) {
          liveContext.push(`[Calendar] ${events.length} event(s) today/upcoming:`);
          events.slice(0, 3).forEach(e => {
            const time = e.startTime ? new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'unknown';
            liveContext.push(`  - ${e.title || e.summary || 'Untitled'} at ${time}`);
          });
        } else {
          liveContext.push('[Calendar] No events found for today.');
        }
      }
    } catch (err) {
      console.warn('[Copilot] Calendar live fetch failed:', err.message);
    }
  }

  // ── RAG retrieval ─────────────────────────────────────────────────────────
  let contextChunks = [];
  try {
    contextChunks = await retrieveContext(wsId, queryText);
  } catch (err) {
    console.warn('[Copilot] RAG retrieval failed:', err.message);
  }

  // ── Knowledge Graph ───────────────────────────────────────────────────────
  const graphContext = [];
  try {
    const graphData = getGraphMetrics();
    for (const node of graphData.nodes) {
      if (node.name?.length > 3 && queryLow.includes(node.name.toLowerCase())) {
        graphContext.push(...getRelatedContext(node.id));
      }
    }
  } catch { /* non-fatal */ }

  const evidenceLines = contextChunks.map(c => `[${c.source || 'RAG'}] ${c.content || c.markdown || c.text || ''}`);
  const systems       = [...new Set(contextChunks.map(c => c.source || 'default'))];

  let answerText     = '';
  let reasoningTrace = '';

  try {
    const contextParts = [];
    if (liveContext.length)   contextParts.push(`LIVE CONNECTOR DATA:\n${liveContext.join('\n')}`);
    if (evidenceLines.length) contextParts.push(`WORKSPACE MEMORY:\n${evidenceLines.join('\n')}`);
    if (graphContext.length)  contextParts.push(`KNOWLEDGE GRAPH:\n${graphContext.join('\n')}`);

    const prompt = `You are the Context-aware AI Copilot for FLOW OS.
Answer the user question using ONLY the real data provided below.
Do NOT invent company names, people, incidents, or tickets not mentioned in the data.
If the data is insufficient, say so honestly.

User Question: "${queryText}"

${contextParts.length ? contextParts.join('\n\n') : 'No data available for this workspace yet.'}

Return a JSON object with "answer" and "reasoningTrace" keys only.`;

    const result = await ask({
      taskType:    TaskType.REASON,
      messages:    [{ role: 'user', content: prompt }],
      maxTokens:   600,
      temperature: 0.3,
    });

    try {
      const clean  = (result.text || '').replace(/```json?|```/g, '').trim();
      const parsed = JSON.parse(clean);
      answerText     = parsed.answer || '';
      reasoningTrace = parsed.reasoningTrace || '';
    } catch {
      answerText     = result.text || '';
      reasoningTrace = `Provider: ${result.provider}/${result.model}`;
    }
  } catch (err) {
    console.warn('[Copilot] AI generation failed:', err.message);
  }

  if (!answerText) {
    if (liveContext.length) {
      answerText = liveContext.join('\n');
      reasoningTrace = 'Live connector data returned directly (LLM unavailable).';
    } else if (contextChunks.length) {
      answerText = `Based on workspace memory: ${evidenceLines.slice(0, 2).join(' | ')}`;
      reasoningTrace = 'RAG retrieval — LLM unavailable.';
    } else {
      answerText = `No data found in this workspace for "${queryText}". Connect your integrations and run a sync to start building workspace intelligence.`;
      reasoningTrace = 'No data available.';
    }
  }

  return {
    query:          queryText,
    answer:         answerText,
    evidence:       evidenceLines.slice(0, 5),
    relatedSystems: systems,
    reasoningTrace,
    graphReferences: graphContext.slice(0, 3),
  };
}

/**
 * 3. Explainable Recommendations
 *
 * Returns recommendations derived from real prediction engine output only.
 * Returns empty array when no real signals exist.
 */
export function generateExplainableRecommendations(workspaceId) { // eslint-disable-line no-unused-vars
  // Real recommendations are produced by the Phase 11.5 Prediction Engine and the
  // Execution Engine. This endpoint returns [] until those engines have data.
  // Do NOT add hardcoded recommendations here.
  return [];
}
