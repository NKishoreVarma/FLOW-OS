/**
 * Jira issues generator — real descriptions, scenario tickets at fixed IDs.
 * No lorem ipsum. All ticket descriptions are standalone English text.
 */
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';
import { EMP, CUST, INC, JIRA, PROJ } from '../scenarios.js';

const SPRINTS = Array.from({length:12},(_,i)=>`Sprint ${i+1} — 2025`);
const TYPES = [{weight:0.4,value:'story'},{weight:0.35,value:'bug'},{weight:0.15,value:'task'},{weight:0.1,value:'epic'}];
const STATUSES = [{weight:0.45,value:'done'},{weight:0.25,value:'in-progress'},{weight:0.2,value:'todo'},{weight:0.1,value:'backlog'}];
const PRIORITIES = [{weight:0.05,value:'critical'},{weight:0.25,value:'high'},{weight:0.45,value:'medium'},{weight:0.25,value:'low'}];

// ── Real story titles by product ──────────────────────────────────────────────
const STORY_TITLES = {
  HPLT: [
    'Implement bulk workflow editor for enterprise accounts',
    'Add advanced retry policies with exponential backoff',
    'Build native Slack connector (no-code setup)',
    'Reduce workflow execution API p99 latency by 40%',
    'Add per-tenant rate limiting to workflow trigger endpoint',
    'Implement workflow versioning and rollback',
    'Add real-time workflow execution status via WebSocket',
    'Build audit log viewer with advanced filtering',
    'Implement custom webhook payload transformation',
    'Add conditional branching to workflow builder',
    'Build time-based workflow triggers (cron, delay)',
    'Implement workflow templates library (50 pre-built)',
    'Add human-in-the-loop approval step type',
    'Build workflow dependency graph visualization',
    'Implement multi-step rollback for workflow failures',
  ],
  HANA: [
    'Build Kronos columnar storage layer with Apache Arrow',
    'Implement vectorized query execution for time-series',
    'Add real-time dashboard with <100ms refresh',
    'Build custom metrics builder (60+ metric types)',
    'Implement anomaly detection for key business metrics',
    'Add export to CSV, Excel, and PDF with scheduled delivery',
    'Build correlation analysis across workflow and business metrics',
    'Implement data freshness indicators on all dashboard tiles',
    'Add drill-down from summary metrics to raw event data',
    'Build segment comparison view for A/B analysis',
  ],
  HCON: [
    'Build Connect Marketplace partner onboarding portal',
    'Implement connector certification pipeline (automated security scan)',
    'Add revenue sharing billing via Stripe Connect',
    'Build self-service connector publishing workflow',
    'Implement connector version management and deprecation',
    'Add webhook event inspector for debugging',
    'Build OAuth2 consent flow UI for third-party connectors',
    'Implement connector usage analytics for partner dashboard',
    'Add rate limit configuration per connector per tenant',
    'Build connector health monitoring with auto-disable on errors',
  ],
  HGRD: [
    'Implement attribute-based access control (ABAC) policy model',
    'Rewrite policy engine for sub-10ms evaluation (Guardian 2.0)',
    'Build HIPAA compliance report automation',
    'Implement SOC 2 Type II control evidence collection',
    'Add FedRAMP control mapping to existing compliance framework',
    'Build real-time access audit log with SIEM integration',
    'Implement secrets management with Vault integration',
    'Add automated vulnerability scanning to CI pipeline',
    'Build privileged access management (PAM) for production systems',
    'Implement data classification and automatic tagging',
  ],
};

