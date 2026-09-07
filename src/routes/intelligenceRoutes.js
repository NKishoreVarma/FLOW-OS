import express from 'express';
import { generateDailyFeed } from '../services/dailyIntelligenceService.js';
import { calculateWorkspaceHealth } from '../services/healthScoreService.js';
import { generateRollingSummary } from '../services/summaryService.js';
import { getRecentIncidents } from '../services/incidentEngine.js';
import { getRecentDecisions } from '../services/decisionMemoryService.js';
import {
  generatePredictions,
  generateOperationalStories,
  getProactiveRecommendations,
  recordRecommendationFeedback,
} from '../services/operationalIntelligenceService.js';
import {
  generateRoleBriefing,
  askCopilot,
  generateExplainableRecommendations,
} from '../services/operationalBrainService.js';
import { getConnector } from '../connectors/registry.js';
import { ActionType } from '../connectors/capabilities.js';

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeIncident(inc) {
  return {
    id:          inc.incident_id || inc.id,
    title:       inc.title || inc.type || 'Incident detected',
    description: (Array.isArray(inc.evidence) ? inc.evidence[0] : inc.description) || '',
    priority:    inc.severity === 'CRITICAL' ? 'CRITICAL' : 'P1',
    source:      inc.platform || 'system',
    channel:     inc.channel || '#incidents',
    sender:      inc.sender || 'System',
    timestamp:   inc.detected_at
      ? new Date(inc.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Recent',
    aiReason:    `Severity: ${inc.severity || 'UNKNOWN'}. Auto-detected.`,
    actionLabel: 'Acknowledge',
  };
}

function normalizeDecision(dec) {
  return {
    id:     dec.decision_id || dec.id,
    text:   dec.decision || dec.text || '',
    date:   new Date(dec.date || Date.now()).toLocaleDateString(),
    author: dec.author || 'System',
  };
}

/**
 * @route  GET /api/intelligence/workfeed
 * @desc   Live workfeed from connected tools. Returns empty arrays when no connector data exists.
 *         Never returns hardcoded demo data.
 */
router.get('/workfeed', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace-id header.' });
  const wsId = String(workspaceId);

  try {
    const liveIncidents = getRecentIncidents(wsId, 24);
    const liveDecisions = getRecentDecisions(wsId, 48);

    const actions  = [];
    const meetings = [];
    const activity = [];

    // ── GitHub: open PRs from most-recently-updated repos ────────────────────
    try {
      const github = getConnector('github');
      if (github) {
        const repos = await github.execute(wsId, ActionType.READ, { resourceType: 'repos', limit: 3 });
        for (const repo of (repos || []).slice(0, 2)) {
          if (!repo?.owner || !repo?.name) continue;
          const pulls = await github.execute(wsId, ActionType.READ, {
            resourceType: 'pulls',
            owner: repo.owner,
            repo:  repo.name,
            state: 'open',
            limit: 3,
          });
          for (const pr of (pulls || []).slice(0, 2)) {
            actions.push({
              id:          `gh-pr-${pr.number || pr.id}`,
              title:       `Review PR: ${pr.title || `#${pr.number}`}`,
              description: `${repo.name} · ${pr.description || pr.body?.slice(0, 150) || ''}`.trim(),
              priority:    (pr.mergeReadinessScore ?? 100) < 60 ? 'P1' : 'P2',
              source:      'github',
              channel:     repo.name,
              sender:      pr.author || pr.user?.login || 'Unknown',
              timestamp:   pr.createdAt
                ? new Date(pr.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Recently',
              aiReason:    `Merge readiness: ${pr.mergeReadinessScore ?? 'unknown'}%`,
              actionLabel: 'Review PR',
            });
          }
          // Recent commits as activity
          try {
            const commits = await github.execute(wsId, ActionType.READ, {
              resourceType: 'commits',
              owner: repo.owner,
              repo:  repo.name,
              limit: 3,
            });
            for (const c of (commits || []).slice(0, 2)) {
              activity.push({
                id:          `gh-commit-${c.sha?.slice(0, 7) || c.id}`,
                title:       `GitHub: ${c.message?.split('\n')[0]?.slice(0, 80) || 'Commit'}`,
                description: `${repo.name} · ${c.author || 'Unknown'}`,
                source:      'github',
                timestamp:   c.date
                  ? new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Recently',
                group:       'Today',
              });
            }
          } catch { /* non-fatal */ }
        }
      }
    } catch (err) {
      console.warn('[Workfeed] GitHub connector error:', err.message);
    }

    // ── Gmail: unread inbox messages ──────────────────────────────────────────
    try {
      const gmail = getConnector('gmail');
      if (gmail) {
        const msgs = await gmail.execute(wsId, ActionType.READ, {
          folder: 'INBOX',
          limit:  5,
          q:      'is:unread',
        });
        for (const msg of (Array.isArray(msgs) ? msgs : []).slice(0, 3)) {
          actions.push({
            id:          `email-${msg.id}`,
            title:       msg.subject || '(no subject)',
            description: msg.snippet || msg.preview || '',
            priority:    'P2',
            source:      'gmail',
            channel:     'Inbox',
            sender:      msg.from || msg.sender || 'Unknown',
            timestamp:   msg.timestamp
              ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Recently',
            aiReason:    'Unread email requiring attention.',
            actionLabel: 'Reply',
          });
        }
      }
    } catch (err) {
      console.warn('[Workfeed] Gmail connector error:', err.message);
    }

    // ── Calendar: today's events ──────────────────────────────────────────────
    try {
      const cal = getConnector('google-calendar');
      if (cal) {
        const events = await cal.execute(wsId, ActionType.READ, { days: 1, limit: 5 });
        for (const evt of (Array.isArray(events) ? events : []).slice(0, 3)) {
          meetings.push({
            id:           `cal-${evt.id}`,
            title:        evt.title || evt.summary || 'Meeting',
            time:         evt.startTime
              ? new Date(evt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Today',
            participants: (evt.participants || [])
              .map(p => p.name || p.email || '')
              .filter(Boolean)
              .join(', '),
            type:         'Scheduled',
            prepContext:  evt.description || evt.agenda || '',
            relatedDocs:  [],
          });
        }
      }
    } catch (err) {
      console.warn('[Workfeed] Calendar connector error:', err.message);
    }

    return res.status(200).json({
      critical:          liveIncidents.map(normalizeIncident),
      actions,
      meetings,
      approvals:         [],
      activity,
      aiRecommendation:  null,
      healthScore:       null,
      memory: {
        totalDecisions:  liveDecisions.length,
        totalIncidents:  liveIncidents.length,
        recentDecisions: liveDecisions.slice(0, 3).map(normalizeDecision),
      },
    });
  } catch (error) {
    console.error('[Workfeed Route] Error:', error);
    return res.status(500).json({ error: 'Failed to generate workfeed.', details: error.message });
  }
});

/**
 * @route  GET /api/intelligence/health-score
 */
router.get('/health-score', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return res.status(400).json({ error: 'Multi-tenant isolation violation: Missing workspace-id header.' });

  try {
    const health = await calculateWorkspaceHealth(workspaceId);
    return res.status(200).json(health);
  } catch (error) {
    console.error('[Intelligence Route] Failed to calculate health score:', error);
    return res.status(500).json({ error: 'Failed to calculate health score.', details: error.message });
  }
});

/**
 * @route  GET /api/intelligence/daily-feed
 */
router.get('/daily-feed', (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return res.status(400).json({ error: 'Multi-tenant isolation violation: Missing workspace-id header.' });

  try {
    const feed = generateDailyFeed(workspaceId);
    return res.status(200).json({ feed });
  } catch (error) {
    console.error('[Intelligence Route] Failed to generate daily feed:', error);
    return res.status(500).json({ error: 'Failed to generate daily feed.', details: error.message });
  }
});

/**
 * @route  POST /api/intelligence/rolling-summary
 */
router.post('/rolling-summary', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { hours } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'Multi-tenant isolation violation: Missing workspace-id header.' });

  try {
    const result = await generateRollingSummary(workspaceId, hours || 24);
    if (!result) {
      return res.status(200).json({ success: true, message: 'No operational data chunks found to summarize in the specified timeframe.' });
    }
    return res.status(200).json({ success: true, filePath: result.filePath, chunkCount: result.chunkCount, summary: result.summaryContent });
  } catch (error) {
    console.error('[Summary Route] Failed to compile rolling summary:', error);
    return res.status(500).json({ error: 'Failed to compile rolling summary.', details: error.message });
  }
});

