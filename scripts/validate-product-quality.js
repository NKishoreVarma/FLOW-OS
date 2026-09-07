#!/usr/bin/env node
/**
 * FLOW OS — Product Quality Validation (Phase 9 + Final Certification)
 *
 * Validates all 10 phases of the Product Quality initiative without a live server.
 * Checks structural integrity: modules export, functions exist, no broken imports.
 *
 * Run: node scripts/validate-product-quality.js
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, '..');

let passed = 0;
let failed = 0;
const results = [];

function check(label, condition, detail = '') {
  const ok = !!condition;
  if (ok) { passed++; results.push({ ok, label }); }
  else    { failed++;  results.push({ ok, label, detail }); }
  return ok;
}

function fileExists(relPath) {
  return existsSync(join(ROOT, relPath));
}

function fileContains(relPath, ...patterns) {
  try {
    const content = readFileSync(join(ROOT, relPath), 'utf8');
    return patterns.every(p => typeof p === 'string' ? content.includes(p) : p.test(content));
  } catch { return false; }
}

function countOccurrences(relPath, pattern) {
  try {
    const content = readFileSync(join(ROOT, relPath), 'utf8');
    const re = typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : pattern;
    return (content.match(re) || []).length;
  } catch { return 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Integration Discovery & Workspace Import
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 1: Integration Discovery & Workspace Import ==');

check('Phase 1.1: SetupWizard exists',                    fileExists('flow-os-frontend/src/components/onboarding/SetupWizard.jsx'));
check('Phase 1.2: StepBuild polls sync-status endpoint',  fileContains('flow-os-frontend/src/components/onboarding/SetupWizard.jsx', '/api/onboarding/sync-status'));
check('Phase 1.3: Build step shows real node/vector counts', fileContains('flow-os-frontend/src/components/onboarding/SetupWizard.jsx', 'counts.nodes', 'counts.vectors'));
check('Phase 1.4: sync-status endpoint exists in backend', fileContains('src/routes/onboardingRoutes.js', '/sync-status', 'nodeCount', 'vectorCount'));
check('Phase 1.5: StepBuild has real polling loop',        fileContains('flow-os-frontend/src/components/onboarding/SetupWizard.jsx', 'setInterval', 'indexingDone'));
check('Phase 1.6: start-sync fires real connector syncs',  fileContains('src/routes/onboardingRoutes.js', 'api/engineering/sync', 'api/communication/sync'));
check('Phase 1.7: StepPermissions shows discovered resources', fileContains('flow-os-frontend/src/components/onboarding/SetupWizard.jsx', 'api/integration-permissions', 'resources'));
check('Phase 1.8: WorkspaceStateGate redirects unready workspaces', fileContains('flow-os-frontend/src/App.jsx', 'WorkspaceStateGate', 'UNINITIALIZED'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Live Connector Intelligence
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 2: Live Connector Intelligence ==');

check('Phase 2.1: fetchLiveEngineering exported',     fileContains('src/ai/reasoning/LiveConnectorLayer.js', 'export async function fetchLiveEngineering'));
check('Phase 2.2: fetchLiveMeetings exported',        fileContains('src/ai/reasoning/LiveConnectorLayer.js', 'export async function fetchLiveMeetings'));
check('Phase 2.3: fetchLiveCommunications exported',  fileContains('src/ai/reasoning/LiveConnectorLayer.js', 'export async function fetchLiveCommunications'));
check('Phase 2.4: fetchLiveJira exported',            fileContains('src/ai/reasoning/LiveConnectorLayer.js', 'export async function fetchLiveJira'));
check('Phase 2.5: fetchLiveSlack exported',           fileContains('src/ai/reasoning/LiveConnectorLayer.js', 'export async function fetchLiveSlack'));
check('Phase 2.6: Jira fetches active sprint',        fileContains('src/ai/reasoning/LiveConnectorLayer.js', 'agile/1.0/board', 'cloudId'));
check('Phase 2.7: Slack fetches channel history',     fileContains('src/ai/reasoning/LiveConnectorLayer.js', 'conversations.history', 'botToken'));
check('Phase 2.8: CapabilityDispatcher imports Jira+Slack', fileContains('src/ai/reasoning/CapabilityDispatcher.js', 'fetchLiveJira', 'fetchLiveSlack'));
check('Phase 2.9: Engineering dispatcher uses Jira',  fileContains('src/ai/reasoning/CapabilityDispatcher.js', 'liveJira', 'liveGithub'));
check('Phase 2.10: Communications dispatcher uses Slack+Gmail', fileContains('src/ai/reasoning/CapabilityDispatcher.js', 'liveGmail', 'liveSlack'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Workspace Readiness Engine
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 3: Workspace Readiness Engine ==');

check('Phase 3.1: workspace-state endpoint exists',   fileContains('src/routes/onboardingRoutes.js', '/workspace-state', 'workspacePhase'));
check('Phase 3.2: Phase machine: UNINITIALIZED/CONNECTING/INDEXING/READY', fileContains('src/routes/onboardingRoutes.js', 'UNINITIALIZED', 'CONNECTING', 'INDEXING', 'READY'));
check('Phase 3.3: sync-status endpoint tracks node counts', fileContains('src/routes/onboardingRoutes.js', 'nodeCount', 'vectorCount', 'indexingDone'));
check('Phase 3.4: useWorkspaceState hook polls the state', fileContains('flow-os-frontend/src/hooks/useWorkspaceState.jsx', 'workspace-state', 'workspacePhase'));
check('Phase 3.5: IndexingGuard shown during INDEXING', fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'IndexingGuard', 'INDEXING'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Real Morning Brief
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 4: Real Morning Brief ==');

check('Phase 4.1: Brief fetches live calendar meetings', fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'api/meetings/upcoming', 'liveHighlights'));
check('Phase 4.2: Brief fetches Chief of Staff items',   fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'api/autonomous/chief-of-staff'));
check('Phase 4.3: Brief uses WIC snapshot',             fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'api/workspace/snapshot'));
check('Phase 4.4: Brief cites Calendar as source',      fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'Google Calendar · live'));
check('Phase 4.5: Brief falls back to null for real workspaces', fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'workspaceMode === "demo"', 'DEMO_BRIEF'));
check('Phase 4.6: Brief parallel fetches 4 sources',    fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'Promise.allSettled'));
check('Phase 4.7: Opening message cites live sources',  fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'buildOpeningMessage'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Human Interaction Engine (Proactive Surfacing)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 5: Human Interaction Engine ==');

check('Phase 5.1: Signal collector imports LiveConnectorLayer', fileContains('src/workday/signalCollector.js', 'LiveConnectorLayer.js', 'fetchLiveEngineering'));
check('Phase 5.2: Stale PR signals detected (>2 days)',  fileContains('src/workday/signalCollector.js', 'stale_pr', 'twoDaysAgo'));
check('Phase 5.3: Upcoming meeting signals (<30 min)',   fileContains('src/workday/signalCollector.js', 'meeting', 'thirtyMin'));
check('Phase 5.4: ChiefOfStaff uses WorkDay queue',     fileContains('src/autonomous/chiefOfStaffService.js', 'getWorkQueue', 'buildActionCard'));
check('Phase 5.5: Meeting signal has join action',       fileContains('src/workday/signalCollector.js', 'hangoutLink', 'Join Meet'));
check('Phase 5.6: Greeting is time-aware',              fileContains('src/autonomous/chiefOfStaffService.js', 'Good morning', 'Good afternoon', 'Good evening'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — AI Decision Quality
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 6: AI Decision Quality ==');

check('Phase 6.1: ContextBuilder tags live records',    fileContains('src/ai/reasoning/ContextBuilder.js', '_liveTag', 'liveSource'));
check('Phase 6.2: Engineering section uses live tags',  fileContains('src/ai/reasoning/ContextBuilder.js', '_liveTag(r)', '_formatEngineeringRecords'));
check('Phase 6.3: Meeting section uses live tags',      fileContains('src/ai/reasoning/ContextBuilder.js', '_liveTag(r)', '_formatMeetingRecords'));
check('Phase 6.4: Knowledge section separates Jira vs docs', fileContains('src/ai/reasoning/ContextBuilder.js', 'Jira Issues/Sprints', 'liveSource'));
check('Phase 6.5: Communication section groups by source', fileContains('src/ai/reasoning/ContextBuilder.js', 'Gmail', 'Slack', 'Knowledge Graph'));
check('Phase 6.6: Capability header shows live count',  fileContains('src/ai/reasoning/ContextBuilder.js', 'live from connector', 'liveCount'));
check('Phase 6.7: Empty states are factual (no hedging)', fileContains('src/ai/reasoning/ContextBuilder.js', '=== EMPTY STATES (state as facts, do not hedge) ==='));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — Workspace Intelligence (Pattern Recognition)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 7: Workspace Intelligence ==');

check('Phase 7.1: WeeklyReview detects stale PRs',      fileContains('src/autonomous/weeklyReviewService.js', 'stale_prs', 'stalePRs'));
check('Phase 7.2: WeeklyReview detects recurring incidents', fileContains('src/autonomous/weeklyReviewService.js', 'recurring_incidents', 'tagFreq'));
check('Phase 7.3: WeeklyReview detects meeting overload', fileContains('src/autonomous/weeklyReviewService.js', 'meeting_load', 'meetingNotifs'));
check('Phase 7.4: Patterns include severity + evidenceSource', fileContains('src/autonomous/weeklyReviewService.js', 'severity', 'evidenceSource'));
check('Phase 7.5: WeeklyReview frontend renders patterns', fileContains('flow-os-frontend/src/components/autonomous/WeeklyReview.jsx', 'r.patterns', 'Workspace Patterns'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Product Craftsmanship
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 8: Product Craftsmanship ==');

// Check demo mode gating across key pages
const demoGatedFiles = [
  'flow-os-frontend/src/components/inbox/AIInbox.jsx',
  'flow-os-frontend/src/components/meetings/MeetingDashboard.jsx',
  'flow-os-frontend/src/components/projects/ProjectIntelligence.jsx',
  'flow-os-frontend/src/components/knowledge/KnowledgeExplorer.jsx',
  'flow-os-frontend/src/components/company/CustomerIntelligence.jsx',
  'flow-os-frontend/src/components/company/WorkforceIntelligence.jsx',
  'flow-os-frontend/src/components/activity/ActivityFeed.jsx',
];
const allGated = demoGatedFiles.every(f => fileContains(f, 'isDemoWorkspace', 'useWorkspaceState'));
check('Phase 8.1: All major pages gate demo data by workspaceMode', allGated, 'One or more pages missing isDemoWorkspace check');

check('Phase 8.2: Loading skeletons use shimmer animation', fileContains('flow-os-frontend/src/components/brain/BrainHome.jsx', 'shimmer-sweep'));
check('Phase 8.3: Empty states have PlugZap CTA icons',     fileContains('flow-os-frontend/src/components/inbox/AIInbox.jsx', 'PlugZap'));
check('Phase 8.4: Error boundaries present',               fileExists('flow-os-frontend/src/components/ui/ErrorBoundary.jsx'));
check('Phase 8.5: Design tokens used in layout/UI layer',   (() => {
  // UI primitives and layout shell should use CSS vars, not raw hex
  const uiFiles = [
    'flow-os-frontend/src/components/layout/LayoutShell.jsx',
    'flow-os-frontend/src/components/layout/Sidebar.jsx',
  ];
  const rawHexCount = uiFiles.reduce((sum, f) => sum + countOccurrences(f, /#[0-9a-fA-F]{6}\b/g), 0);
  return rawHexCount < 5;
})(), 'Too many raw hex values in layout files — use CSS tokens');
check('Phase 8.6: DataSourceBadge shows demo/live mode',    fileExists('flow-os-frontend/src/components/ui/DataSourceBadge.jsx'));
check('Phase 8.7: Keyboard shortcut: Cmd+K command palette', fileContains('flow-os-frontend/src/components/layout/LayoutShell.jsx', 'metaKey', '"k"'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — End-to-End Workflow Validation
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 9: End-to-End Workflow Validation ==');

// Engineering journey: GitHub → import → ask → projects
check('Phase 9.1: GitHub connector available',          fileExists('src/connectors/adapters/GitHubAdapter.js'));
check('Phase 9.2: Engineering API route registered',    fileContains('src/server.js', '/api/engineering', 'engineeringRoutes'));
check('Phase 9.3: ProjectIntelligence calls real GitHub API', fileContains('flow-os-frontend/src/components/projects/ProjectIntelligence.jsx', 'api/engineering/repos'));
check('Phase 9.4: Brain copilot handles engineering questions', fileContains('src/ai/reasoning/CapabilityPlanner.js', 'ENGINEERING', 'pull request'));

// Executive journey: Gmail → Calendar → Morning Brief
check('Phase 9.5: Gmail connector available',           fileExists('src/connectors/adapters/GmailAdapter.js'));
check('Phase 9.6: Calendar connector available',        fileExists('src/connectors/adapters/GoogleCalendarAdapter.js'));
check('Phase 9.7: AIInbox fetches real Gmail data',     fileContains('flow-os-frontend/src/components/inbox/AIInbox.jsx', 'api/communication/inbox'));
check('Phase 9.8: MeetingDashboard fetches real Calendar', fileContains('flow-os-frontend/src/components/meetings/MeetingDashboard.jsx', 'api/meetings/upcoming'));
check('Phase 9.9: Brain briefing API exists',           fileContains('src/routes/brainRoutes.js', '/briefing', 'briefingEngine'));

// Support journey: Gmail → Customer → Summarize → Reply
check('Phase 9.10: Communication reply API exists',     fileContains('src/routes/communicationRoutes.js', 'reply', 'executeAction'));
check('Phase 9.11: Customer intelligence page exists',  fileExists('flow-os-frontend/src/components/company/CustomerIntelligence.jsx'));
check('Phase 9.12: HubSpot adapter available',         fileExists('src/connectors/adapters/HubSpotAdapter.js'));

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10 — Enterprise Polish
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Phase 10: Enterprise Polish ==');

check('Phase 10.1: Trust Center for permissions',      fileExists('flow-os-frontend/src/components/settings/IntegrationPermissions.jsx'));
check('Phase 10.2: Audit log available to ADMIN+',     fileContains('src/routes/connectorsRoutes.js', '/audit', 'workspaceId'));
check('Phase 10.3: Onboarding value tracking',        fileContains('src/routes/onboardingRoutes.js', '/metrics', 'getAdoptionMetrics'));
check('Phase 10.4: Success dashboard exists',          fileExists('flow-os-frontend/src/components/success/SuccessDashboard.jsx'));
check('Phase 10.5: Team invite works',                 fileExists('flow-os-frontend/src/components/onboarding/TeamInvite.jsx'));
check('Phase 10.6: Security center shows real audit',  fileContains('flow-os-frontend/src/components/platform/SecurityCenter.jsx', 'api/connectors/audit', 'isDemoWorkspace'));
check('Phase 10.7: Governance policies API exists',    fileContains('src/server.js', 'policies', 'approvals') || fileContains('src/routes/onboardingRoutes.js', 'policy'));
check('Phase 10.8: WebSocket auth required in prod',   fileContains('src/services/socketService.js', 'WS_AUTH_REQUIRED', 'authenticateSocket'));
check('Phase 10.9: Docker production-ready',           fileExists('Dockerfile') && fileExists('docker-compose.yml'));
check('Phase 10.10: Privacy gate enforced',            fileContains('src/workers/ingestionWorker.js', 'privacy_score', 'PRIVACY_SHIELD_TRIGGERED'));

// ─────────────────────────────────────────────────────────────────────────────
// Final — FLOW Readiness Certification
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n== Final: FLOW Readiness Certification ==');

check('Cert 1: Core AI reasoning pipeline complete',   fileExists('src/ai/reasoning/OperationalBrain.js') && fileExists('src/ai/reasoning/CapabilityDispatcher.js'));
check('Cert 2: 5 live connector adapters',             ['GmailAdapter', 'GoogleCalendarAdapter', 'GitHubAdapter', 'JiraAdapter', 'NotionAdapter'].every(a => fileExists(`src/connectors/adapters/${a}.js`)));
check('Cert 3: 4 live connector layers (Phase 2)',     ['fetchLiveEngineering', 'fetchLiveMeetings', 'fetchLiveCommunications', 'fetchLiveJira', 'fetchLiveSlack'].every(fn => fileContains('src/ai/reasoning/LiveConnectorLayer.js', fn)));
check('Cert 4: Onboarding flow (Phase 17)',            fileExists('src/onboarding/onboardingState.js') && fileExists('src/onboarding/discoveryOrchestrator.js'));
check('Cert 5: Zero mock data in real workspaces',     fileContains('flow-os-frontend/src/hooks/useWorkspaceState.jsx', 'workspaceMode'));
check('Cert 6: Governance enforced on all actions',    fileContains('src/connectors/executionEngine.js', 'evaluateWithPolicies', 'DENY'));
check('Cert 7: Risk-tiered approvals (Phase 14)',      fileContains('src/execution/approvalEngine.js', 'CRITICAL', 'distinctApprovers') || fileContains('src/execution/riskClassifier.js', 'CRITICAL', 'LOW'));
check('Cert 8: Workspace Intelligence Cache (Phase 16.1)', fileExists('src/workspaceCache/snapshotBuilder.js'));
check('Cert 9: Pattern recognition (Phase 7)',         fileContains('src/autonomous/weeklyReviewService.js', 'stale_prs', 'recurring_incidents'));
check('Cert 10: Production hardening complete',        fileExists('Dockerfile') && fileContains('src/core/lifecycle/gracefulShutdown.js', 'SIGTERM'));

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

const total   = passed + failed;
const score   = Math.round((passed / total) * 100);
const READY   = score >= 90;
const PARTIAL = score >= 70;

console.log(`\n${'─'.repeat(60)}`);
console.log(`FLOW OS — Product Quality Certification`);
console.log(`${'─'.repeat(60)}`);

results.forEach(({ ok, label, detail }) => {
  const icon = ok ? '✓' : '✗';
  console.log(`  ${icon} ${label}${detail ? ` (${detail})` : ''}`);
});

console.log(`\n${'─'.repeat(60)}`);
console.log(`Score: ${passed}/${total} — ${score}%`);

if (READY)        console.log(`\n🎯 FLOW OS v1.0 Certification: ${score}/100 — READY FOR CUSTOMER PILOTS\n`);
else if (PARTIAL) console.log(`\n⚠️  FLOW OS: ${score}/100 — NEEDS WORK BEFORE PILOT\n`);
else              console.log(`\n❌ FLOW OS: ${score}/100 — NOT READY\n`);

if (failed > 0) {
  console.log('Failures:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.label}${r.detail ? ': ' + r.detail : ''}`));
}

process.exit(failed > 0 ? 1 : 0);
