/**
 * Projects generator — 25 named engineering + product projects.
 * Anchors the narrative scenarios: Project Atlas, Release 3.2, etc.
 */
import { EMP, PROJ, JIRA, INC, REPO, RELEASE_32_SCENARIO, VELOCITY_DECLINE } from '../scenarios.js';

const STATUS = { ACTIVE: 'active', COMPLETED: 'completed', PAUSED: 'paused', PLANNING: 'planning' };
const PHASE  = { PLANNING: 'planning', DESIGN: 'design', DEV: 'development', TESTING: 'testing', RELEASE: 'release', MAINTENANCE: 'maintenance' };

const NAMED_PROJECTS = [
  // ── SCENARIO: Project Atlas ────────────────────────────────────────────────
  {
    id: PROJ.ATLAS,
    name: 'Project Atlas',
    slug: 'atlas',
    description: 'Complete rewrite of the Helios Platform core engine from a monolithic Node.js service to a distributed microservices architecture. Atlas introduces event sourcing, CQRS, and a new auth subsystem designed to support 10x customer growth. The project was originally scoped for Q3 2025 release but has been extended to Q1 2026 due to complexity of the auth service migration. 8 senior engineers assigned full-time. Current blocker: the legacy auth service tightly couples session management to workflow execution — extracting it requires rewriting all 47 workflow handler endpoints. PR #847 (auth token refresh fix) is blocking the auth module milestone.',
    status: STATUS.ACTIVE,
    phase: PHASE.DEV,
    percentComplete: 42,
    owner: EMP.CTO,
    teamLead: EMP.StaffEng1,
    team: [EMP.CTO, EMP.StaffEng1, EMP.StaffEng2, EMP.VPEng, EMP.EngMgr1, 'emp-015', 'emp-016', 'emp-017', 'emp-018'],
    pmOwner: EMP.PMAtlas,
    startDate: '2025-06-01',
    targetDate: '2026-03-31',
    originalTargetDate: '2025-09-30',
    jiraKey: 'HPLT',
    relatedRepos: [REPO.PLATFORM_API, REPO.AUTH_SERVICE],
    milestones: [
      { id: 'atlas-m1', name: 'Service decomposition design complete', status: 'completed', completedAt: '2025-07-15', description: 'Microservice boundaries defined, API contracts drafted, ADRs approved.' },
      { id: 'atlas-m2', name: 'Auth module extracted', status: 'in-progress', targetDate: '2025-12-31', description: 'Decouple session management from workflow engine. Blocking: PR #847 unreviewed for 6 days, reviewer (David Park) is on-call.' },
      { id: 'atlas-m3', name: 'Workflow engine rewrite', status: 'not-started', targetDate: '2026-01-31', description: 'Migrate 47 workflow handler endpoints to new event-sourced model.' },
      { id: 'atlas-m4', name: 'Beta: selected enterprise customers', status: 'not-started', targetDate: '2026-02-28' },
      { id: 'atlas-m5', name: 'GA Release', status: 'not-started', targetDate: '2026-03-31' },
    ],
    risks: [
      { severity: 'HIGH', description: 'David Park is the primary technical reviewer and architect for the auth module. He is currently on-call and handling INC-076 remediation, creating a review bottleneck. Average review time for Atlas PRs has increased to 6+ days.', mitigations: ['Identify secondary reviewer', 'Pair-program auth extraction to distribute knowledge'] },
      { severity: 'MEDIUM', description: 'Legacy auth service has undocumented behavior in 3 areas (device fingerprinting, concurrent session limits, SAML assertion handling). Reverse-engineering required.', mitigations: ['Schedule 2 discovery spikes in next sprint'] },
      { severity: 'LOW', description: 'New microservices architecture increases operational complexity. SRE team needs upskilling on Kubernetes service mesh.', mitigations: ['SRE training session scheduled for January 8'] },
    ],
    decisions: [
      { date: '2025-07-02', description: 'Decided to use event sourcing (CQRS) over traditional CRUD for the new workflow engine. Rationale: enables complete audit trail for compliance customers. Decision made in RFC-0041 review meeting.' },
      { date: '2025-09-15', description: 'Decided to delay Atlas GA from Q3 2025 to Q1 2026 after auth complexity revealed during design phase. CTO and CPO aligned. Enterprise customers notified.' },
      { date: '2025-11-01', description: 'Decided to extract auth service first (before workflow engine) to unblock Release 3.2 which depends on the new auth subsystem.' },
    ],
    recentActivity: [
      { date: '2025-12-14', description: `PR #847 (fix: auth token refresh race condition) has been open for 6 days awaiting review from ${EMP.StaffEng1}. This is blocking atlas-m2.` },
      { date: '2025-12-10', description: 'Sprint 9 kicked off. 3 Atlas tickets moved to in-progress: HPLT-756, HPLT-812, HPLT-823.' },
      { date: '2025-12-05', description: 'Architecture review completed for auth module extraction. 2 design changes requested: session store must be externalized to Redis, not in-memory.' },
    ],
    tags: ['platform', 'architecture', 'high-priority'],
  },

  // ── SCENARIO: Release 3.2 ──────────────────────────────────────────────────
  {
    id: PROJ.RELEASE_32,
    name: 'Release 3.2',
    slug: 'release-3-2',
    description: `Helios Platform quarterly release, originally scheduled for ${RELEASE_32_SCENARIO.scheduledDate}. Delayed to ${RELEASE_32_SCENARIO.delayedToDate}. ${RELEASE_32_SCENARIO.delayReason} Key new features: (1) Bulk workflow editor — allows editing 50 workflows simultaneously, (2) Advanced retry policies — configurable exponential backoff with dead-letter queues, (3) Native Slack integration — no-code Slack connector with two-way action support, (4) Performance improvements — 40% reduction in p99 latency for the workflow execution API. The release gate requires all P1/P2 bugs resolved and QA regression suite at 100%.`,
    status: STATUS.ACTIVE,
    phase: PHASE.TESTING,
    percentComplete: 78,
    owner: EMP.VPProduct,
    teamLead: EMP.PMRelease,
    team: [EMP.VPProduct, EMP.PMRelease, EMP.StaffEng1, EMP.QALead, EMP.StaffEng2, 'emp-019', 'emp-020', 'emp-021'],
    pmOwner: EMP.PMRelease,
    startDate: '2025-09-15',
    targetDate: RELEASE_32_SCENARIO.delayedToDate,
    originalTargetDate: RELEASE_32_SCENARIO.scheduledDate,
    jiraKey: 'HPLT',
    relatedRepos: [REPO.PLATFORM_API, REPO.AUTH_SERVICE, REPO.FRONTEND],
    milestones: [
      { id: 'r32-m1', name: 'Feature complete', status: 'completed', completedAt: '2025-11-30', description: 'All 3.2 features merged to release branch.' },
      { id: 'r32-m2', name: 'QA regression testing', status: 'in-progress', targetDate: '2025-12-20', description: 'Running full regression suite. 78% complete. 2 critical failures: HPLT-847 (auth timeout), HPLT-892 (data export).' },
      { id: 'r32-m3', name: 'Release gate review', status: 'not-started', targetDate: '2025-12-22', description: 'CTO sign-off required. Requires 0 open P0/P1 tickets.' },
      { id: 'r32-m4', name: 'Production deployment', status: 'not-started', targetDate: RELEASE_32_SCENARIO.delayedToDate, description: 'Blue/green deployment to production. Canary: 5% of enterprise traffic first.' },
    ],
    risks: [
      { severity: 'HIGH', description: RELEASE_32_SCENARIO.delayReason, mitigations: ['PR #847 under priority review', 'HGRD-234 assigned to guard team for immediate fix'] },
      { severity: 'MEDIUM', description: 'QA team is short-staffed (2 engineers on holiday Dec 23-29). Regression coverage for edge cases may be incomplete.', mitigations: ['Engage contractors for additional QA coverage'] },
    ],
    decisions: [
      { date: '2025-12-12', description: RELEASE_32_SCENARIO.decision },
      { date: '2025-12-10', description: 'Decided to keep Slack integration in 3.2 despite auth regression, but gate its enablement flag separately. Customers can request beta access.' },
    ],
    blockingIssues: [JIRA.AUTH_TIMEOUT, JIRA.DATA_EXPORT, JIRA.POLICY_ENGINE],
    blockingPR: 'pr-847',
    tags: ['release', 'high-priority', 'enterprise'],
  },

  // ── Project Apollo ─────────────────────────────────────────────────────────
  {
    id: PROJ.APOLLO,
    name: 'Project Apollo',
    slug: 'apollo',
    description: 'Enterprise tier redesign: new pricing model, dedicated infrastructure, SLA guarantees (99.99% uptime), dedicated CSM, and premium support. Apollo enables Helios to move upmarket to $500K+ ARR deals. Includes new admin console, enhanced RBAC, compliance reporting (SOC2 Type II artifacts), and dedicated tenant isolation in the database tier.',
    status: STATUS.ACTIVE,
    phase: PHASE.DESIGN,
    percentComplete: 28,
    owner: EMP.VPProduct,
    teamLead: 'emp-250',
    team: [EMP.VPProduct, 'emp-250', 'emp-022', 'emp-023', EMP.CISO, 'emp-024'],
    startDate: '2025-10-01',
    targetDate: '2026-06-30',
    jiraKey: 'HPLT',
    milestones: [
      { id: 'apollo-m1', name: 'Enterprise pricing model finalized', status: 'completed', completedAt: '2025-11-15' },
      { id: 'apollo-m2', name: 'Admin console design approved', status: 'in-progress', targetDate: '2025-12-31' },
      { id: 'apollo-m3', name: 'Dedicated infrastructure provisioning', status: 'not-started', targetDate: '2026-02-28' },
      { id: 'apollo-m4', name: 'Beta: 3 enterprise customers', status: 'not-started', targetDate: '2026-04-30' },
      { id: 'apollo-m5', name: 'GA Launch', status: 'not-started', targetDate: '2026-06-30' },
    ],
    risks: [
      { severity: 'MEDIUM', description: 'SOC 2 Type II audit requires 6-month observation period. Needs to start by January 2026 to complete before Apollo GA.' },
      { severity: 'LOW', description: 'Dedicated infrastructure increases COGS per enterprise customer by ~35%. Pricing model must compensate.' },
    ],
    tags: ['enterprise', 'upmarket', 'infrastructure'],
  },

  // ── Project Guardian 2.0 ───────────────────────────────────────────────────
  {
    id: PROJ.GUARDIAN2,
    name: 'Guardian 2.0',
    slug: 'guardian-2',
    description: 'Redesign of Helios Guard (security and access control) with real-time policy evaluation, attribute-based access control (ABAC), and automated compliance reporting. Addresses customer requests for HIPAA and FedRAMP readiness. The policy engine rewrite (HGRD-234) is currently blocking Release 3.2.',
    status: STATUS.ACTIVE,
    phase: PHASE.DEV,
    percentComplete: 55,
    owner: EMP.CISO,
    teamLead: 'emp-210',
    team: [EMP.CISO, 'emp-210', 'emp-211', 'emp-212', 'emp-213', 'emp-214'],
    startDate: '2025-07-01',
    targetDate: '2026-01-31',
    jiraKey: 'HGRD',
    milestones: [
      { id: 'grd2-m1', name: 'ABAC policy model designed', status: 'completed', completedAt: '2025-08-31' },
      { id: 'grd2-m2', name: 'Policy engine rewrite (HGRD-234)', status: 'in-progress', targetDate: '2025-12-20', description: 'Critical regression in policy evaluation for custom roles. This is blocking Release 3.2.' },
      { id: 'grd2-m3', name: 'HIPAA compliance report automation', status: 'not-started', targetDate: '2026-01-15' },
      { id: 'grd2-m4', name: 'GA with compliance reporting', status: 'not-started', targetDate: '2026-01-31' },
    ],
    risks: [
      { severity: 'HIGH', description: 'HGRD-234 (policy engine regression) is blocking Release 3.2. Hot-path fix needed by December 20.' },
      { severity: 'MEDIUM', description: 'FedRAMP Authority to Operate (ATO) process takes 6-18 months. Starting in parallel but depends on external auditors.' },
    ],
    tags: ['security', 'compliance', 'guard'],
  },

  // ── Connect Marketplace ────────────────────────────────────────────────────
  {
    id: PROJ.MARKETPLACE,
    name: 'Connect Marketplace',
    slug: 'marketplace',
    description: 'Public connector marketplace where ISVs and customers can publish and install third-party integrations. Includes certification program, revenue sharing (30% Helios / 70% partner), and automated security scanning of connector code. Current connectors: 47 first-party, 12 partner beta. Target: 200 connectors by end of 2026.',
    status: STATUS.ACTIVE,
    phase: PHASE.RELEASE,
    percentComplete: 88,
    owner: 'emp-154',
    teamLead: 'emp-155',
    team: ['emp-154', 'emp-155', 'emp-156', 'emp-157', 'emp-158'],
    startDate: '2025-03-01',
    targetDate: '2025-12-31',
    jiraKey: 'HCON',
    milestones: [
      { id: 'mkt-m1', name: 'Partner onboarding portal', status: 'completed', completedAt: '2025-09-30' },
      { id: 'mkt-m2', name: 'Certification pipeline automated', status: 'completed', completedAt: '2025-10-31' },
      { id: 'mkt-m3', name: 'Revenue sharing billing', status: 'in-progress', targetDate: '2025-12-20' },
      { id: 'mkt-m4', name: 'Public launch', status: 'not-started', targetDate: '2025-12-31' },
    ],
    risks: [
      { severity: 'LOW', description: 'Revenue sharing billing requires integration with Stripe Connect. Stripe API changes in November may require 1-week rework.' },
    ],
    tags: ['connect', 'marketplace', 'partner'],
  },

  // ── Hermes ─────────────────────────────────────────────────────────────────
  {
    id: PROJ.HERMES,
    name: 'Project Hermes',
    slug: 'hermes',
    description: 'Real-time notification and alerting system for Helios Platform. Supports webhooks, Slack, email, PagerDuty, and OpsGenie. Sub-100ms alert delivery. Replaces the legacy polling-based notification system that cannot scale past 10,000 subscribers. Currently handling 2.1M notifications/day in staging.',
    status: STATUS.ACTIVE,
    phase: PHASE.TESTING,
    percentComplete: 72,
    owner: 'emp-019',
    teamLead: 'emp-020',
    team: ['emp-019', 'emp-020', 'emp-021', 'emp-025'],
    startDate: '2025-08-01',
    targetDate: '2026-01-15',
    jiraKey: 'HPLT',
    milestones: [
      { id: 'hrm-m1', name: 'Core delivery engine', status: 'completed', completedAt: '2025-10-31' },
      { id: 'hrm-m2', name: 'Load testing: 5M notifications/day', status: 'in-progress', targetDate: '2025-12-31' },
      { id: 'hrm-m3', name: 'GA', status: 'not-started', targetDate: '2026-01-15' },
    ],
    risks: [
      { severity: 'MEDIUM', description: 'WebSocket connection limits at 50K concurrent connections in current architecture. Need Redis pub/sub sharding for scale.' },
    ],
    tags: ['platform', 'notifications', 'real-time'],
  },

  // ── Kronos ─────────────────────────────────────────────────────────────────
  {
    id: PROJ.KRONOS,
    name: 'Project Kronos',
    slug: 'kronos',
    description: 'Time-series analytics engine powering the Helios Analytics real-time dashboards. Uses a columnar storage format (Arrow) with vectorized query execution. Achieves 10ms P99 for dashboard queries on 1-year lookback. Replacing the existing PostgreSQL-based analytics backend which cannot handle large customers (Acme Corp reports 45s dashboard loads).',
    status: STATUS.ACTIVE,
    phase: PHASE.DEV,
    percentComplete: 38,
    owner: 'emp-094',
    teamLead: 'emp-095',
    team: ['emp-094', 'emp-095', 'emp-096', 'emp-097', 'emp-098', 'emp-099'],
    startDate: '2025-09-01',
    targetDate: '2026-04-30',
    jiraKey: 'HANA',
    milestones: [
      { id: 'kro-m1', name: 'Storage format design', status: 'completed', completedAt: '2025-10-15' },
      { id: 'kro-m2', name: 'Query planner MVP', status: 'in-progress', targetDate: '2026-01-31' },
      { id: 'kro-m3', name: 'Migration tooling', status: 'not-started', targetDate: '2026-03-31' },
      { id: 'kro-m4', name: 'GA', status: 'not-started', targetDate: '2026-04-30' },
    ],
    risks: [
      { severity: 'HIGH', description: 'Acme Corp is using the old PostgreSQL analytics backend and experiencing 45-second dashboard load times. They have flagged this in their renewal conversation. If Kronos is not in beta by February, there is a high risk of Acme churn at renewal.' },
    ],
    tags: ['analytics', 'performance', 'database'],
  },

  // ── Poseidon ───────────────────────────────────────────────────────────────
  {
    id: PROJ.POSEIDON,
    name: 'Project Poseidon',
    slug: 'poseidon',
    description: 'Database migration from PostgreSQL 13 to PostgreSQL 16 with pgvector extension for AI-powered semantic search. Enables sub-100ms full-text search across customer workflow data. Zero-downtime migration using logical replication. 47 databases, 2.8TB total data.',
    status: STATUS.COMPLETED,
    phase: PHASE.MAINTENANCE,
    percentComplete: 100,
    owner: EMP.DevOpsLead,
    teamLead: EMP.SRE1,
    team: [EMP.DevOpsLead, EMP.SRE1, EMP.SRE2, 'emp-320'],
    startDate: '2025-04-01',
    targetDate: '2025-09-30',
    actualCompletionDate: '2025-09-18',
    jiraKey: 'HPLT',
    milestones: [
      { id: 'pos-m1', name: 'Staging migration', status: 'completed', completedAt: '2025-06-30' },
      { id: 'pos-m2', name: 'Production canary (5 tenants)', status: 'completed', completedAt: '2025-08-15' },
      { id: 'pos-m3', name: 'Production full migration', status: 'completed', completedAt: '2025-09-18' },
    ],
    risks: [],
    tags: ['database', 'infrastructure', 'completed'],
  },

  // ── Titan ──────────────────────────────────────────────────────────────────
  {
    id: PROJ.TITAN,
    name: 'Project Titan',
    slug: 'titan',
    description: 'Enterprise SSO/SAML 2.0 and OpenID Connect implementation. Enables enterprise customers to use their existing identity providers (Okta, Azure AD, Ping Identity) for Helios authentication. 12 enterprise customers are blocked on SSO for their expansion/renewal. Ticket HPLT-815 is the core implementation story.',
    status: STATUS.ACTIVE,
    phase: PHASE.DEV,
    percentComplete: 65,
    owner: EMP.StaffEng2,
    teamLead: 'emp-026',
    team: [EMP.StaffEng2, 'emp-026', 'emp-027'],
    startDate: '2025-10-15',
    targetDate: '2026-01-31',
    jiraKey: 'HPLT',
    relatedJira: [JIRA.SSO_SAML, JIRA.AUTH_TIMEOUT],
    milestones: [
      { id: 'ttn-m1', name: 'SAML SP implementation', status: 'completed', completedAt: '2025-11-30' },
      { id: 'ttn-m2', name: 'OIDC implementation', status: 'in-progress', targetDate: '2025-12-31' },
      { id: 'ttn-m3', name: 'Okta and Azure AD certified', status: 'not-started', targetDate: '2026-01-15' },
      { id: 'ttn-m4', name: 'GA for enterprise customers', status: 'not-started', targetDate: '2026-01-31' },
    ],
    risks: [
      { severity: 'HIGH', description: 'The auth token timeout bug (HPLT-847) affects SAML assertion handling. SSO logins for Acme Corp are intermittently failing due to this regression. Titan and Release 3.2 are interdependent on the auth fix.' },
    ],
    tags: ['security', 'enterprise', 'sso'],
  },

  // ── Ares ───────────────────────────────────────────────────────────────────
  {
    id: PROJ.ARES,
    name: 'Project Ares',
    slug: 'ares',
    description: 'API Gateway v2: replacing Kong with a custom-built gateway in Go. Features: per-tenant rate limiting, request/response transformation, circuit breakers, API versioning, and detailed telemetry. Target: 1ms overhead (vs. 8ms for Kong).',
    status: STATUS.PLANNING,
    phase: PHASE.PLANNING,
    percentComplete: 8,
    owner: EMP.VPEng,
    teamLead: 'emp-028',
    team: [EMP.VPEng, 'emp-028', 'emp-029'],
    startDate: '2026-01-15',
    targetDate: '2026-07-31',
    jiraKey: 'HPLT',
    milestones: [
      { id: 'ares-m1', name: 'RFC review and approval', status: 'in-progress', targetDate: '2026-01-10' },
      { id: 'ares-m2', name: 'MVP in staging', status: 'not-started', targetDate: '2026-03-31' },
      { id: 'ares-m3', name: 'GA', status: 'not-started', targetDate: '2026-07-31' },
    ],
    risks: [
      { severity: 'MEDIUM', description: 'Building a custom API gateway is high-complexity. If core team is pulled onto Release 3.2 stabilization, start date may slip further.' },
    ],
    tags: ['infrastructure', 'performance', 'planning'],
  },
];