/**
 * @route  GET /api/intelligence/briefing
 * @desc   Aggregated executive briefing. All data sourced from real connectors and ingested
 *         intelligence. Returns explicit no-data messages when connectors have no content.
 */
router.get('/briefing', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace-id header.' });
  const wsId = String(workspaceId);

  try {
    const [health, predictions, stories] = await Promise.all([
      calculateWorkspaceHealth(wsId),
      generatePredictions(wsId),
      Promise.resolve(generateOperationalStories(wsId)),
    ]);

    // Morning brief derived from real incidents and decisions only
    const liveIncidents = getRecentIncidents(wsId, 24);
    const liveDecisions = getRecentDecisions(wsId, 24);

    const priorities = liveIncidents
      .slice(0, 3)
      .map(inc => `[${inc.severity || 'INFO'}] ${inc.title || inc.type}`);

    const risks = liveIncidents
      .filter(inc => inc.severity === 'CRITICAL' || inc.severity === 'HIGH')
      .slice(0, 3)
      .map(inc => `${inc.title || inc.type} (${inc.platform || 'system'})`);

    const morningBrief = {
      priorities: priorities.length
        ? priorities
        : ['No active incidents. Workspace is healthy.'],
      operationalSummary: health.hasData
        ? `Workspace health: ${health.company_health}%. ${liveIncidents.length} active incidents, ${liveDecisions.length} recent decisions.`
        : 'No operational data yet. Connect integrations and sync to generate a briefing.',
      wins:  [],
      risks: risks.length ? risks : [],
    };

    // Recommendations derived from the prediction engine — no hardcoded items
    const recommendations = getProactiveRecommendations(wsId);

    // Timeline from real incidents and decisions only
    const timeline = [
      ...liveIncidents.slice(0, 3).map((inc, i) => ({
        id:          `inc-${i}`,
        type:        'incident',
        title:       inc.title || inc.type || 'Incident',
        description: (Array.isArray(inc.evidence) ? inc.evidence[0] : '') || '',
        timestamp:   inc.detected_at
          ? new Date(inc.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Recent',
        source: inc.platform || 'system',
      })),
      ...liveDecisions.slice(0, 2).map((dec, i) => ({
        id:          `dec-${i}`,
        type:        'decision',
        title:       (dec.decision || dec.text || '').slice(0, 80),
        description: dec.author ? `By ${dec.author}` : '',
        timestamp:   dec.date
          ? new Date(dec.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Recent',
        source: 'vault',
      })),
    ];

    res.json({
      success: true,
      health,
      morningBrief,
      recommendations,
      predictions,
      stories,
      timeline,
      graph: { nodes: [], edges: [] },
    });
  } catch (error) {
    console.error('[Briefing Route] Error:', error);
    res.status(500).json({ error: 'Failed to compile briefing.', details: error.message });
  }
});

/**
 * @route  POST /api/intelligence/qa
 * @desc   Delegates to the copilot service (RAG + LLM) for real answers.
 *         Never uses hardcoded keyword matching.
 */
router.post('/qa', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { query } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace-id header.' });
  if (!query)       return res.status(400).json({ error: 'Query parameter is required.' });

  try {
    const result = await askCopilot(String(workspaceId), query);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[QA Route] Error:', error);
    res.status(500).json({ error: 'Failed to answer query.', details: error.message });
  }
});

