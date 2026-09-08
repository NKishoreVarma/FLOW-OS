/**
 * Incidents generator — real descriptions, named scenarios at fixed IDs.
 * No lorem ipsum. All descriptions are standalone narrative text FLOW can embed.
 */
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';
import { EMP, CUST, INC, JIRA, REPO, OVERNIGHT_INCIDENT } from '../scenarios.js';

// Real incident description pools — no lorem ipsum
const REAL_DESCRIPTIONS = {
  P0: [
    'Database primary node failover in us-west-2a. Read replicas did not promote automatically due to a misconfigured Route 53 health check that was checking the wrong port (5433 instead of 5432). All write operations failed for 8 minutes. Affected all 210 customers. CTO and VP Engineering paged immediately. Recovery: manual failover via RDS console. Post-mortem completed. Health check configuration now validated in CI.',
    'Complete Platform API outage caused by a botched deployment of v3.1.5. A database migration dropped a column (workflow_metadata) still referenced by running queries. Zero-downtime deployment failed because the rolling restart exposed mixed versions reading the dropped column. 100% of API requests returned 500. MTTR 22 minutes. Rollback triggered immediately upon detection. Post-mortem: add column deprecation safety period (2-week minimum before drop).',
    'SSL certificate expiration on the platform-api.heliossoftware.com domain caused all HTTPS connections to fail. Certificate had been issued by the legacy CA account that was not monitored by cert-manager. Alert was in the old PagerDuty account (not migrated). All customer dashboard connections failed for 34 minutes. Fix: emergency cert issuance via Let\'s Encrypt. Process improvement: cert-manager now manages all production certificates; old CA account decommissioned.',
  ],
  P1: [
    OVERNIGHT_INCIDENT.description,
    'Auth service returning 401 errors for all requests using API key authentication. Root cause: a code change in v3.1.8 accidentally reversed the API key validation logic (returning false when key was valid, true when invalid). Affected customers using API key auth (not OAuth). 23% of API calls affected. Fix: hotfix v3.1.8-p1 deployed in 23 minutes. Post-mortem: add integration test for API key validation path.',
    'Analytics pipeline stalled for 4 hours due to a deadlock in the PostgreSQL event store. A long-running VACUUM ANALYZE operation held a lock that blocked all analytics write transactions. Affected: all real-time dashboard updates, metric aggregations, and scheduled reports. Root cause: VACUUM scheduled at peak load time. Fix: VACUUM moved to off-peak window (2-4 AM). Auto-vacuum thresholds tuned.',
    'Connect adapter webhook delivery failure: all outgoing webhooks returning 408 timeout errors. Root cause: the webhook delivery queue (Redis-backed BullMQ) had accumulated 847,000 unprocessed jobs due to a misconfigured worker concurrency setting (set to 1 instead of 20) after a code merge conflict resolution. Jobs were timing out before being processed. Fix: flush queue, fix concurrency, redeploy worker. 6,200 webhooks permanently lost (customers notified).',
    'Guard policy engine returning incorrect allow decisions for users with custom role permissions. A SQL query in the permission evaluator was missing an AND clause after a refactor, causing it to return all permissions for a user regardless of their role. This meant users with "read-only" custom roles could perform write operations. Detected by a customer (Meridian Health) who noticed unexpected data modifications. Security: reviewed audit logs, no evidence of malicious use. Fix: HGRD-234 hotfix deployed. All affected customers notified per security disclosure policy.',
    'Data export service failing for all exports with >10,000 rows. Root cause: a streaming export feature (introduced in v3.1.7) has an off-by-one error in the pagination cursor that causes it to loop forever on the last page when row count is exactly divisible by page size. Workaround: customers asked to export in chunks of 9,999 rows. Fix in progress: HPLT-892. Impact: Acme Corp (nightly 50K-row export), GlobalTech (weekly 25K-row report), 3 other enterprise customers.',
    'Platform API p99 latency spike to 8,200ms (normal: 180ms). Root cause: a new Prometheus metric added in v3.1.9 was using a high-cardinality label (user_id) causing the metric store to grow unbounded. Prometheus OOMKilled, taking down scraping for 4 hours. During that window, an unrelated connection pool exhaustion went undetected. Fix: remove high-cardinality label, set cardinality limit on all metrics. Grafana alerts updated.',
    'Deployment pipeline stuck: all production deployments blocked for 2 hours. Root cause: a GitHub Actions runner ran out of disk space (97% full) due to Docker build caches not being pruned. All new builds queued but not starting. Affected: hotfix deployment for HPLT-847 was delayed 2 hours. Fix: added disk cleanup step to all workflows, set up disk usage alerting. Runner disk now auto-pruned nightly.',
  ],
  P2: [
    'Search indexing stopped updating for Helios Analytics. New workflow executions were not appearing in search results. Root cause: Elasticsearch index refresh interval was accidentally set to -1 (disabled) during a performance tuning exercise. Fix: set refresh_interval back to 1s. No data loss; all documents present, just not searchable.',
    'Date formatting displaying incorrectly for users in EU locales (Germany, France, Netherlands). Dates shown as "12/14/2025" (US format) instead of "14.12.2025". Root cause: a locale detection function was not respecting the Accept-Language header after a middleware refactor. Fix: restore middleware order. 847 EU users affected.',
    'PDF report exports missing the last column for reports with >15 columns. Root cause: a hardcoded page width constant in the PDF renderer was not handling wide reports. Fix: dynamic column width calculation. 34 reports affected; customers offered re-run.',
    'Webhook retry mechanism not triggering for endpoints returning 429 (rate limited). Root cause: the retry logic only retried 5xx errors, not 429. Fix: add 429 to the retryable status codes list.',
    'Two-factor authentication SMS delivery delayed by 15-45 minutes for US phone numbers. Root cause: Twilio account limit reached; switched to backup SMS provider. SMS delivery now under 30 seconds.',
    'Customer import wizard hanging at the data validation step for CSV files with UTF-8 BOM character. Root cause: BOM not stripped before parsing. Fix: strip BOM on upload.',
    'Advanced search not returning results when query contains special characters (parentheses, quotes). Root cause: Elasticsearch query string not escaped. Fix: use match query instead of query_string for user input.',
    'Background job scheduler firing duplicate jobs for the same workflow when system clock skew >500ms between workers. Root cause: distributed locking timeout too short. Fix: extend lock timeout to 30s, use Redis SETNX with expiry.',
    'Dashboard load time degraded from 1.2s to 8.4s for customers with >500 active workflows. Root cause: N+1 query in the workflow list API — each workflow triggered a separate query to fetch the last-run status. Fix: batch status fetch with a single JOIN query.',
    'Email notification templates showing raw Handlebars placeholders ({{recipient.name}}) for new customers. Root cause: template precompilation step skipped during CI due to a missing npm script. Fix: add template compilation to CI pipeline.',
    'Connect marketplace connector installation failing silently for connectors with names containing spaces. Root cause: URL encoding issue in the connector ID generation. Fix: slug all connector names.',
    'Guard access control reports showing incorrect last-access timestamps (off by timezone offset). Root cause: timestamps stored in local time instead of UTC. Migration script applied to fix historical data.',
  ],
  P3: [
    'Documentation links broken in the in-app help widget — pointing to old docs domain. Fix: update links to new docs.heliossoftware.com domain.',
    'Onboarding wizard completion rate dropped 12%. Root cause: a browser back-button navigation during step 3 cleared form state. Fix: persist wizard state to sessionStorage.',
    'Audit log CSV export does not include timezone information in timestamps. Feature request elevated to bug due to compliance customer request (Nexigen Pharma).',
    'Billing invoice PDF showing incorrect decimal format for ARR values >$100,000 (comma used as decimal separator for EU locale). Fix: use Intl.NumberFormat correctly for all locales.',
    'Search bar in connector marketplace not searching connector descriptions, only names. Fix: include description field in Elasticsearch query.',
    'Profile photo upload rejecting PNG files > 1MB despite 5MB limit shown in UI. Root cause: off-by-one in file size validation (1,048,576 bytes < 1MB check instead of <=). Fix: use <= in comparison.',
  ],
};

