/**
 * Pull request generator — real PR bodies with scenario anchors.
 * No lorem ipsum. Scenario PRs have full descriptions with root cause + testing steps.
 */
import faker from '../faker.js';
import { EMP, JIRA, REPO, INC } from '../scenarios.js';

const STATUSES = [{weight:0.7,value:'merged'},{weight:0.2,value:'open'},{weight:0.1,value:'closed'}];

// ── Scenario PRs ──────────────────────────────────────────────────────────────
const SCENARIO_PRS = [
  {
    id: 'pr-847',
    repoId: REPO.AUTH_SERVICE,
    title: 'fix: resolve token refresh race condition causing concurrent session timeouts',
    body: `## Summary

Fixes a mutex race condition in \`AuthTokenManager.refreshToken()\` that causes authentication failures during concurrent token refresh requests. This is the root cause of HPLT-847.

**Root Cause:** The \`tokenMutex\` was locked in \`refreshToken()\` but the unlock call was inside the success path only. If a network error occurred mid-refresh, the mutex was never released. Under normal load this was masked — the next refresh attempt would timeout waiting for the lock and trigger a retry. Under high concurrency (e.g., Acme Corp's 1,200-user 9 AM login spike), many goroutines would pile up waiting on the stuck mutex, exhausting the connection pool.

**Fix:** Replaced manual lock/unlock with a \`defer mu.Unlock()\` immediately after \`mu.Lock()\`. This guarantees the mutex is released regardless of the execution path (success, error, panic).

\`\`\`go
// Before (buggy):
mu.Lock()
token, err := doRefresh(ctx, refreshToken)
if err != nil {
    return nil, err  // mutex leaked here
}
mu.Unlock()

// After (fixed):
mu.Lock()
defer mu.Unlock()
token, err := doRefresh(ctx, refreshToken)
if err != nil {
    return nil, err  // mutex released by defer
}
\`\`\`

## Testing

- [x] Unit tests: \`TestAuthTokenManager_ConcurrentRefresh\` — 100 goroutines refreshing simultaneously, zero deadlocks across 1,000 iterations
- [x] Load test: 1,200 concurrent refresh requests (Acme Corp realistic load) — all succeed, no timeouts
- [x] QA regression suite: auth module passing (was 3 failures, now 0)
- [x] Tested in staging environment with production-like token volumes

## Related

- Fixes: HPLT-847
- Blocks: Release 3.2 gate (this PR must merge before 3.2 ships)
- PR open: December 8, 2025 — needs second reviewer (currently has 1 approval)

## Reviewers Needed

This is a critical security-adjacent fix in the auth service. Per our code review standards, auth service changes require 2 approvals. @david-park has approved. Need 1 more senior review from the auth or platform team.`,
    author: EMP.StaffEng1,
    reviewers: [EMP.CTO],
    status: 'open',
    baseBranch: 'main',
    headBranch: 'fix/hplt-847-token-refresh-mutex',
    createdAt: '2025-12-08T16:14:22Z',
    mergedAt: null,
    jiraIssueId: JIRA.AUTH_TIMEOUT,
    labels: ['bug', 'release-gate', 'auth'],
    reviewCount: 1,
    approvalCount: 1,
    isReleaseGate: true,
  },
  {
    id: 'pr-894',
    repoId: REPO.PLATFORM_API,
    title: 'fix: add LRU eviction policy to WorkflowCache to prevent memory exhaustion',
    body: `## Summary

Emergency fix for INC-076: WorkflowCache had no eviction policy, causing memory exhaustion for accounts with large workflow template libraries (Acme Corp: 12,400 templates).

**Root Cause:** \`WorkflowCache.populate()\` loaded all workflow templates for an account into an unbounded in-memory map at pod startup. For accounts with large template libraries, this map grew to fill the entire heap within 8 hours of a pod restart. When all pods were restarted simultaneously during the Dec 13 6:30 PM deployment, they all hit OOM at the same time (~8 hours later = 2:47 AM Dec 14).

**Fix:** Replaced the unbounded \`map[string]*WorkflowTemplate\` with an LRU cache (github.com/hashicorp/golang-lru/v2).

Configuration (via environment variables, with sensible defaults):
- \`WORKFLOW_CACHE_MAX_ENTRIES\`: max templates cached per pod (default: 5,000)
- \`WORKFLOW_CACHE_TTL_MINUTES\`: TTL per entry (default: 15 minutes)

For accounts with > 5,000 templates, less-frequently-used templates are evicted. Cache miss = database lookup (adds ~2ms latency vs 0ms cache hit). This is acceptable — the previous behavior was an OOM crash.

\`\`\`go
// Before (unbounded, dangerous):
cache := make(map[string]*WorkflowTemplate)

// After (LRU, bounded):
maxEntries := getEnvInt("WORKFLOW_CACHE_MAX_ENTRIES", 5000)
ttl := time.Duration(getEnvInt("WORKFLOW_CACHE_TTL_MINUTES", 15)) * time.Minute
cache, _ := lru.NewWithExpire[string, *WorkflowTemplate](maxEntries, ttl)
\`\`\`

## Testing

- [x] Unit tests: \`TestWorkflowCache_Eviction\` — verified LRU eviction fires correctly at max capacity
- [x] Load test: 15,000-template dataset (1.2x Acme Corp volume) — memory stable at < 60% heap for 24 hours
- [x] Regression test: cache hit/miss metrics show correct behavior
- [x] Deployed as v3.1.9-p1 to production at 3:31 AM Dec 14, 2025 (EMERGENCY deployment during incident)

## Deployment Notes

This was an emergency deployment during INC-076 (deployed 3:31 AM Dec 14 while incident was active). Normal deployment process was bypassed with CTO approval. This PR is the post-incident cleanup to document the change and get it formally reviewed/merged.

Service restored at 3:34 AM. MTTR: 47 minutes.

## Related

- Fixes: INC-076 (memory exhaustion incident December 14, 2025)
- Created: HPLT-899 (add load testing with 15,000-template dataset — assigned to Kenji Watanabe)`,
    author: EMP.StaffEng1,
    reviewers: [EMP.DevOpsLead, EMP.CTO],
    status: 'merged',
    baseBranch: 'main',
    headBranch: 'fix/inc-076-workflow-cache-lru',
    createdAt: '2025-12-14T03:14:00Z',
    mergedAt: '2025-12-14T03:28:00Z',
    jiraIssueId: 'HPLT-899',
    labels: ['bug', 'incident-fix', 'emergency', 'performance'],
    reviewCount: 2,
    approvalCount: 2,
    isReleaseGate: false,
  },
];

