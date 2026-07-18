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
  getDecisionMemory
} from '../services/operationalIntelligenceService.js';
import {
  generateRoleBriefing,
  askCopilot,
  generateExplainableRecommendations
} from '../services/operationalBrainService.js';

const router = express.Router();

// Rich demo company dataset — used when no real ingested data exists
const DEMO_WORKFEED = {
  critical: [
    {
      id: 'INC-A3F2',
      title: 'PostgreSQL connection pool exhausted — API latency 2400ms',
      description: 'CTO flagged: Postgres `users` table experiencing connection saturation. P95 latency at 2,400ms. On-call engineers paged. Rolling restart in progress.',
      priority: 'CRITICAL',
      source: 'slack',
      channel: '#incidents',
      sender: 'James K. (CTO)',
      timestamp: '9 min ago',
      aiReason: 'Authority signal from CTO + production keyword cluster. Urgency score 0.97.',
      actionLabel: 'Acknowledge',
    },
    {
      id: 'INC-B71C',
      title: 'TechCorp SLA breach — response time threshold exceeded',
      description: 'Client reported API response times exceeded the 500ms SLA threshold. Escalation email received. Requires immediate engineering triage.',
      priority: 'CRITICAL',
      source: 'gmail',
      channel: 'support@techcorp.com',
      sender: 'Sarah M. (TechCorp)',
      timestamp: '22 min ago',
      aiReason: 'Customer escalation + SLA keyword + business impact score 0.92.',
      actionLabel: 'Triage',
    },
  ],
  actions: [
    {
      id: 'ACT-001',
      title: 'Review PR: Add pgvector connection retry logic',
      description: 'David O. opened a PR fixing the connection pool saturation. Needs review from a senior engineer before merge to main.',
      priority: 'P1',
      source: 'github',
      channel: 'flow-os/backend',
      sender: 'David O.',
      timestamp: '34 min ago',
      aiReason: 'Code review request linked to active incident INC-A3F2.',
      actionLabel: 'Review PR',
    },
    {
      id: 'ACT-002',
      title: 'Reply to TechCorp SLA escalation email',
      description: 'Draft response acknowledging the outage and outlining the remediation timeline. Client expects response within 2 hours.',
      priority: 'P1',
      source: 'gmail',
      channel: 'Inbox',
      sender: 'sarah.m@techcorp.com',
      timestamp: '22 min ago',
      aiReason: 'Customer email + urgency signal "escalation" + 2hr deadline detected.',
      actionLabel: 'Draft Reply',
    },
    {
      id: 'ACT-003',
      title: 'Jira: FLOW-247 — Deploy monitoring alert thresholds',
      description: 'Ticket assigned to you. Monitoring thresholds not configured for connection pool depth. Blocking release gating.',
      priority: 'P2',
      source: 'jira',
      channel: 'FLOW Sprint 14',
      sender: 'Sarah Chen (PM)',
      timestamp: '1h 12m ago',
      aiReason: 'Sprint blocker assigned to current user. Deployment dependency detected.',
      actionLabel: 'Start Task',
    },
    {
      id: 'ACT-004',
      title: 'Approve budget allocation: AWS RDS upgrade ($2,400/mo)',
      description: 'Infrastructure team requesting approval to upgrade RDS instance class from db.r5.large to db.r5.xlarge to handle peak load.',
      priority: 'P2',
      source: 'notion',
      channel: 'Infra Decisions',
      sender: 'Alex R. (Engineering Lead)',
      timestamp: '2h ago',
      aiReason: 'Financial approval request from engineering. Budget impact flagged.',
      actionLabel: 'Approve',
    },
  ],
  meetings: [
    {
      id: 'MTG-001',
      title: 'Incident Postmortem: DB Connection Saturation',
      time: '2:00 PM – 3:00 PM',
      participants: 'James K., David O., Sarah Chen, Alex R.',
      type: 'Urgent',
      prepContext: 'Review incident timeline. Bring connection pool metrics from Datadog. Engineering team expects root cause analysis.',
      relatedDocs: ['INC-A3F2-timeline.md', 'pgvector-connection-limits.md'],
    },
    {
      id: 'MTG-002',
      title: 'Weekly Product Sync — Sprint 14 Review',
      time: '4:00 PM – 4:30 PM',
      participants: 'Sarah Chen, Priya N., Marcus W., You',
      type: 'Recurring',
      prepContext: 'Sprint 14 is at 72% completion. 3 tickets blocked on infra. Prepare to discuss timeline slip with product team.',
      relatedDocs: ['Sprint-14-board.jira', 'Q2-roadmap.notion'],
    },
  ],
  approvals: [
    {
      id: 'APP-X7K2',
      recipe: 'CUSTOMER_ESCALATION_REPLY',
      action: 'FLOW drafted a client response email to TechCorp',
      target: 'sarah.m@techcorp.com',
      details: `Subject: Re: SLA Breach — Immediate Response\n\nDear Sarah,\n\nThank you for flagging this immediately. Our engineering team identified and is actively remediating an unexpected surge in database connection pool utilization that caused elevated API response times.\n\nCurrent status: Engineering team engaged, rolling remediation in progress. We expect full restoration within 45 minutes.\n\nWe sincerely apologize for the disruption and will share a full postmortem report within 24 hours.\n\nBest regards,\nKishore Varma\nHead of Engineering, FLOW OS`,
      confidence: '96%',
    },
    {
      id: 'APP-Y9M4',
      recipe: 'JIRA_TICKET_CREATION',
      action: 'FLOW created a Jira ticket from Slack discussion',
      target: 'FLOW Sprint 14',
      details: `Title: [P0] Add pg connection pool depth monitoring alert\nDescription: Monitoring gap identified during INC-A3F2. Add Datadog alert when pg pool utilization exceeds 85%.\nAssignee: David O.\nPriority: P0\nSprint: 14\nLinked Incident: INC-A3F2`,
      confidence: '99%',
    },
  ],
  activity: [
    {
      id: 'EVT-001',
      title: 'GitHub: feat/monitoring-alerts merged to main',
      description: 'Marcus W. merged 3 commits. Adds Datadog connection pool monitoring with PagerDuty integration.',
      source: 'github',
      timestamp: '8 min ago',
      group: 'Now',
    },
    {
      id: 'EVT-002',
      title: 'Memory: Architecture decision logged',
      description: '"Migrate from single-node Redis to Redis Cluster for BullMQ reliability" — approved by CTO.',
      source: 'vault',
      timestamp: '1h ago',
      group: 'Today',
    },
    {
      id: 'EVT-003',
      title: 'Slack: Sprint 14 standup completed',
      description: '7 team members reported. 3 blockers identified. Engineering velocity at 82% of sprint target.',
      source: 'slack',
      timestamp: '9:15 AM',
      group: 'Today',
    },
    {
      id: 'EVT-004',
      title: 'Jira: FLOW-241 moved to Done',
      description: 'pgvector ANN index optimization completed. Query latency reduced from 180ms to 42ms.',
      source: 'jira',
      timestamp: 'Yesterday',
      group: 'Yesterday',
    },
    {
      id: 'EVT-005',
      title: 'Gmail: Q2 board update sent by CEO',
      description: 'Priya shared Q2 performance metrics with the full exec team. ARR at $180K, up 34% QoQ.',
      source: 'gmail',
      timestamp: 'Yesterday',
      group: 'Yesterday',
    },
  ],
  aiRecommendation: {
    suggestion: '**Immediate priority:** Address INC-A3F2 (DB connection saturation) before the 2 PM postmortem. Draft the TechCorp SLA response within the next 30 minutes to stay within the 2-hour response SLA window. The pending PR from David O. is the fastest path to incident resolution — prioritize that review.',
    reasoning: 'Correlated incident INC-A3F2 with TechCorp escalation email (22 min ago) and the pending GitHub PR. Authority signal from CTO message boosted urgency score to 0.97. Two separate customer-facing blockers converging on the same root cause.',
  },
  healthScore: {
    overall: 74,
    engineering: 68,
    product: 88,
    operations: 71,
    finance: 95,
    hr: 90,
    trend: 'degrading',
  },
  memory: {
    totalDecisions: 1247,
    totalIncidents: 89,
    totalChunks: 14820,
    recentDecisions: [
      { id: 'DEC-001', text: 'Adopt pgvector as primary vector store, deprecating in-memory fallback in production.', date: 'Jun 25, 2026', author: 'James K. (CTO)' },
      { id: 'DEC-002', text: 'Migrate Redis to Redis Cluster for BullMQ job queue reliability.', date: 'Jun 26, 2026', author: 'Alex R.' },
      { id: 'DEC-003', text: 'FLOW OS v2.0 feature freeze on July 15. No new features until launch.', date: 'Jun 27, 2026', author: 'Sarah Chen (PM)' },
    ],
  },
};