// ── Real bug titles by product ────────────────────────────────────────────────
const BUG_TITLES = {
  HPLT: [
    'Auth token not refreshing for high-concurrency sessions (>3 concurrent requests)',
    'Data export failing for datasets with >10,000 rows (pagination cursor off-by-one)',
    'Memory leak in workflow execution engine (WorkflowCache no eviction)',
    'Dashboard load time 45s for accounts with >10,000 workflow templates',
    'Workflow trigger rate limiter incorrectly blocking burst-then-idle traffic patterns',
    'PDF report export truncating columns for reports with >15 columns',
    'Date formatting incorrect for EU locale users (MM/DD vs DD.MM)',
    'Webhook delivery retry not triggering for 429 (rate limited) responses',
    'Search not returning results for queries containing special characters',
    'Background job scheduler firing duplicate jobs when worker clock skew >500ms',
    'Onboarding wizard state cleared when user navigates back with browser button',
    'Connector OAuth token silently expired without triggering re-auth prompt',
    'Audit log missing 2-hour window due to Prometheus OOM during log export',
  ],
  HANA: [
    'Analytics pipeline stalled — Elasticsearch refresh interval set to -1',
    'Aggregation API starvation when single tenant runs >2000 concurrent aggregations',
    'Scheduled report not delivering for customers in non-UTC timezones',
    'Metric cardinality explosion from high-cardinality user_id Prometheus label',
    'Custom metric formula returning NaN for division when denominator is zero',
    'Dashboard tile not auto-refreshing when browser tab is in background',
    'CSV export not including timezone in timestamp columns (EU compliance)',
    'Search ranking degraded for customers with >1,000 saved searches',
  ],
  HCON: [
    'Marketplace connector installation failing for connector names with spaces',
    'Webhook event inspector not decoding base64-encoded payloads',
    'OAuth2 consent flow CSRF token not validating after browser back navigation',
    'Connector health check false-positives during rolling deployments',
    'Rate limit state not resetting at midnight for per-day limits',
    'Connector SDK TypeScript types missing for new webhook event types',
  ],
  HGRD: [
    'Policy engine returning incorrect allow decisions for custom role permissions (missing AND clause)',
    'Audit log export not including timezone in timestamps (compliance issue for Nexigen Pharma)',
    'SAML assertion attribute mapping not handling multi-value attributes',
    'Guard policy cache not invalidating when workspace-level policy changes',
    'Privileged access review reports showing incorrect last-access timestamps (timezone offset bug)',
  ],
};

