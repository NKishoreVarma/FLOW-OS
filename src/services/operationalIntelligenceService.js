/**
 * FLOW OS — Operational Intelligence Service
 *
 * Reasoning layer that correlates events, calculates predictions,
 * generates operational stories, and trains a recommendation feedback learning loop.
 */

// Learning Loop feedback repository
const feedbackWeights = {
  'REC-2.1': { weight: 0.95, count: 0 },
  'REC-2.2': { weight: 0.90, count: 0 },
  'REC-2.3': { weight: 0.88, count: 0 }
};

// ── Event Correlation Engine ────────────────────────────────────────────────
export function correlateEvents(events) {
  // Groups timeline events by semantic context tags
  const groups = {
    outageRemediation: [],
    billingExpansion: [],
    ssoSetup: []
  };

  events.forEach(evt => {
    const l = evt.title.toLowerCase() + ' ' + evt.description.toLowerCase();
    if (l.includes('latency') || l.includes('outage') || l.includes('remediation') || l.includes('retry') || l.includes('824')) {
      groups.outageRemediation.push(evt);
    } else if (l.includes('stripe') || l.includes('globex') || l.includes('expansion') || l.includes('billing')) {
      groups.billingExpansion.push(evt);
    } else if (l.includes('sso') || l.includes('okta') || l.includes('entra') || l.includes('initech') || l.includes('loop')) {
      groups.ssoSetup.push(evt);
    }
  });

  return groups;
}

// ── Predictive Intelligence Engine ──────────────────────────────────────────
// Phase 11.5: superseded by the real Predictive Workspace Intelligence engine
// (src/predictions). This shim delegates to it and maps the top predictions to
// the legacy morning-brief shape. Async now — callers must await.
export async function generatePredictions(workspaceId) {
  const { predict } = await import('../predictions/index.js');
  const { predictions } = await predict(workspaceId, { persist: false });
  const byType = Object.fromEntries(predictions.map(p => [p.type, p]));
  const shape = (p) => p ? { probability: p.probability, indicator: p.riskLevel.toUpperCase() + (p.target?.name ? ` (${p.target.name})` : ''), evidence: p.supportingEvidence } : { probability: 0, indicator: 'LOW', evidence: ['Insufficient evidence.'] };
  return {
    deliveryDelay:     shape(byType.SPRINT_DELAY),
    customerChurn:     shape(byType.CHURN_RISK),
    sprintCompletion:  shape(byType.SPRINT_DELAY),
    burnoutRisk:       shape(byType.BURNOUT_RISK),
    reviewBottlenecks: shape(byType.PR_BOTTLENECK || byType.REVIEW_DELAY),
    deploymentRisk:    shape(byType.DEPLOYMENT_RISK),
  };
}

// ── Operational Story Builder ───────────────────────────────────────────────
export function generateOperationalStories(workspaceId) { // eslint-disable-line no-unused-vars
  return [
    {
      id: 'story-1',
      title: 'Frontend Rewrite Delivery Slippage',
      narrative: 'The Frontend Rewrite project has slipped by 4 days because the frontend team is waiting on 4 separate API endpoints from the backend group. Communication logs in Slack show repeated requests for ETA updates, while engineering velocity dropped 14% due to connection retry pool limits gating deployment pipelines.',
      status: 'Delayed',
      impact: 'Acme Corp API Latency Escalation'
    },
    {
      id: 'story-2',
      title: 'Initech SSO Proposal Gating',
      narrative: 'The Initech core SSO licensing deal ($50k) is stalled at the Proposal stage. Initech engineering flagged severe concerns regarding login auth loops during the SSO walkthrough. This blocker is waiting on issue FLOW-102.',
      status: 'Blocked',
      impact: 'Gated close-date milestone (Aug 1)'
    },
    {
      id: 'story-3',
      title: 'Globex Enterprise Expansion',
      narrative: 'Globex Corp expansion terms signed ($140k MRR). The final unfulfilled milestone is the Stripe checkout webhook validation. Action items are assigned to Finance and platform lead Kishore Varma.',
      status: 'On Track',
      impact: 'MRR Revenue Growth'
    }
  ];
}

// ── Proactive Recommendations 2.0 ───────────────────────────────────────────
export function getProactiveRecommendations(workspaceId) { // eslint-disable-line no-unused-vars
  const baseRecommendations = [
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

  // Adjust confidence scores dynamically based on the learning loop feedback registry
  return baseRecommendations.map(rec => {
    const feedback = feedbackWeights[rec.id];
    if (feedback) {
      // Calculate adjusted confidence: e.g. scale based on feedback count and weight changes
      const adjusted = Math.round(rec.confidence * feedback.weight);
      return {
        ...rec,
        confidence: Math.max(10, Math.min(99, adjusted))
      };
    }
    return rec;
  });
}

// ── Learning Loop Feedback Registry ─────────────────────────────────────────
export function recordRecommendationFeedback(recommendationId, action) {
  if (!feedbackWeights[recommendationId]) {
    feedbackWeights[recommendationId] = { weight: 1.0, count: 0 };
  }

  const record = feedbackWeights[recommendationId];
  record.count += 1;

  if (action === 'accept' || action === 'complete') {
    // Increase recommendation confidence weight coefficient
    record.weight = Math.min(1.2, record.weight + 0.05);
  } else if (action === 'reject') {
    // Penalize recommendation confidence weight coefficient
    record.weight = Math.max(0.5, record.weight - 0.10);
  } else if (action === 'ignore') {
    record.weight = Math.max(0.7, record.weight - 0.02);
  }

  return {
    recommendationId,
    action,
    adjustedWeight: Number(record.weight.toFixed(2)),
    feedbackCount: record.count
  };
}

// ── Decision Memory Store ───────────────────────────────────────────────────
const inMemoryDecisions = [
  { id: 'DEC-001', text: 'Adopt pgvector as primary vector store, deprecating in-memory fallback in production.', date: 'Jun 25, 2026', author: 'James K. (CTO)', alternatives: 'We considered Pinecone and Milvus. Selected pgvector to maintain low deployment complexity.', outcome: 'Reduced infrastructure overhead, unified backup routines.' },
  { id: 'DEC-002', text: 'Migrate Redis to Redis Cluster for BullMQ job queue reliability.', date: 'Jun 26, 2026', author: 'Alex R.', alternatives: 'Considered staying on single Redis node. Rejected due to job loss risks under surge.', outcome: 'BullMQ queue reliability at 100% since migration.' },
  { id: 'DEC-003', text: 'FLOW OS v2.0 feature freeze on July 15. No new features until launch.', date: 'Jun 27, 2026', author: 'Sarah Chen (PM)', alternatives: 'Considered rolling deployment. Rejected to ensure stable regression testing cycles.', outcome: 'Gave QA team clean freeze release to dry run automated validations.' }
];

export function getDecisionMemory() {
  return inMemoryDecisions;
}

export function recordDecision(decisionText, alternatives, outcome, author) {
  const newDec = {
    id: `DEC-${Date.now()}`,
    text: decisionText,
    date: new Date().toLocaleDateString(),
    author: author || 'System',
    alternatives: alternatives || 'None logged.',
    outcome: outcome || 'Pending review.'
  };
  inMemoryDecisions.push(newDec);
  return newDec;
}