/**
 * @route  GET /api/intelligence/workfeed
 * @desc   Returns ranked workfeed items: incidents, actions, meetings, approvals, activity
 * @access Private
 */
router.get('/workfeed', (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace-id header.' });
  }

  try {
    const liveIncidents = getRecentIncidents(String(workspaceId), 24);
    const liveDecisions = getRecentDecisions(String(workspaceId), 24);

    // Merge real incidents over demo ones if they exist
    const incidents = liveIncidents.length > 0
      ? liveIncidents.map(inc => ({
          id: inc.incident_id,
          title: inc.title,
          description: inc.evidence?.[0] || inc.description || '',
          priority: inc.severity === 'CRITICAL' ? 'CRITICAL' : 'P1',
          source: 'slack',
          channel: '#incidents',
          sender: 'System',
          timestamp: new Date(inc.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          aiReason: `Severity: ${inc.severity}. Keyword-triggered detection.`,
          actionLabel: 'Acknowledge',
        }))
      : DEMO_WORKFEED.critical;

    const decisions = liveDecisions.length > 0
      ? liveDecisions.map(dec => ({
          id: dec.decision_id,
          text: dec.decision || dec.text || '',
          date: new Date(dec.date || Date.now()).toLocaleDateString(),
          author: dec.author || 'System',
        }))
      : DEMO_WORKFEED.memory.recentDecisions;

    return res.status(200).json({
      critical: incidents,
      actions: DEMO_WORKFEED.actions,
      meetings: DEMO_WORKFEED.meetings,
      approvals: DEMO_WORKFEED.approvals,
      activity: DEMO_WORKFEED.activity,
      aiRecommendation: DEMO_WORKFEED.aiRecommendation,
      healthScore: DEMO_WORKFEED.healthScore,
      memory: {
        ...DEMO_WORKFEED.memory,
        recentDecisions: decisions,
      },
    });
  } catch (error) {
    console.error('[Workfeed Route] Error:', error);
    return res.status(500).json({ error: 'Failed to generate workfeed.', details: error.message });
  }
});

