/**
 * Helios Software Demo Scenarios
 * Fixed named entities that anchor the demo narrative.
 * These IDs are stable across regenerations (deterministic faker seed=12345).
 *
 * Department offsets (from company.js headcounts):
 *   exec:          emp-001 – emp-008
 *   eng-platform:  emp-009 – emp-093
 *   eng-analytics: emp-094 – emp-153
 *   eng-connect:   emp-154 – emp-208
 *   eng-guard:     emp-209 – emp-248
 *   product:       emp-249 – emp-276
 *   design:        emp-277 – emp-294
 *   qa:            emp-295 – emp-316
 *   devops:        emp-317 – emp-336
 *   cs:            emp-337 – emp-381
 *   sales:         emp-382 – emp-431
 *   gtm:           emp-432 – emp-450
 */

// ─── Key Employee IDs ──────────────────────────────────────────────────────────
export const EMP = {
  CEO:          'emp-001',
  CTO:          'emp-009',  // VP Engineering (first of eng-platform)
  VPEng:        'emp-010',  // Sr. Eng Manager
  StaffEng1:    'emp-013',  // David Park — overloaded, Project Atlas tech lead
  StaffEng2:    'emp-014',  // Priya Nair
  EngMgr1:      'emp-011',
  EngMgr2:      'emp-012',
  CISO:         'emp-209',  // First of guard dept
  VPProduct:    'emp-249',  // First of product dept
  PMAtlas:      'emp-251',  // PM for Project Atlas
  PMRelease:    'emp-252',  // PM for Release 3.2
  DevOpsLead:   'emp-317',  // First of devops
  SRE1:         'emp-318',
  SRE2:         'emp-319',
  QALead:       'emp-295',
  VPSuccess:    'emp-337',
  CSM1:         'emp-341',  // CSM for Acme Corp
  CSM2:         'emp-342',
  VPSales:      'emp-382',
  AE1:          'emp-385',  // AE for Meridian Health
};

// ─── Key Customer IDs ──────────────────────────────────────────────────────────
export const CUST = {
  ACME:       'cust-acme-corp',
  MERIDIAN:   'cust-meridian-health',
  GLOBALTECH: 'cust-globaltech-solutions',
  QUANTUM:    'cust-quantumleap-ai',
  TECHVISION: 'cust-techvision-inc',
  FINEDGE:    'cust-finedge-capital',
  ROCKETSHIP: 'cust-rocketship-io',
  CLOUDNINE:  'cust-cloudnine-retail',
  PINNACLE:   'cust-pinnacle-logistics',
  NEXIGEN:    'cust-nexigen-pharma',
};

// ─── Key Project IDs ──────────────────────────────────────────────────────────
export const PROJ = {
  ATLAS:       'proj-atlas',
  RELEASE_32:  'proj-release-3-2',
  APOLLO:      'proj-apollo',
  GUARDIAN2:   'proj-guardian-2',
  MARKETPLACE: 'proj-marketplace',
  HERMES:      'proj-hermes',
  KRONOS:      'proj-kronos',
  POSEIDON:    'proj-poseidon',
  TITAN:       'proj-titan',
  ARES:        'proj-ares',
};

// ─── Key Incident IDs ─────────────────────────────────────────────────────────
export const INC = {
  P0_DB_OUTAGE:   'inc-001',  // Oct 2024 P0 database failover
  P1_AUTH_REGR:   'inc-042',  // Dec 2024 P1 auth regression (blocks Release 3.2)
  P1_MEMORY_LEAK: 'inc-076',  // Jan 2025 P1 memory leak (overnight incident)
  P2_PIPELINE:    'inc-035',
  P2_WEBHOOK:     'inc-058',
};

// ─── Key Jira Tickets ─────────────────────────────────────────────────────────
export const JIRA = {
  AUTH_TIMEOUT:   'HPLT-847',  // Auth token timeout — blocking Release 3.2
  DATA_EXPORT:    'HPLT-892',  // Data export failing for large datasets — blocks Acme Corp
  POLICY_ENGINE:  'HGRD-234',  // Guard policy engine returning incorrect decisions
  MEMORY_HOTFIX:  'HPLT-899',  // Memory leak hotfix — INC-076 follow-up
  SSO_SAML:       'HPLT-815',  // SSO/SAML implementation for Titan
  ATLAS_REFACTOR: 'HPLT-756',  // Core auth refactor for Project Atlas
};

// ─── Key Repository IDs ───────────────────────────────────────────────────────
export const REPO = {
  PLATFORM_API:  'repo-platform-api',
  AUTH_SERVICE:  'repo-platform-api',   // auth lives in the platform API service
  PLATFORM_WORKER: 'repo-platform-worker',
  ANALYTICS:     'repo-analytics-engine',
  CONNECT:       'repo-connect-core',
  GUARD:         'repo-guard-core',
  FRONTEND:      'repo-platform-ui',
  INFRA:         'repo-platform-infra',
};