// ── Scenario tickets (fixed IDs, real content) ────────────────────────────────
function buildScenarioTickets(engineers, customers) {
  const davidPark = engineers.find(e => e.id === EMP.StaffEng1) || engineers[0];
  const priyaNair  = engineers.find(e => e.id === EMP.StaffEng2) || engineers[1];
  const qalead     = engineers.find(e => e.id === EMP.QALead)    || engineers[2];

  return [
    // HPLT-847: Auth timeout — blocking Release 3.2 + Acme Corp
    {
      id: JIRA.AUTH_TIMEOUT,
      projectKey: 'HPLT',
      title: 'Auth service: token refresh race condition causing intermittent 401 errors for enterprise SSO users',
      description: `**Summary**: Auth token refresh has a race condition when >3 concurrent refresh requests arrive for the same session within 50ms. The mutex release is placed inside an error handler that is never called under normal operation, so the mutex is never released, causing subsequent refresh requests to deadlock until 30-second timeout. Affects enterprise accounts with 500+ concurrent users during peak hours (9-10 AM shift start).

**Steps to reproduce**:
1. Set up an account with 500+ concurrent sessions
2. Simulate concurrent refresh requests (artillery script in /test/load/auth-refresh.yml)
3. Observe 401 errors starting on the 4th concurrent request

**Root cause**: PR #836 (optimize token caching layer) introduced the bug. Mutex release moved inside an error handler but token_store.Get() doesn't return errors under normal operation.

**Impact**: Acme Corp (1,200 users, P1 complaint from CTO Marcus Webb), Meridian Health, TechVision Inc, 3 other enterprise accounts with SSO enabled. Intermittent auth failures during peak load.

**Mitigation applied**: Feature flag disabled token caching for enterprise accounts. Affected customers' login success rate restored to 99.8%.

**Fix**: PR #847 resolves the race condition by using defer for mutex release. Needs second approver (auth service requires 2 reviews). Currently blocked waiting for reviewer.

**Release gate**: This ticket must be closed before Release 3.2 can ship.`,
      type: 'bug',
      status: 'in-progress',
      priority: 'critical',
      assignee: davidPark.id,
      reporter: qalead?.id || engineers[2].id,
      sprint: 'Sprint 9 — 2025',
      storyPoints: 5,
      labels: ['auth', 'security', 'release-3.2-gate', 'p1-customer'],
      customerId: CUST.ACME,
      epicId: null,
      relatedPR: 'pr-847',
      relatedIncidentId: INC.P1_AUTH_REGR,
      relatedProject: PROJ.RELEASE_32,
      daysOpen: 6,
      createdAt: '2025-12-10T09:30:00Z',
      resolvedAt: null,
    },

    // HPLT-892: Data export failing — blocking Acme Corp renewal
    {
      id: JIRA.DATA_EXPORT,
      projectKey: 'HPLT',
      title: 'Data export fails for datasets with >10,000 rows (pagination cursor off-by-one error)',
      description: `**Summary**: The streaming export feature (introduced in v3.1.7) has an off-by-one error in the pagination cursor. When the total row count is exactly divisible by the page size (default 1,000), the cursor loops forever on the last page, causing the export to hang until the 5-minute timeout kills the job. The export fails silently — the customer sees a success notification but the downloaded file is 0 bytes.

**Affected**: Any export with row count ≥ 10,000. Most severely affects customers running large nightly exports:
- Acme Corp: 50,000-row nightly export (failing for 8 days — P1 complaint)
- GlobalTech Solutions: 25,000-row weekly report
- 3 other enterprise customers with similar batch export use cases

**Steps to reproduce**:
1. Create a workflow dataset with exactly 10,000 records (or any multiple of 1,000)
2. Trigger export via API: POST /api/v3/exports (format: csv)
3. After 5 minutes, download the export
4. Result: 0-byte file

**Root cause**: In streaming_exporter.go line 247, the condition for "last page reached" is \`cursor.Offset + cursor.Limit < cursor.Total\` instead of \`cursor.Offset + cursor.Limit <= cursor.Total\`. This causes the final page (where offset + limit = total) to be fetched again in an infinite loop.

**Workaround**: Customers can export in chunks of 9,999 rows. Acme Corp has been using this manually.

**Fix**: PR in progress. Off-by-one corrected to \`<=\`. Adding test cases for all boundary values (9,999, 10,000, 10,001, and 20,000 rows).

**ETA**: Fix deployed to production by December 15-16.

**Release gate**: This ticket is a release gate blocker for 3.2.`,
      type: 'bug',
      status: 'in-progress',
      priority: 'critical',
      assignee: 'emp-030',
      reporter: EMP.CSM1,
      sprint: 'Sprint 9 — 2025',
      storyPoints: 3,
      labels: ['export', 'data', 'release-3.2-gate', 'p1-customer', 'acme-corp'],
      customerId: CUST.ACME,
      epicId: null,
      relatedProject: PROJ.RELEASE_32,
      daysOpen: 8,
      createdAt: '2025-12-06T14:00:00Z',
      resolvedAt: null,
    },

    // HGRD-234: Policy engine — blocking Release 3.2 + Meridian Health
    {
      id: JIRA.POLICY_ENGINE,
      projectKey: 'HGRD',
      title: 'Guard policy engine returns incorrect allow decisions for users with custom role permissions',
      description: `**Summary**: The Guard policy engine evaluator is returning incorrect ALLOW decisions for users with custom roles that should have read-only access. A SQL query in the permission_evaluator.go is missing an AND clause after a refactor, causing it to return all permissions for a user regardless of their assigned role.

**Security impact**: Read-only users can perform write operations (create, update, delete workflows; modify connectors; edit settings). This is a potential data integrity and unauthorized access issue.

**Discovery**: Meridian Health (healthcare customer) noticed unexpected workflow modifications in their audit log on December 9. Their IT Director Amit Patel flagged it to our security team. This was reported to us, not auto-detected.

**Root cause**: Permission evaluator SQL query (permission_store.go line 342):
\`\`\`sql
-- BEFORE (broken — missing role filter):
SELECT permission_id FROM role_permissions
WHERE workspace_id = $1 AND user_id = $2

-- AFTER (correct):
SELECT permission_id FROM role_permissions
WHERE workspace_id = $1 AND user_id = $2 AND role_id = $3
\`\`\`
The role_id parameter was removed during a performance refactor that accidentally changed the query semantics.

**Affected**: All workspaces using custom roles (non-default Admin/Member roles). Estimated 23% of enterprise accounts.

**Mitigation**: Hotfix deployed December 10 for Meridian Health. Policy cache invalidated. Full fix being tested.

**Customer disclosure**: Meridian Health notified December 10. Other affected customers to be notified per security disclosure policy.

**Release gate**: This ticket must be closed before Release 3.2 ships.`,
      type: 'bug',
      status: 'in-progress',
      priority: 'critical',
      assignee: EMP.CISO,
      reporter: EMP.QALead,
      sprint: 'Sprint 9 — 2025',
      storyPoints: 5,
      labels: ['security', 'guard', 'release-3.2-gate', 'disclosure-required'],
      customerId: CUST.MERIDIAN,
      epicId: null,
      relatedProject: PROJ.RELEASE_32,
      daysOpen: 5,
      createdAt: '2025-12-09T17:00:00Z',
      resolvedAt: null,
    },

    // HPLT-899: Memory leak hotfix — INC-076 follow-up
    {
      id: JIRA.MEMORY_HOTFIX,
      projectKey: 'HPLT',
      title: 'Platform API: add LRU eviction policy to WorkflowCache to prevent memory pool exhaustion',
      description: `**Context**: INC-076 (December 14, 2:47 AM) was caused by WorkflowCache.populate() having no eviction policy. For high-template-count customers (Acme Corp has 12,400 workflow templates), the cache grows to fill the entire heap within 8-12 hours of a pod restart.

**Fix (PR #894)**: Implement LRU eviction with:
- Max entries: 5,000 (configurable via WORKFLOW_CACHE_MAX_ENTRIES env var)
- TTL: 15 minutes (configurable via WORKFLOW_CACHE_TTL_SECONDS)
- Eviction policy: Least Recently Used
- Cache hit/miss metrics added to Prometheus

**Testing**:
- Unit tests: LRU eviction behavior at boundary conditions
- Load test: 10-hour soak test with Acme-scale template count (12,400 templates)
- Memory usage should plateau at ~380MB (vs. growing unbounded before)

**Status**: Merged as part of INC-076 emergency response (PR #894). v3.1.9-p1 deployed December 14 3:31 AM.

**Follow-up needed**: (1) Add memory usage alerting at 70% threshold, (2) Document WorkflowCache behavior in runbook, (3) Consider cache warming strategy to reduce cold-start latency.`,
      type: 'bug',
      status: 'done',
      priority: 'critical',
      assignee: davidPark.id,
      reporter: priyaNair.id,
      sprint: 'Sprint 9 — 2025',
      storyPoints: 2,
      labels: ['performance', 'memory', 'incident-followup', 'sre'],
      customerId: CUST.ACME,
      epicId: null,
      relatedIncidentId: INC.P1_MEMORY_LEAK,
      relatedPR: 'pr-894',
      createdAt: '2025-12-14T03:20:00Z',
      resolvedAt: '2025-12-14T03:45:00Z',
    },

    // HPLT-815: SSO/SAML — Project Titan
    {
      id: JIRA.SSO_SAML,
      projectKey: 'HPLT',
      title: 'Implement SAML 2.0 SP and OIDC identity provider integration (Project Titan)',
      description: `**Summary**: Implement enterprise SSO support via SAML 2.0 Service Provider (SP) and OpenID Connect (OIDC) consumer. This is the core ticket for Project Titan.

**Supported identity providers (GA scope)**: Okta, Azure AD, Google Workspace, Ping Identity, OneLogin.

**Feature scope**:
1. SAML 2.0 SP metadata endpoint
2. ACS (Assertion Consumer Service) endpoint with signature validation
3. OIDC authorization code flow with PKCE
4. Attribute mapping configuration UI (map IdP attributes to Helios user fields)
5. Just-in-time provisioning (create Helios account on first SSO login)
6. SCIM 2.0 user provisioning (sync users from IdP)
7. SSO bypass for emergency admin access
8. Multi-tenant SSO (each workspace has its own IdP configuration)

**Dependencies**: Requires auth service to support external identity assertions (related to PR #847 auth fix and Project Atlas auth module).

**Note**: HPLT-847 (auth token timeout) affects SAML assertion handling. This ticket is partially blocked until HPLT-847 is resolved.

**Customers waiting**: TechVision Inc, QuantumLeap AI, Nexigen Pharma, FinEdge Capital, 8 additional enterprise prospects.`,
      type: 'story',
      status: 'in-progress',
      priority: 'high',
      assignee: EMP.StaffEng2,
      reporter: EMP.PMAtlas,
      sprint: 'Sprint 9 — 2025',
      storyPoints: 13,
      labels: ['auth', 'sso', 'saml', 'enterprise', 'titan'],
      customerId: null,
      epicId: null,
      relatedProject: PROJ.TITAN,
      createdAt: '2025-10-20T09:00:00Z',
      resolvedAt: null,
    },

    // HPLT-756: Atlas auth refactor
    {
      id: JIRA.ATLAS_REFACTOR,
      projectKey: 'HPLT',
      title: 'Project Atlas: Extract auth service from monolith — Phase 1 (session management)',
      description: `**Summary**: Extract session management from the Platform API monolith into a standalone auth service as part of Project Atlas phase 1. This is the first step in the microservices migration.

**Scope**:
1. Define the auth service API contract (gRPC + REST)
2. Create new auth-service repository
3. Implement session store backed by Redis (current: in-process memory)
4. Implement token issuance and validation
5. Implement refresh token rotation with secure storage
6. Wire platform-api to call auth-service for all auth operations (via gRPC)
7. Implement graceful degradation (circuit breaker pattern) if auth-service is unavailable
8. Blue/green deployment with feature flag for gradual rollout

**Rationale**: The current auth implementation in the platform-api monolith cannot be tested independently, scales poorly (in-process session state), and blocks the new SSO features (Project Titan). Extracting it as a service enables Project Atlas to proceed.

**Known undocumented behaviors to preserve**:
- Device fingerprinting (cookie: hls_device_fp — used by iOS app, undocumented)
- Concurrent session limit: 5 per account (hardcoded, no admin configuration)
- SAML assertion custom attribute mapping (legacy 2021 code)

**PRs**: PR #756 (initial service skeleton — merged), PR #847 (token refresh fix — pending review, 6 days open)

**Status**: Blocked on PR #847 review. David Park assigned as primary reviewer for this ticket and author of PR #847.`,
      type: 'story',
      status: 'in-progress',
      priority: 'high',
      assignee: davidPark.id,
      reporter: EMP.PMAtlas,
      sprint: 'Sprint 9 — 2025',
      storyPoints: 8,
      labels: ['atlas', 'auth', 'microservices', 'architecture'],
      customerId: null,
      epicId: null,
      relatedProject: PROJ.ATLAS,
      createdAt: '2025-11-10T09:00:00Z',
      resolvedAt: null,
    },
  ];
}