/**
 * @route  POST /api/intelligence/recommendations/:id/feedback
 */
router.post('/recommendations/:id/feedback', (req, res) => {
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'Action parameter is required.' });

  const result = recordRecommendationFeedback(req.params.id, action);
  res.json({ success: true, ...result });
});

/**
 * @route  GET /api/intelligence/briefing/:role
 */
router.get('/briefing/:role', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { role } = req.params;
  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace-id header.' });

  try {
    const brief = await generateRoleBriefing(workspaceId, role);
    res.json({ success: true, ...brief });
  } catch (error) {
    console.error('[Briefing Role Route] Error:', error);
    res.status(500).json({ error: 'Failed to generate briefing.', details: error.message });
  }
});

/**
 * @route  POST /api/intelligence/copilot
 */
router.post('/copilot', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { query } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace-id header.' });
  if (!query)       return res.status(400).json({ error: 'Query parameter is required.' });

  try {
    const answer = await askCopilot(workspaceId, query);
    res.json({ success: true, ...answer });
  } catch (error) {
    console.error('[Copilot Route] Error:', error);
    res.status(500).json({ error: 'Failed to answer query via Copilot.', details: error.message });
  }
});

/**
 * @route  GET /api/intelligence/explainable-recommendations
 */
router.get('/explainable-recommendations', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return res.status(400).json({ error: 'Missing workspace-id header.' });

  try {
    const recs = generateExplainableRecommendations(workspaceId);
    res.json({ success: true, recommendations: recs });
  } catch (error) {
    console.error('[Explainable Recommendations Route] Error:', error);
    res.status(500).json({ error: 'Failed to generate explainable recommendations.', details: error.message });
  }
});

export default router;