// ─── Key PR IDs ───────────────────────────────────────────────────────────────
export const PR = {
  AUTH_FIX:      'pr-847',   // Auth service fix — stuck in review, blocking Release 3.2
  MEMORY_HOTFIX: 'pr-894',   // Memory leak hotfix — merged last night
  ATLAS_REFACTOR:'pr-756',
  DATA_EXPORT:   'pr-892',
};

// ─── Scenario: Release 3.2 Delay ─────────────────────────────────────────────
export const RELEASE_32_SCENARIO = {
  scheduledDate:   '2025-12-15',
  delayedToDate:   '2025-12-29',
  delayReason:     'Auth service regression discovered during QA regression testing on December 10 caused login failures for SSO-enabled enterprise accounts. PR #847 (fix: resolve token refresh race condition) has been open for review for 6 days. Primary reviewer David Park is on-call rotation and managing the INC-076 memory leak remediation concurrently. Three P1 Jira tickets are blocking the release gate: HPLT-847 (auth timeout), HPLT-892 (data export failing for large datasets), and HGRD-234 (policy engine returning incorrect decisions for custom roles). QA completed 78% of the regression suite with 2 critical failures outstanding.',
  blockingTickets: [JIRA.AUTH_TIMEOUT, JIRA.DATA_EXPORT, JIRA.POLICY_ENGINE],
  blockingPR:      PR.AUTH_FIX,
  decision:        'Engineering leadership decided on December 12, 2025 to delay Release 3.2 by two weeks to December 29 to ensure stability. CTO approved. PM team notified enterprise customers via email.',
};

// ─── Scenario: Overnight Incident (INC-076) ───────────────────────────────────
export const OVERNIGHT_INCIDENT = {
  id:              INC.P1_MEMORY_LEAK,
  detectedAt:      '2025-12-14T02:47:00Z',
  resolvedAt:      '2025-12-14T03:34:00Z',
  mttr:            47,
  affectedCustomers: [CUST.ACME, CUST.MERIDIAN, CUST.GLOBALTECH],
  description:     'Memory pool exhaustion in Platform API worker process v3.1.9 caused 503 errors for all requests to /api/v3/workflows endpoint. Monitoring alert triggered at 02:47 AM PST. SRE Priya Nair paged and began investigation. Root cause identified at 03:10 AM: unbounded in-memory cache in the workflow execution engine introduced in v3.1.9 (deployed December 13 at 6:30 PM). Hotfix PR #894 merged at 03:28 AM. Service fully restored by 03:34 AM. 3 enterprise customers affected: Acme Corp (highest severity — 847 failed workflow executions), Meridian Health (123 failed executions), GlobalTech Solutions (67 failed executions). P1 incident. Post-mortem scheduled for December 16.',
};

// ─── Scenario: Acme Corp Customer Risk ────────────────────────────────────────
export const ACME_SCENARIO = {
  customerId:      CUST.ACME,
  healthScore:     42,
  contractRenewal: '2025-12-28',
  arr:             285000,
  tier:            'enterprise',
  blockingIssues: [
    { ticket: JIRA.DATA_EXPORT, description: 'Data export failing for datasets > 10,000 rows. Acme Corp runs nightly batch exports of 50,000+ rows. This has been failing for 8 days. P1 ticket open.', daysOpen: 8 },
    { ticket: JIRA.AUTH_TIMEOUT, description: 'Auth token timeout affecting SSO integration. Their 1,200 users experience intermittent login failures during peak hours.', daysOpen: 6 },
    { incidentId: INC.P1_MEMORY_LEAK, description: 'INC-076 caused 847 failed workflow executions overnight December 14. Residual latency observed on their workflow dashboard.' },
  ],
  escalation:      'CTO Marcus Webb of Acme Corp emailed our VP Customer Success on December 11 expressing frustration with two ongoing P1 issues. Meeting scheduled for December 16. If issues not resolved by renewal date (December 28), likelihood of non-renewal is high per CSM assessment.',
};

// ─── Scenario: Engineering Velocity Decline ───────────────────────────────────
export const VELOCITY_DECLINE = {
  description:     'Engineering velocity has declined 23% over the past 6 weeks. Average PR review time increased from 18 hours to 31 hours since October 28. Sprint 8 completion rate: 62% (vs. team average of 84%). Root causes: (1) David Park (primary senior reviewer for Platform team) has been in on-call rotation for 3 consecutive weeks and is technical lead on Project Atlas, creating a review bottleneck. (2) Three concurrent P1 incidents (INC-042, INC-058, INC-076) pulled 4 engineers off sprint work for a combined 28 person-days in November. (3) Release 3.2 stabilization work created unplanned technical debt tickets that consumed 19% of sprint capacity.',
  overloadedEmp:   EMP.StaffEng1,
  sprintCompletion: 62,
  avgPRReviewHours: 31,
  previousAvgPRReviewHours: 18,
  startDate:       '2025-10-28',
};