const PRODUCTS_BY_ID = {};

// Resolution templates
const RESOLUTIONS = {
  P0: [
    'Emergency rollback deployed. Root cause fixed in hotfix release. Monitoring confirmed stable. Post-mortem completed and action items tracked in Jira.',
    'Hotfix deployed within SLA. All customers fully restored. Post-mortem completed. Process improvements implemented to prevent recurrence.',
  ],
  P1: [
    'Hotfix deployed. Service restored within P1 SLA (90 minutes). Post-mortem in progress. Customer notifications sent.',
    'Root cause identified and fixed. Hotfix v{version} deployed. All affected customers restored. Post-mortem scheduled for next week.',
  ],
  P2: [
    'Fix deployed in next regular release. Workaround provided to affected customers.',
    'Issue resolved in patch release. No customer data lost.',
  ],
  P3: ['Fixed in next release.', 'Low-priority fix scheduled for next sprint.'],
};

export function generateIncidents(employees, customers) {
  const srTeam = employees.filter(e => e.department === 'dept-devops' || e.department.startsWith('dept-eng'));
  const incidents = [];

  // ── Fixed scenario incidents (must appear at specific IDs) ───────────────
  const davidPark = employees.find(e => e.id === EMP.StaffEng1) || srTeam[0];
  const priyaNair  = employees.find(e => e.id === EMP.StaffEng2) || srTeam[1];
  const devopsLead = employees.find(e => e.id === EMP.DevOpsLead) || srTeam[2];

  // inc-001: P0 Database outage (Oct 2024)
  incidents.push({
    id: INC.P0_DB_OUTAGE,
    title: 'P0: Database primary failover — writes down for 8 minutes',
    description: REAL_DESCRIPTIONS.P0[0],
    severity: 'P0',
    status: 'resolved',
    affectedProduct: 'prod-platform',
    affectedCustomers: customers.slice(0, 30).map(c => c.id),
    commander: devopsLead?.id || srTeam[0].id,
    timeline: [
      { timestamp: '2024-10-14T03:22:00Z', action: 'P0 alert fired: database write failure rate 100%', actor: devopsLead?.id || srTeam[0].id },
      { timestamp: '2024-10-14T03:23:00Z', action: 'Incident channel #inc-001-db-outage created, CTO and VP Engineering paged', actor: devopsLead?.id || srTeam[0].id },
      { timestamp: '2024-10-14T03:31:00Z', action: 'Root cause identified: Route53 health check misconfigured', actor: priyaNair?.id || srTeam[1].id },
      { timestamp: '2024-10-14T03:30:00Z', action: 'Manual failover initiated via RDS console', actor: devopsLead?.id || srTeam[0].id },
      { timestamp: '2024-10-14T03:35:00Z', action: 'Write operations restored, monitoring 5 minutes for stability', actor: devopsLead?.id || srTeam[0].id },
      { timestamp: '2024-10-14T03:47:00Z', action: 'All services confirmed healthy. Incident resolved.', actor: devopsLead?.id || srTeam[0].id },
    ],
    rootCause: 'Route 53 health check configured to monitor port 5433 (incorrect) instead of 5432 (PostgreSQL). When primary failed, health check did not detect it as unhealthy, so failover automation did not trigger.',
    resolution: 'Manual failover via RDS console. Health check corrected. Cert-manager implemented to prevent future misconfigurations. Post-mortem completed 2024-10-16.',
    detectedAt: '2024-10-14T03:22:00Z',
    resolvedAt: '2024-10-14T03:47:00Z',
    mttr: 25,
  });

  // inc-002 to inc-041: random incidents (before auth regression)
  for (let i = 2; i <= 41; i++) {
    const sev = faker.helpers.weightedArrayElement([
      {weight:0.04,value:'P0'},{weight:0.18,value:'P1'},{weight:0.42,value:'P2'},{weight:0.36,value:'P3'}
    ]);
    const status = faker.helpers.weightedArrayElement([
      {weight:0.8,value:'resolved'},{weight:0.12,value:'mitigated'},{weight:0.08,value:'investigating'}
    ]);
    const product = faker.helpers.arrayElement(PRODUCTS);
    const detectedAt = faker.date.between({from:'2024-10-20',to:'2025-11-15'}).toISOString();
    const mttr = sev==='P0' ? faker.number.int({min:20,max:180}) : sev==='P1' ? faker.number.int({min:15,max:90}) : faker.number.int({min:5,max:45});
    const resolvedAt = status === 'resolved' ? new Date(new Date(detectedAt).getTime()+mttr*60000).toISOString() : null;
    const commander = faker.helpers.arrayElement(srTeam);
    const descPool = REAL_DESCRIPTIONS[sev] || REAL_DESCRIPTIONS.P2;
    incidents.push({
      id: `inc-${String(i).padStart(3,'0')}`,
      title: faker.helpers.arrayElement([
        'Analytics pipeline stalled — dashboards not updating',
        'Webhook delivery queue backlog exceeding threshold',
        'Connect adapter rate limit exceeded — third-party API throttling',
        'Memory usage spike in platform worker nodes',
        'Deployment pipeline blocked — CI runner disk full',
        'Search index not updating for new records',
        'API gateway latency p99 elevated above SLO',
        'Database replication lag exceeding 30 seconds',
        'Scheduled report delivery failing for premium customers',
        'Background job scheduler firing duplicate jobs',
        'SSL certificate expiring within 7 days — action required',
        'On-call rotation gap detected — no primary oncall for 2 hours',
        'Third-party dependency rate-limit exceeded in Connect Hub',
        'Load balancer health check returning false negatives',
        'Auth service response time degraded — p99 above 500ms',
      ]),
      description: faker.helpers.arrayElement(descPool),
      severity: sev, status,
      affectedProduct: product.id,
      affectedCustomers: faker.helpers.arrayElements(customers, faker.number.int({min:0,max: sev==='P0'?30:sev==='P1'?5:2})).map(c=>c.id),
      commander: commander.id,
      timeline: [
        { timestamp: detectedAt, action: 'Monitoring alert triggered', actor: commander.id },
        { timestamp: new Date(new Date(detectedAt).getTime()+300000).toISOString(), action: 'Incident channel created, on-call paged', actor: commander.id },
        { timestamp: new Date(new Date(detectedAt).getTime()+900000).toISOString(), action: 'Root cause identified', actor: faker.helpers.arrayElement(srTeam).id },
        ...(resolvedAt?[{timestamp:resolvedAt, action:'Service fully restored', actor:commander.id}]:[]),
      ],
      rootCause: faker.helpers.arrayElement([
        'Misconfigured load balancer after routine maintenance',
        'Unindexed query causing full table scan during peak load',
        'Memory allocation regression introduced in previous deployment',
        'Third-party dependency API rate limit exceeded',
        'Infrastructure autoscaling not triggering due to incorrect metric configuration',
        'Network partition between availability zones lasting 4 minutes',
        'Certificate not rotated before expiration due to monitoring gap',
        'Deployment script missing environment-specific variable substitution',
        'Cache invalidation bug causing stale data to be served',
        'Connection pool exhaustion due to long-running transactions not releasing connections',
      ]),
      resolution: faker.helpers.arrayElement(RESOLUTIONS[sev] || RESOLUTIONS.P2).replace('{version}', faker.system.semver()),
      detectedAt, resolvedAt,
      mttr: resolvedAt ? mttr : null,
    });
  }

  // inc-042: P1 Auth regression (blocks Release 3.2)
  incidents.push({
    id: INC.P1_AUTH_REGR,
    title: 'P1: Auth service regression — SSO login failures for enterprise accounts',
    description: 'Auth service regression introduced in v3.1.9-rc2 causing intermittent SSO login failures for enterprise accounts. JWT token refresh mechanism has a race condition when multiple concurrent refresh requests arrive within 50ms of each other (common at shift change for large customers). Affected enterprise accounts with 500+ concurrent users. First detected by QA team during Release 3.2 regression testing on December 10, 2025. Root cause traced to a change in PR #836 (optimize token caching layer) that introduced a mutex bug. PR #847 is the fix. Currently blocked in review — assigned to David Park who is also managing INC-076 memory leak and Project Atlas.',
    severity: 'P1',
    status: 'mitigated',
    affectedProduct: 'prod-platform',
    affectedCustomers: [CUST.ACME, CUST.MERIDIAN, CUST.GLOBALTECH, CUST.NEXIGEN, CUST.PINNACLE],
    commander: davidPark?.id || srTeam[0].id,
    timeline: [
      { timestamp: '2025-12-10T09:14:00Z', action: 'QA detected auth regression during Release 3.2 regression testing', actor: employees.find(e=>e.id===EMP.QALead)?.id || srTeam[0].id },
      { timestamp: '2025-12-10T09:45:00Z', action: 'P1 incident declared. On-call David Park assigned as commander.', actor: davidPark?.id || srTeam[0].id },
      { timestamp: '2025-12-10T11:30:00Z', action: 'Root cause identified: mutex bug in PR #836 token caching layer', actor: davidPark?.id || srTeam[0].id },
      { timestamp: '2025-12-10T14:00:00Z', action: 'Mitigation applied: feature flag to disable token caching for enterprise accounts. Login success rate restored to 99.8%.', actor: davidPark?.id || srTeam[0].id },
      { timestamp: '2025-12-11T10:00:00Z', action: 'PR #847 (fix: resolve token refresh race condition) opened. Assigned for review.', actor: davidPark?.id || srTeam[0].id },
      { timestamp: '2025-12-14T09:00:00Z', action: 'PR #847 still open, 4 days without review. Reviewer David Park on-call for INC-076.', actor: employees.find(e=>e.id===EMP.DevOpsLead)?.id || srTeam[0].id },
    ],
    rootCause: 'Mutex bug in token caching layer (PR #836) causes race condition when >3 concurrent refresh requests arrive for same session. The mutex release was placed inside an error handler that is only called when the token store is unavailable — under normal operation, the mutex is never released after a refresh, causing subsequent refreshes to deadlock until 30-second timeout.',
    resolution: 'Mitigation: feature flag disabled token caching for enterprise accounts. Permanent fix in PR #847 (pending review). Release 3.2 blocked until fix merged and regression suite passes.',
    detectedAt: '2025-12-10T09:14:00Z',
    resolvedAt: null,
    mttr: null,
  });

  // inc-043 to inc-075
  for (let i = 43; i <= 75; i++) {
    const sev = faker.helpers.weightedArrayElement([
      {weight:0.03,value:'P0'},{weight:0.17,value:'P1'},{weight:0.44,value:'P2'},{weight:0.36,value:'P3'}
    ]);
    const status = faker.helpers.weightedArrayElement([
      {weight:0.78,value:'resolved'},{weight:0.14,value:'mitigated'},{weight:0.08,value:'investigating'}
    ]);
    const product = faker.helpers.arrayElement(PRODUCTS);
    const detectedAt = faker.date.between({from:'2025-11-20',to:'2025-12-10'}).toISOString();
    const mttr = sev==='P0' ? faker.number.int({min:20,max:180}) : sev==='P1' ? faker.number.int({min:15,max:90}) : faker.number.int({min:5,max:45});
    const resolvedAt = status==='resolved' ? new Date(new Date(detectedAt).getTime()+mttr*60000).toISOString() : null;
    const commander = faker.helpers.arrayElement(srTeam);
    const descPool = REAL_DESCRIPTIONS[sev] || REAL_DESCRIPTIONS.P2;
    incidents.push({
      id: `inc-${String(i).padStart(3,'0')}`,
      title: faker.helpers.arrayElement([
        'Connect Hub webhook retry queue stalled',
        'Analytics aggregation job failed for 3 customers',
        'API rate limiter incorrectly blocking legitimate traffic',
        'Guard audit log missing entries for 2-hour window',
        'Customer data export size limit error',
        'Background sync job timing out',
        'Connector OAuth token refresh failing silently',
        'Search ranking degraded for enterprise customers',
        'Scheduled workflow not executing on time',
        'Platform API error rate elevated',
      ]),
      description: faker.helpers.arrayElement(descPool),
      severity: sev, status,
      affectedProduct: product.id,
      affectedCustomers: faker.helpers.arrayElements(customers, faker.number.int({min:0,max: sev==='P1'?4:2})).map(c=>c.id),
      commander: commander.id,
      timeline: [
        { timestamp: detectedAt, action: 'Alert triggered', actor: commander.id },
        { timestamp: new Date(new Date(detectedAt).getTime()+300000).toISOString(), action: 'On-call paged', actor: commander.id },
        ...(resolvedAt?[{timestamp:resolvedAt, action:'Resolved', actor:commander.id}]:[]),
      ],
      rootCause: faker.helpers.arrayElement([
        'Configuration change not propagated to all instances after deployment',
        'Third-party API contract change not accounted for in adapter code',
        'Disk pressure causing retry queue to stop persisting jobs',
        'Long-running query blocking connection pool during peak hours',
        'Feature flag roll-out triggered unexpected code path for 0.3% of users',
      ]),
      resolution: faker.helpers.arrayElement(RESOLUTIONS[sev] || RESOLUTIONS.P2).replace('{version}', faker.system.semver()),
      detectedAt, resolvedAt,
      mttr: resolvedAt ? mttr : null,
    });
  }

  // inc-076: P1 Memory leak (THE overnight incident — Dec 14, 2:47 AM)
  incidents.push({
    id: INC.P1_MEMORY_LEAK,
    title: 'P1: Memory pool exhaustion in Platform API — 503 errors on /api/v3/workflows',
    description: OVERNIGHT_INCIDENT.description,
    severity: 'P1',
    status: 'mitigated',
    affectedProduct: 'prod-platform',
    affectedCustomers: OVERNIGHT_INCIDENT.affectedCustomers,
    commander: priyaNair?.id || srTeam[1].id,
    timeline: [
      { timestamp: OVERNIGHT_INCIDENT.detectedAt, action: 'PagerDuty alert: Platform API memory usage 94%, error rate 100% on /api/v3/workflows', actor: priyaNair?.id || srTeam[1].id },
      { timestamp: '2025-12-14T02:52:00Z', action: 'Priya Nair acknowledged page, began investigation. kubectl describe pod shows OOMKill imminent.', actor: priyaNair?.id || srTeam[1].id },
      { timestamp: '2025-12-14T02:58:00Z', action: 'Incident channel #inc-076-memory-leak created. David Park paged as secondary responder.', actor: priyaNair?.id || srTeam[1].id },
      { timestamp: '2025-12-14T03:10:00Z', action: 'Root cause identified: unbounded in-memory cache in workflow execution engine (WorkflowCache.populate() has no eviction policy). Introduced in v3.1.9 deployed December 13 6:30 PM.', actor: davidPark?.id || srTeam[0].id },
      { timestamp: '2025-12-14T03:15:00Z', action: 'Temporary mitigation: rolling restart of Platform API pods to clear memory. 60% reduction in error rate immediately.', actor: priyaNair?.id || srTeam[1].id },
      { timestamp: '2025-12-14T03:20:00Z', action: 'PR #894 (fix: add LRU eviction to WorkflowCache) opened by David Park. Emergency review requested.', actor: davidPark?.id || srTeam[0].id },
      { timestamp: '2025-12-14T03:28:00Z', action: 'PR #894 reviewed and approved by Elena Torres. Merged to main.', actor: employees.find(e=>e.id===EMP.DevOpsLead)?.id || srTeam[2].id },
      { timestamp: '2025-12-14T03:31:00Z', action: 'Hotfix v3.1.9-p1 deployed to production. Memory usage normalizing.', actor: priyaNair?.id || srTeam[1].id },
      { timestamp: OVERNIGHT_INCIDENT.resolvedAt, action: 'All pods healthy. Error rate 0%. Incident resolved. Post-mortem scheduled for December 16.', actor: priyaNair?.id || srTeam[1].id },
    ],
    rootCause: 'Unbounded in-memory cache (WorkflowCache) introduced in v3.1.9 had no LRU eviction policy. For customers with many workflow templates (Acme Corp: 12,400 templates), the cache would grow to consume all available heap memory within 8-12 hours of a pod restart. The deployment at 6:30 PM December 13 started all pods fresh; by 2:47 AM they had all grown to >90% memory usage simultaneously and began OOMKilling.',
    resolution: 'Hotfix PR #894: add LRU eviction policy (max 5,000 entries, 15-minute TTL) to WorkflowCache. Deployed as v3.1.9-p1 at 3:31 AM. Service restored by 3:34 AM. MTTR: 47 minutes. Affected customers (Acme Corp, Meridian Health, GlobalTech) notified by 4:00 AM. Post-mortem scheduled.',
    detectedAt: OVERNIGHT_INCIDENT.detectedAt,
    resolvedAt: OVERNIGHT_INCIDENT.resolvedAt,
    mttr: OVERNIGHT_INCIDENT.mttr,
    relatedJiraId: JIRA.MEMORY_HOTFIX,
    relatedPR: 'pr-894',
  });

  // inc-077 to inc-120
  for (let i = 77; i <= 120; i++) {
    const sev = faker.helpers.weightedArrayElement([
      {weight:0.02,value:'P0'},{weight:0.18,value:'P1'},{weight:0.45,value:'P2'},{weight:0.35,value:'P3'}
    ]);
    const status = faker.helpers.weightedArrayElement([
      {weight:0.7,value:'resolved'},{weight:0.2,value:'mitigated'},{weight:0.1,value:'investigating'}
    ]);
    const product = faker.helpers.arrayElement(PRODUCTS);
    const detectedAt = faker.date.between({from:'2025-12-14T04:00:00Z',to:'2025-12-14T23:59:59Z'}).toISOString();
    const mttr = faker.number.int({min:10,max:60});
    const resolvedAt = status==='resolved' ? new Date(new Date(detectedAt).getTime()+mttr*60000).toISOString() : null;
    const commander = faker.helpers.arrayElement(srTeam);
    incidents.push({
      id: `inc-${String(i).padStart(3,'0')}`,
      title: faker.helpers.arrayElement([
        'Residual latency on /api/v3/workflows endpoint post-INC-076',
        'Acme Corp dashboard showing stale data — cache not invalidated post-restart',
        'Connect Hub OAuth token refresh failure for 3 connectors',
        'Analytics batch job delayed due to overnight pod restarts',
        'API gateway returning 502 errors for 4% of requests',
        'Notification delivery delayed >15 minutes for webhook consumers',
        'Data export timeout for customers with >100K records',
        'Guard policy cache stale after role changes',
        'Platform worker pod autoscaling delayed 8 minutes',
        'Analytics dashboard load time degraded — p99 above 12s',
        'Connector marketplace search returning empty results intermittently',
        'Background audit log archival job failing — disk I/O contention',
        'Rate limiter incorrectly blocking an enterprise tenant during burst traffic',
        'Webhook delivery queue length exceeded 50,000 — backpressure triggered',
        'SSO token expiry mismatch for customer on custom session length',
        'nightly report delivery failed for 3 premium customers',
        'Scheduler job fired 2x due to clock skew between worker nodes',
        'Customer import wizard timing out on files >10MB',
        'Graph visualization degraded for customers with >500 entity nodes',
        'Multi-region sync latency elevated — EU replica 8s behind primary',
      ]),
      description: faker.helpers.arrayElement(REAL_DESCRIPTIONS.P2),
      severity: sev, status,
      affectedProduct: product.id,
      affectedCustomers: faker.helpers.arrayElements(customers, faker.number.int({min:0,max:2})).map(c=>c.id),
      commander: commander.id,
      timeline: [
        { timestamp: detectedAt, action: 'Issue detected post-INC-076 recovery', actor: commander.id },
        ...(resolvedAt?[{timestamp:resolvedAt, action:'Resolved', actor:commander.id}]:[]),
      ],
      rootCause: 'Follow-on issue from INC-076 memory exhaustion and pod restarts',
      resolution: resolvedAt ? 'Resolved as part of INC-076 remediation' : 'Under investigation',
      detectedAt, resolvedAt,
      mttr: resolvedAt ? mttr : null,
      relatedIncidentId: INC.P1_MEMORY_LEAK,
    });
  }

  return incidents;
}