// ── Real PR title templates ────────────────────────────────────────────────────
const TITLES_BY_AREA = {
  auth: [
    'feat: add OAuth2 PKCE flow for public clients',
    'fix: handle expired refresh tokens gracefully at session boundary',
    'refactor: extract token validation into dedicated TokenValidator service',
    'feat: add MFA enrollment flow for TOTP and SMS',
    'fix: session cookie SameSite attribute missing in cross-origin contexts',
  ],
  api: [
    'feat: add cursor-based pagination to /api/v3/workflows',
    'fix: rate limiter not applying per-user limits correctly',
    'feat: add bulk operations endpoint for workflow templates',
    'perf: add Redis caching for frequently-accessed organization settings',
    'fix: 500 errors when request body exceeds 10MB limit — return 413 instead',
  ],
  infra: [
    'feat: add Prometheus metrics for workflow execution latency percentiles',
    'fix: Kubernetes liveness probe timing out during high GC pressure',
    'chore: upgrade Go 1.21 → 1.22, update all dependencies',
    'feat: add structured logging with correlation IDs to all services',
    'fix: database connection pool exhaustion under high concurrency',
  ],
  analytics: [
    'feat: add time-series aggregation for dashboard query performance',
    'fix: incorrect null handling in aggregation pipeline causing wrong totals',
    'perf: optimize slow query for 90-day lookback from 8s → 120ms with materialized view',
    'feat: add data export API supporting CSV and Parquet formats',
    'refactor: extract query builder into composable filter chain',
  ],
  security: [
    'fix: add Content-Security-Policy header to all API responses',
    'feat: implement field-level encryption for PII in audit logs',
    'fix: permission check missing for cross-organization resource access',
    'feat: add SAML 2.0 SSO support for enterprise accounts',
    'chore: rotate secrets and update vault path references',
  ],
  general: [
    'feat: add webhook delivery retry with exponential backoff',
    'fix: resolve race condition in distributed lock acquisition',
    'test: add integration tests for multi-tenant data isolation',
    'docs: add OpenAPI spec for v3 API (replaces outdated v2 spec)',
    'chore: remove deprecated v1 API endpoints (sunset December 2024)',
    'feat: add feature flag system using LaunchDarkly SDK',
    'perf: reduce P99 latency for /api/v3/executions from 450ms to 95ms',
    'fix: memory leak in event listener not removed on component unmount',
    'feat: add graceful shutdown with in-flight request draining',
    'refactor: split monolithic UserService into auth/profile/permissions modules',
  ],
};