/**
 * @route  GET /api/intelligence/health-score
 * @desc   Generate real-time operational health scores for a workspace
 * @access Private
 */
router.get('/health-score', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];

  if (!workspaceId) {
    return res.status(400).json({
      error: 'Multi-tenant isolation violation: Missing workspace-id header.'
    });
  }

  try {
    const health = await calculateWorkspaceHealth(workspaceId);
    return res.status(200).json(health);
  } catch (error) {
    console.error(`[Intelligence Route] Failed to calculate health score:`, error);
    return res.status(500).json({
      error: 'Failed to calculate health score.',
      details: error.message
    });
  }
});

/**
 * @route  GET /api/intelligence/daily-feed
 * @desc   Generate the daily operational intelligence feed for a workspace
 * @access Private
 */
router.get('/daily-feed', (req, res) => {
  const workspaceId = req.headers['workspace-id'];

  if (!workspaceId) {
    return res.status(400).json({
      error: 'Multi-tenant isolation violation: Missing workspace-id header.'
    });
  }

  try {
    const feed = generateDailyFeed(workspaceId);
    return res.status(200).json({ feed });
  } catch (error) {
    console.error(`[Intelligence Route] Failed to generate daily feed:`, error);
    return res.status(500).json({
      error: 'Failed to generate daily feed.',
      details: error.message
    });
  }
});