export function generateJiraIssues(engineers, customers) {
  const issues = [];

  // Add scenario tickets first
  const scenarioTickets = buildScenarioTickets(engineers, customers);
  issues.push(...scenarioTickets);

  // Set of scenario IDs to avoid duplicating
  const scenarioIds = new Set(scenarioTickets.map(t => t.id));

  // Generate remaining issues per product
  for (const product of PRODUCTS) {
    const bugTitles   = BUG_TITLES[product.jiraKey]   || BUG_TITLES.HPLT;
    const storyTitles = STORY_TITLES[product.jiraKey] || STORY_TITLES.HPLT;

    for (let i = 1; i <= 300; i++) {
      const id = `${product.jiraKey}-${i}`;
      if (scenarioIds.has(id)) continue; // Skip if scenario ticket occupies this ID

      const type   = faker.helpers.weightedArrayElement(TYPES);
      const status = faker.helpers.weightedArrayElement(STATUSES);
      const priority = faker.helpers.weightedArrayElement(PRIORITIES);
      const createdAt = faker.date.between({from:'2025-01-01',to:'2025-12-01'}).toISOString();

      // Real title (no lorem ipsum)
      const titlePool = type === 'bug' ? bugTitles : storyTitles;
      const title = faker.helpers.arrayElement(titlePool);

      // Real description (no lorem ipsum) — derived from title
      const description = generateDescription(title, type, priority, product);

      issues.push({
        id,
        projectKey: product.jiraKey,
        title,
        description,
        type, status, priority,
        assignee: faker.helpers.arrayElement(engineers).id,
        reporter: faker.helpers.arrayElement(engineers).id,
        sprint: faker.helpers.arrayElement(SPRINTS),
        storyPoints: faker.helpers.arrayElement([1,2,3,5,8,13]),
        labels: faker.helpers.arrayElements(['backend','frontend','performance','security','ux','api','infra'], faker.number.int({min:0,max:3})),
        customerId: faker.datatype.boolean(0.2) && customers.length ? faker.helpers.arrayElement(customers).id : null,
        epicId: type !== 'epic' && i > 10 && faker.datatype.boolean(0.3) ? `${product.jiraKey}-${faker.number.int({min:1,max:10})}` : null,
        createdAt,
        resolvedAt: status === 'done' ? faker.date.between({from:createdAt,to:'2025-12-31'}).toISOString() : null,
      });
    }
  }

  return issues;
}

function generateDescription(title, type, priority, product) {
  const urgency = priority === 'critical' ? 'CRITICAL: ' : priority === 'high' ? 'HIGH PRIORITY: ' : '';
  if (type === 'bug') {
    return `${urgency}${title}. Identified during QA testing / customer report. Steps to reproduce available in the comments. Priority assigned based on customer impact (${priority}) and product area (${product.name}). Fix tracked in associated PR. See linked Jira comments for investigation details and resolution status.`;
  }
  if (type === 'story') {
    return `${urgency}${title}. Acceptance criteria: (1) Feature works end-to-end in staging, (2) Unit tests cover happy path and edge cases, (3) API documentation updated, (4) Design review approved for any UI changes. Technical approach to be discussed in sprint planning. Dependencies listed in ticket comments.`;
  }
  if (type === 'epic') {
    return `Epic: ${title}. This epic covers the full implementation of the feature area for ${product.name}. Individual stories will be broken out during sprint planning. Success metric: customer adoption and NPS improvement in the ${product.name} segment. Timeline tracked in the project roadmap.`;
  }
  return `Task: ${title}. Part of ongoing operational work for ${product.name}. Details and completion criteria in ticket comments.`;
}