// ── Real PR bodies ─────────────────────────────────────────────────────────────
const BODY_TEMPLATES = [
  (title) => `## Summary

${title}. This change addresses a long-standing issue that was affecting production reliability.

**What changed:** Updated the core logic in the affected service to handle edge cases that were previously uncovered by our test suite. Added proper error handling and logging.

**Why now:** This was identified as part of our Q4 reliability initiative and has been prioritized based on customer impact scoring.

## Testing

- [x] Unit tests added (coverage: 94% on changed files)
- [x] Integration tests pass
- [x] Manually tested in staging with production-like load
- [ ] Load test pending (scheduled for tomorrow)`,

  (title) => `## Summary

${title}

This is part of the Project Atlas refactoring effort to prepare the platform for enterprise scale. The change is backwards-compatible — no API contract changes.

## Changes

- Refactored the data access layer to use repository pattern
- Added circuit breaker for external service calls
- Improved error messages to be more actionable for operators
- Added OpenTelemetry spans for new code paths

## Testing

- [x] All existing tests pass
- [x] New unit tests for repository pattern
- [x] Tested in staging
- [x] Performance benchmarks: no regression (< 1% latency change)`,

  (title) => `## Summary

${title}

**Motivation:** This was raised in the December sprint retrospective as a source of developer friction. Three engineers reported spending > 2 hours debugging issues caused by this gap.

**Approach:** Chose the most minimal fix that solves the problem without introducing new abstractions. Considered a larger refactor but decided to keep scope tight to reduce review burden (especially given current review queue depth).

## Testing

- [x] Added regression test that would have caught this bug
- [x] Verified fix in development environment
- [x] QA sign-off from @qa-lead

## Notes

This unblocks the data export work in HPLT-892 — Kenji can pick it up once this merges.`,
];

export function generatePullRequests(repos, engineers, jiraIssues) {
  const prs = [...SCENARIO_PRS.map(p => ({ ...p }))];

  const allAreas = Object.keys(TITLES_BY_AREA);

  for (const repo of repos) {
    const count = faker.number.int({min:18, max:22});
    for (let i = 1; i <= count; i++) {
      const status = faker.helpers.weightedArrayElement(STATUSES);
      const author = faker.helpers.arrayElement(engineers);
      const createdAt = faker.date.between({from:'2024-01-01', to:'2025-12-01'}).toISOString();
      const area = faker.helpers.arrayElement(allAreas);
      const titlePool = TITLES_BY_AREA[area];
      const title = faker.helpers.arrayElement(titlePool);
      const bodyTemplate = faker.helpers.arrayElement(BODY_TEMPLATES);

      prs.push({
        id: `pr-${repo.id}-${String(i).padStart(3,'0')}`,
        repoId: repo.id,
        title,
        body: bodyTemplate(title),
        author: author.id,
        reviewers: faker.helpers.arrayElements(engineers.filter(e => e.id !== author.id), faker.number.int({min:1, max:3})).map(e => e.id),
        status,
        baseBranch: 'main',
        headBranch: `${area}/${faker.helpers.slugify(title).slice(0, 30)}`,
        mergedAt: status === 'merged' ? faker.date.between({from: createdAt, to: '2025-12-14'}).toISOString() : null,
        createdAt,
        jiraIssueId: faker.datatype.boolean(0.4) && jiraIssues.length ? faker.helpers.arrayElement(jiraIssues).id : null,
        labels: faker.helpers.arrayElements(['bug','feature','refactor','chore','perf','security'], faker.number.int({min:1, max:2})),
      });
    }
  }

  return prs;
}