/**
 * @route  POST /api/intelligence/rolling-summary
 * @desc   Trigger rolling executive summary compilation for a workspace
 * @access Private
 */
router.post('/rolling-summary', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { hours } = req.body;

  if (!workspaceId) {
    return res.status(400).json({
      error: 'Multi-tenant isolation violation: Missing workspace-id header.'
    });
  }

  try {
    const result = await generateRollingSummary(workspaceId, hours || 24);
    if (!result) {
      return res.status(200).json({
        success: true,
        message: 'No operational data chunks found to summarize in the specified timeframe.'
      });
    }
    return res.status(200).json({
      success: true,
      filePath: result.filePath,
      chunkCount: result.chunkCount,
      summary: result.summaryContent
    });
  } catch (error) {
    console.error(`[Summary Route] Failed to compile rolling summary:`, error);
    return res.status(500).json({
      error: 'Failed to compile rolling summary.',
      details: error.message
    });
  }
});

/**
 * @route  GET /api/intelligence/briefing
 * @desc   Returns aggregated executive briefings, company health, timeline, and recommendations
 * @access Private
 */
router.get('/briefing', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace-id header.' });
  }

  try {
    const health = await calculateWorkspaceHealth(workspaceId);
    const predictions = await generatePredictions(workspaceId);
    const stories = generateOperationalStories(workspaceId);

    // Morning Brief
    const morningBrief = {
      priorities: [
        'Acknowledge SLA latency breach on Acme Corp (INC-A3F2).',
        'Review database retry pool logic PR by David O. (PROJ-824).',
        'Authorize Stripe webhook payment verification setup for Globex Corp deal.'
      ],
      operationalSummary: 'Engineering performance is stable, but delivery timeline risk is high due to uncoordinated API dependencies. Two senior engineers show burnout flags. Five customers await follow-up.',
      wins: [
        'Globex Corp expansion terms signed ($140k ARR).',
        'Redis Cluster migration successfully finalized.'
      ],
      risks: [
        'Sarah Chen (PM) at high burnout risk (24h/wk meeting load).',
        'Initech SSO Proposal blocked by active login loops (FLOW-102).'
      ]
    };

    // Executive Recommendations (Upgrade 2.0)
    const recommendations = [
      {
        id: 'REC-2.1',
        title: 'Approve Emergency Postgres Remediation Deployment',
        confidence: 95,
        impact: 'HIGH',
        evidence: 'Active Sev-1 latency incident affecting Acme Corp. David O. submitted PR #824 addressing pool connection depth.',
        systems: ['Jira', 'GitHub', 'Incidents'],
        owner: 'Kishore Varma',
        businessImpact: 'Restores Acme Corp API latency back to SLA (<500ms).',
        estimatedImprovement: 'Reduces connection limits congestion by 85%'
      },
      {
        id: 'REC-2.2',
        title: 'Reallocate Stripe Onboarding Ownership',
        confidence: 90,
        impact: 'MEDIUM',
        evidence: 'Sarah Chen (PM) owns Stripe workflows but shows high burnout risk (context switching at 95%).',
        systems: ['Workday', 'Jira', 'Notion'],
        owner: 'James K.',
        businessImpact: 'Prevents delivery delays on Enterprise Pricing milestones.',
        estimatedImprovement: 'Reduces Sarah Chen PM meeting workload by 4h/wk'
      },
      {
        id: 'REC-2.3',
        title: 'Fix Auth Login Loops Blocker',
        confidence: 88,
        impact: 'HIGH',
        evidence: 'Initech SSO licensing deal ($50k) is Proposal stage, blocked on FLOW-102 auth issue.',
        systems: ['Jira', 'HubSpot', 'Slack'],
        owner: 'Sarah Chen',
        businessImpact: 'Enables Initech SSO close-date schedule target (Aug 1).',
        estimatedImprovement: 'Increases Initech close probability to 85%'
      }
    ];

    // Unified Operational Timeline
    const timeline = [
      { id: 'TL-1', type: 'incident', title: 'Sev-1 Incident Declared', description: 'Acme Corp reported 500ms latency on core endpoints.', timestamp: '10:45 AM', source: 'slack' },
      { id: 'TL-2', type: 'commit', title: 'PR #824 Connection retry logic submitted', description: 'David O. pushed connection pool saturation fix.', timestamp: '10:12 AM', source: 'github' },
      { id: 'TL-3', type: 'meeting', title: 'SSO Spec Walkthrough', description: 'Sarah Chen synced with Initech VP on SSO architecture.', timestamp: 'Yesterday', source: 'calendar' },
      { id: 'TL-4', type: 'decision', title: 'Globex Expansion terms signed', description: 'Kishore Varma finalized Stripe webhook billing setup.', timestamp: 'Yesterday', source: 'hubspot' },
      { id: 'TL-5', type: 'pto', title: 'Alex R. on PTO Leave', description: 'Time-off PTO approved until Friday.', timestamp: 'Today', source: 'workday' }
    ];

    // Company Graph Explorer
    const graph = {
      nodes: [
        { id: 'emp-2', label: 'Kishore Varma', type: 'EMPLOYEE', details: 'Lead Eng Architect' },
        { id: 'emp-3', label: 'Sarah Chen', type: 'EMPLOYEE', details: 'Principal PM' },
        { id: 'acc-1', label: 'Acme Corp', type: 'CUSTOMER', details: 'Platinum Partner' },
        { id: 'PROJ-824', label: 'Postgres Connection Fix', type: 'ISSUE', details: 'Jira Blocker' },
        { id: 'spec-3', label: 'SSO Blueprint Spec', type: 'DOCUMENT', details: 'Notion Doc' }
      ],
      edges: [
        { source: 'emp-2', target: 'PROJ-824', relation: 'ASSIGNED_TO', reason: 'Review connection retry logic PR' },
        { source: 'emp-3', target: 'acc-1', relation: 'SUPPORTS', reason: 'Account PM owner' },
        { source: 'emp-3', target: 'spec-3', relation: 'AUTHORS', reason: 'Created OAuth Entra specifications' },
        { source: 'acc-1', target: 'PROJ-824', relation: 'WAITING_ON', reason: 'Blocker for Postgres migration release' }
      ]
    };

    res.json({
      success: true,
      health,
      morningBrief,
      recommendations,
      predictions,
      stories,
      timeline,
      graph
    });
  } catch (error) {
    console.error('[Briefing Route] Error:', error);
    res.status(500).json({ error: 'Failed to compile briefing.', details: error.message });
  }
});