// Fill out to ~25 projects with real but less-detailed entries
const FILLER_PROJECTS = [
  { id: 'proj-iris', name: 'Project Iris', slug: 'iris', description: 'AI-powered semantic search across workflow history. Uses pgvector embeddings to answer natural-language queries ("show me all workflows that touched the payments service in October"). Built on Project Poseidon infrastructure.', status: STATUS.PLANNING, phase: PHASE.PLANNING, percentComplete: 5, owner: 'emp-094', jiraKey: 'HANA', startDate: '2026-02-01', targetDate: '2026-08-31' },
  { id: 'proj-prometheus', name: 'Project Prometheus', slug: 'prometheus', description: 'Unified observability platform: OpenTelemetry instrumentation across all services, Grafana dashboards, SLO tracking, and automated anomaly detection. Replaces 6 different monitoring tools currently in use.', status: STATUS.ACTIVE, phase: PHASE.DEV, percentComplete: 60, owner: EMP.DevOpsLead, jiraKey: 'HPLT', startDate: '2025-07-01', targetDate: '2026-01-31' },
  { id: 'proj-hydra', name: 'Project Hydra', slug: 'hydra', description: 'Multi-region active-active deployment: US-West (primary), US-East, EU-West, APAC-Singapore. Enables GDPR data residency, <50ms latency for global customers, and eliminates cross-AZ data transfer costs.', status: STATUS.PLANNING, phase: PHASE.PLANNING, percentComplete: 12, owner: EMP.DevOpsLead, jiraKey: 'HPLT', startDate: '2026-03-01', targetDate: '2026-12-31' },
  { id: 'proj-athena', name: 'Project Athena', slug: 'athena', description: 'Developer documentation platform: interactive API playground, versioned docs, code samples in 8 languages, AI-powered search, and changelog. Replacing static docs site that 73% of API users rate as "difficult to navigate" in NPS surveys.', status: STATUS.ACTIVE, phase: PHASE.RELEASE, percentComplete: 90, owner: 'emp-432', jiraKey: 'HPLT', startDate: '2025-08-01', targetDate: '2025-12-31' },
  { id: 'proj-zeus', name: 'Project Zeus', slug: 'zeus', description: 'Workflow automation engine v3: visual workflow builder with 200+ templates, conditional branching, human-in-the-loop approvals, and time-based triggers. Powers the new enterprise use cases required by Apollo.', status: STATUS.ACTIVE, phase: PHASE.DEV, percentComplete: 48, owner: 'emp-030', jiraKey: 'HPLT', startDate: '2025-09-01', targetDate: '2026-04-30' },
  { id: 'proj-hera', name: 'Project Hera', slug: 'hera', description: 'HR and workforce integration connector: bidirectional sync with Workday, BambooHR, and ADP. Enables automated employee onboarding/offboarding workflows. First connector in the new Connect Marketplace certification process.', status: STATUS.COMPLETED, phase: PHASE.MAINTENANCE, percentComplete: 100, owner: 'emp-154', jiraKey: 'HCON', startDate: '2025-04-01', targetDate: '2025-09-30', actualCompletionDate: '2025-09-22' },
  { id: 'proj-echo', name: 'Project Echo', slug: 'echo', description: 'Customer self-service portal: usage analytics, invoice history, connector marketplace browsing, and support ticket management. Reduces CSM workload by ~4 hours/week per enterprise customer.', status: STATUS.ACTIVE, phase: PHASE.TESTING, percentComplete: 80, owner: EMP.VPSuccess, jiraKey: 'HPLT', startDate: '2025-09-15', targetDate: '2026-01-31' },
  { id: 'proj-nexus', name: 'Project Nexus', slug: 'nexus', description: 'Internal knowledge base and runbook system: searchable, versioned, linked to incidents and Jira tickets. Reduces MTTR by making runbooks discoverable during incidents. Currently piloting with the SRE team.', status: STATUS.ACTIVE, phase: PHASE.DEV, percentComplete: 65, owner: EMP.DevOpsLead, jiraKey: 'HPLT', startDate: '2025-10-01', targetDate: '2026-02-28' },
  { id: 'proj-phoenix', name: 'Project Phoenix', slug: 'phoenix', description: 'Disaster recovery upgrade: RTO from 4 hours to 15 minutes, RPO from 1 hour to 5 minutes. Automated failover, cross-region backup replication, and quarterly DR drills. Critical for Apollo enterprise SLAs.', status: STATUS.ACTIVE, phase: PHASE.TESTING, percentComplete: 70, owner: EMP.SRE1, jiraKey: 'HPLT', startDate: '2025-08-01', targetDate: '2025-12-31' },
  { id: 'proj-orion', name: 'Project Orion', slug: 'orion', description: 'Mobile companion app (iOS/Android) for Helios Platform: workflow approval notifications, status dashboards, and quick-action approvals. Targeted at CxO users who need mobile access. React Native codebase.', status: STATUS.PLANNING, phase: PHASE.PLANNING, percentComplete: 10, owner: EMP.VPProduct, jiraKey: 'HPLT', startDate: '2026-01-15', targetDate: '2026-09-30' },
  { id: 'proj-lyra', name: 'Project Lyra', slug: 'lyra', description: 'Reporting engine v2: scheduled reports, custom report builder with 60+ metrics, PDF/Excel export, and white-labeling for enterprise customers. Replaces the current static report system that cannot handle the 3.2 bulk analytics features.', status: STATUS.ACTIVE, phase: PHASE.DEV, percentComplete: 52, owner: 'emp-100', jiraKey: 'HANA', startDate: '2025-10-01', targetDate: '2026-03-31' },
  { id: 'proj-vega', name: 'Project Vega', slug: 'vega', description: 'Developer experience initiative: local development environment (Helios Dev), hot-reload for connectors, improved error messages, TypeScript SDK, and OpenAPI spec generator. Target: reduce onboarding time from 3 weeks to 3 days.', status: STATUS.ACTIVE, phase: PHASE.DEV, percentComplete: 40, owner: 'emp-031', jiraKey: 'HCON', startDate: '2025-11-01', targetDate: '2026-04-30' },
  { id: 'proj-chimera', name: 'Project Chimera', slug: 'chimera', description: 'Legacy migration toolkit: automated migration from Zapier, n8n, and Make to Helios Platform. Used by sales team during POC conversions. 14 customers have successfully migrated using Chimera in beta.', status: STATUS.COMPLETED, phase: PHASE.MAINTENANCE, percentComplete: 100, owner: 'emp-154', jiraKey: 'HCON', startDate: '2025-01-01', targetDate: '2025-06-30', actualCompletionDate: '2025-06-28' },
  { id: 'proj-helios-x', name: 'Helios X', slug: 'helios-x', description: 'Next-generation platform vision (3-year roadmap): AI-native workflow engine, self-healing infrastructure, natural-language workflow authoring, and edge compute. Exploratory phase only. Not staffed yet.', status: STATUS.PLANNING, phase: PHASE.PLANNING, percentComplete: 2, owner: EMP.CEO, jiraKey: 'HPLT', startDate: '2026-07-01', targetDate: '2028-12-31' },
  { id: 'proj-security-h2', name: 'Security H2 2025', slug: 'security-h2-2025', description: 'Security improvements: SOC 2 Type II recertification, penetration testing, dependency vulnerability remediation (47 high/critical CVEs outstanding from Dependabot), and secrets rotation automation.', status: STATUS.ACTIVE, phase: PHASE.DEV, percentComplete: 65, owner: EMP.CISO, jiraKey: 'HGRD', startDate: '2025-07-01', targetDate: '2025-12-31' },
];

export function generateProjects() {
  // Return named projects + filler projects, each with consistent shape
  const normalize = (p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: p.status,
    phase: p.phase,
    percentComplete: p.percentComplete ?? 0,
    owner: p.owner || 'emp-009',
    teamLead: p.teamLead || p.owner || 'emp-009',
    team: p.team || [p.owner].filter(Boolean),
    pmOwner: p.pmOwner || null,
    startDate: p.startDate,
    targetDate: p.targetDate,
    originalTargetDate: p.originalTargetDate || null,
    actualCompletionDate: p.actualCompletionDate || null,
    jiraKey: p.jiraKey || 'HPLT',
    relatedRepos: p.relatedRepos || [],
    relatedJira: p.relatedJira || [],
    milestones: p.milestones || [],
    risks: p.risks || [],
    decisions: p.decisions || [],
    blockingIssues: p.blockingIssues || [],
    blockingPR: p.blockingPR || null,
    recentActivity: p.recentActivity || [],
    tags: p.tags || [],
  });

  return [...NAMED_PROJECTS, ...FILLER_PROJECTS].map(normalize);
}