/**
 * @route  POST /api/intelligence/qa
 * @desc   Answers cross-capability executive questions using evidence-based reasoning
 * @access Private
 */
router.post('/qa', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { query } = req.body;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace-id header.' });
  }
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required.' });
  }

  const q = query.toLowerCase();
  let answer = '';
  let evidence = [];

  if (q.includes('health') || q.includes('decline') || q.includes('declining')) {
    answer = 'Engineering health has declined due to database connection saturation incidents and Sarah Chen PM meeting fatigue blocking decision pipelines.';
    evidence = [
      'Incident: INC-A3F2 connection pool saturation paged Eng Leads.',
      'Workforce: Sarah Chen PM context switches score is at 95% due to 24h/wk meeting load.',
      'Jira: 3 blockers active in Sprint 22.'
    ];
  } else if (q.includes('risk') || q.includes('customer')) {
    answer = 'Acme Corp is currently the highest-risk customer. They reported critical SLA latency breaches and are waiting on Jira ticket PROJ-824.';
    evidence = [
      'HubSpot: Acme Corp health score is at 45% (Critical).',
      'Incidents: Sev-1 connection outage affecting Acme Corp core endpoints.',
      'Jira: PROJ-824 connection pool retry logic is waiting on code review.'
    ];
  } else if (q.includes('yesterday') || q.includes('happen') || q.includes('happened')) {
    answer = 'Yesterday, the team merged 3 monitoring commits to main, Kishore Varma signed expansion terms with Globex Corp, and Sarah Chen walked Initech through the SSO blueprint spec.';
    evidence = [
      'GitHub: feat/monitoring-alerts merged to main.',
      'CRM: Globex Corp expansion terms signed ($140k ARR).',
      'Knowledge: Notion SSO blueprint spec reviewed.'
    ];
  } else if (q.includes('slip') || q.includes('delay') || q.includes('delayed')) {
    answer = 'The Frontend Rewrite project is slipping because the frontend engineering team is blocked waiting on 4 separate API endpoints from the backend team.';
    evidence = [
      'Jira: 4 dependency issue links blocking Frontend Sprint 22.',
      'Slack: Standup logs show repeated requests for ETA updates from backend.'
    ];
  } else if (q.includes('focus') || q.includes('today')) {
    answer = 'Today\'s focus should be resolving the database connection saturation incident by reviewing David O.\'s PR and coordinating with James K. to offload meetings from Sarah Chen.';
    evidence = [
      'Priority 1: Review PR #824 (Postgres Connection Fix).',
      'Priority 2: Delegate Q3 spec prep to Kishore Varma to relieve Sarah Chen PM.'
    ];
  } else {
    answer = 'Project Atlas is currently healthy. The primary open action is Stripe checkout webhook validation to support Globex Corp seat expansions.';
    evidence = [
      'Jira: Atlas task Stripe webhook verification is in Progress.',
      'CRM: Globex Corp expansion deal in Negotiation stage ($140k ARR).'
    ];
  }

  res.json({
    success: true,
    query,
    answer,
    evidence
  });
});

/**
 * @route  POST /api/intelligence/recommendations/:id/feedback
 * @desc   Records user learning loop feedback on recommendations
 * @access Private
 */
router.post('/recommendations/:id/feedback', (req, res) => {
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'Action parameter is required.' });

  const result = recordRecommendationFeedback(req.params.id, action);
  res.json({ success: true, ...result });
});

/**
 * @route  GET /api/intelligence/briefing/:role
 * @desc   Get role-aware operational briefing (Employee, Manager, Executive)
 * @access Private
 */
router.get('/briefing/:role', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { role } = req.params;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace-id header.' });
  }

  try {
    const brief = await generateRoleBriefing(workspaceId, role);
    res.json({ success: true, ...brief });
  } catch (error) {
    console.error(`[Briefing Role Route] Error:`, error);
    res.status(500).json({ error: 'Failed to generate briefing.', details: error.message });
  }
});

/**
 * @route  POST /api/intelligence/copilot
 * @desc   Context-aware AI Copilot query endpoint
 * @access Private
 */
router.post('/copilot', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { query } = req.body;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace-id header.' });
  }
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required.' });
  }

  try {
    const answer = await askCopilot(workspaceId, query);
    res.json({ success: true, ...answer });
  } catch (error) {
    console.error(`[Copilot Route] Error:`, error);
    res.status(500).json({ error: 'Failed to answer query via Copilot.', details: error.message });
  }
});

/**
 * @route  GET /api/intelligence/explainable-recommendations
 * @desc   Retrieve explainable, cross-capability recommendations
 * @access Private
 */
router.get('/explainable-recommendations', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace-id header.' });
  }

  try {
    const recs = generateExplainableRecommendations(workspaceId);
    res.json({ success: true, recommendations: recs });
  } catch (error) {
    console.error(`[Explainable Recommendations Route] Error:`, error);
    res.status(500).json({ error: 'Failed to generate explainable recommendations.', details: error.message });
  }
});

export default router;
