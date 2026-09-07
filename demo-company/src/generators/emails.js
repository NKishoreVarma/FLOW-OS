/**
 * Emails generator — real email content with scenario threads.
 * No lorem ipsum. Named scenario threads (Acme Corp escalation, Release 3.2 delay, etc.)
 */
import faker from '../faker.js';
import { EMP, CUST, INC, JIRA, PROJ } from '../scenarios.js';

// ── Named scenario email threads ──────────────────────────────────────────────
function buildScenarioThreads(employees, customers) {
  const emp = (id) => employees.find(e => e.id === id);
  const acme = customers.find(c => c.id === CUST.ACME);

  const threads = [
    // Thread 1: Acme Corp CTO escalation (Dec 11)
    {
      threadId: 'thread-acme-escalation-dec11',
      subject: 'Urgent: Two Outstanding P1 Issues Affecting Acme Corp Production — Contract Renewal Risk',
      emails: [
        {
          from: 'customer:cust-acme-corp',
          to: [EMP.VPSuccess],
          cc: [EMP.CSM1, EMP.CTO],
          customerContact: 'Marcus Webb (CTO, Acme Corp) <marcus.webb@acmecorp.com>',
          body: `Hi Michael,

I'm writing to escalate two production issues that have been affecting our team for the past week. We have 1,200 users on the Helios Platform and these issues are severely impacting our operations.

**Issue 1: Data Export Failing (8 days open — HPLT-892)**
Our nightly batch export process (50,000 rows) has been completely failing for 8 days. We're running manual workarounds (splitting exports into 9,999-row chunks) which is adding 3 hours of manual work to our team's daily process. This is completely unacceptable for an enterprise platform.

**Issue 2: SSO Login Failures During Peak Hours (HPLT-847)**
Our users are experiencing intermittent authentication failures during peak hours (9-10 AM when all 1,200 users start their day). The workaround you provided (disabling token caching) has improved things but we still see failures during high-concurrency periods.

We have our contract renewal coming up on December 28 ($285K ARR). I need a clear commitment from engineering leadership on when these will be resolved — with specific fix dates, not estimates — before we can proceed with the renewal discussion.

I would also like to understand what happened with the overnight outage on December 14 that took down our workflow service for 47 minutes. We had 847 failed executions which required manual recovery on our end.

I'd like to schedule a call with your CTO or VP Engineering this week.

Marcus Webb
CTO, Acme Corp`,
          timestamp: '2025-12-11T08:47:00Z',
        },
        {
          from: EMP.VPSuccess,
          to: [EMP.CTO, EMP.CSM1],
          subject: 'URGENT: Acme Corp escalation — renewal at risk',
          body: `Sarah, James,

Marcus Webb's email is attached. This is our highest priority renewal (December 28, $285K). I need you both on this today.

Sarah — can you join a customer call this week? I'm thinking December 16. I need engineering leadership present to demonstrate credibility.

James — please schedule the call and confirm Marcus Webb can attend.

Action items from my end:
1. I'm requesting CFO approval for a 15% December credit ($3,562) given the outages
2. I want to offer Kronos analytics beta to address the 45-second dashboard load time they've complained about before
3. I need fix ETAs for HPLT-847 and HPLT-892 by end of day today

Michael`,
          timestamp: '2025-12-11T09:02:00Z',
        },
        {
          from: EMP.CTO,
          to: [EMP.VPSuccess, EMP.StaffEng1],
          subject: 'Re: URGENT: Acme Corp escalation — renewal at risk',
          body: `Michael, David,

I'll join the December 16 call.

David — I need firm dates on both tickets today:
- HPLT-892 (data export): when will the fix be in production?
- HPLT-847 (auth timeout): when will PR #847 be reviewed and merged?

This renewal needs to close. These tickets need to close first.

Sarah`,
          timestamp: '2025-12-11T09:15:00Z',
        },
        {
          from: EMP.StaffEng1,
          to: [EMP.CTO, EMP.VPSuccess],
          subject: 'Re: URGENT: Acme Corp escalation — renewal at risk',
          body: `Hi Sarah, Michael,

Fix dates:
- HPLT-892 (data export, off-by-one in pagination cursor): Fix is 80% done. PR tomorrow morning (December 12). Deployed to production by December 15 at the latest. I'm confident in this date.
- HPLT-847 (auth token refresh): PR #847 is written. Needs 1 more reviewer (Marcus Reid gave one approval, need second). I'm going to get this reviewed today — will prioritize it over everything else. If merged today, can be in production by December 12. The mitigation (feature flag) means they're not seeing active failures, just reduced reliability during peak concurrency.

For the December 16 call: both fixes should be deployed or deploying by then. I can demo the fixed export working with 50K rows.

Also noting: the overnight INC-076 was caused by a different issue (memory cache, not auth). Fix is already deployed (PR #894, December 14). That specific issue won't recur.

David`,
          timestamp: '2025-12-11T10:00:00Z',
        },
        {
          from: EMP.CSM1,
          to: ['customer:cust-acme-corp', EMP.VPSuccess, EMP.CTO],
          customerContact: 'Marcus Webb (CTO, Acme Corp) <marcus.webb@acmecorp.com>',
          subject: 'Re: Urgent: Two Outstanding P1 Issues — December 16 Engineering Call',
          body: `Dear Marcus,

Thank you for bringing this to our attention directly. We take these issues very seriously and I want to share where we stand:

**HPLT-892 (Data Export)**: Engineering has a fix in progress — PR expected December 12, deployed to production by December 15. The fix addresses the exact scenario you described (exports with row counts divisible by 1,000). Once deployed, your nightly 50K-row export will work without workarounds.

**HPLT-847 (Auth Timeout)**: Fix is written and in final review today. We expect this in production by December 12-13. The current mitigation has reduced failures significantly but I understand that's not acceptable for enterprise reliability.

**December 14 Overnight Incident (INC-076)**: This was caused by a separate issue — a memory cache bug introduced in v3.1.9. Our team resolved it in 47 minutes (our SLA is 90 minutes for P1). The fix is already deployed. I'll send a formal incident report separately.

I'm proposing a joint engineering call for **December 16 at 10:00 AM PST**. Our CTO Sarah Chen and the engineering leads will join. We'll demo the fixes in action.

As a goodwill gesture for the disruption in December, I'd also like to offer Acme Corp a 15% credit on your December invoice and early access to our Kronos analytics beta (which addresses the 45-second dashboard load times you've experienced).

Would December 16 at 10 AM PST work for you?

Best,
James Wilks
Senior Customer Success Manager, Helios Software`,
          timestamp: '2025-12-11T11:30:00Z',
        },
        {
          from: 'customer:cust-acme-corp',
          to: [EMP.CSM1, EMP.VPSuccess, EMP.CTO],
          customerContact: 'Marcus Webb (CTO, Acme Corp) <marcus.webb@acmecorp.com>',
          body: `James,

December 16 at 10 AM PST works. I'll have Lisa Park (VP Engineering) join as well.

I appreciate the commitment to fix dates. We need to see these working before December 28. The credit is appreciated.

One additional thing we need addressed: the INC-076 incident report. We need documentation of what happened for our own internal reporting to our board. Can you send that by December 16?

Marcus`,
          timestamp: '2025-12-11T13:45:00Z',
        },
      ],
    },

    // Thread 2: Release 3.2 delay customer notification (Dec 12)
    {
      threadId: 'thread-release-32-notification',
      subject: 'Important Update: Helios Platform Release 3.2 — New Delivery Date',
      emails: [
        {
          from: EMP.PMRelease,
          to: ['customer:cust-acme-corp', 'customer:cust-globaltech-solutions', 'customer:cust-techvision-inc'],
          bcc: [EMP.VPProduct, EMP.VPSales],
          body: `Dear Helios Enterprise Customer,

I want to personally update you about Helios Platform Release 3.2.

**Updated delivery date: December 29, 2025** (previously December 15, 2025).

**Why**: During our final QA regression testing on December 10, we identified a reliability issue in our authentication service that affects enterprise SSO accounts under high concurrency. We have a fix in development, but we made the decision to delay the release by two weeks rather than ship a known issue to production. This reflects our commitment to stability for enterprise accounts.

**What's in Release 3.2**:
- Bulk workflow editor — edit up to 50 workflows simultaneously
- Advanced retry policies — configurable exponential backoff with dead-letter queues
- Native Slack integration — no-code Slack connector (two-way action support)
- Performance improvements — 40% reduction in p99 latency for the workflow execution API

All four features will be available on December 29 as planned. The authentication fix is being included in the release.

**What you can do now**: If you'd like early access to the Slack connector beta (available December 19 via a feature flag), please reply to this email and I'll enable it for your account.

Thank you for your patience and partnership.

Carlos Mendez
Product Manager, Helios Platform`,
          timestamp: '2025-12-12T14:00:00Z',
        },
        {
          from: 'customer:cust-globaltech-solutions',
          to: [EMP.PMRelease, EMP.VPProduct],
          customerContact: 'Sandra Lee (VP Engineering, GlobalTech Solutions) <sandra.lee@globaltech.io>',
          body: `Carlos,

Thanks for the heads up. We appreciate the transparency — better to delay and ship quality than ship a regression.

We'd love early access to the Slack connector beta. We've been waiting for this feature since August and have 3 workflows ready to migrate from Zapier as soon as it's available.

Also curious: our weekly 25,000-row report export has been failing for the past week (HPLT-892). Is this related to the same issue or a separate bug? Our team has been running manual exports in batches.

Sandra Lee
VP Engineering, GlobalTech Solutions`,
          timestamp: '2025-12-12T15:30:00Z',
        },
        {
          from: EMP.PMRelease,
          to: ['customer:cust-globaltech-solutions'],
          body: `Sandra,

Thanks for the note. I'll enable the Slack connector beta for GlobalTech today — you'll see it in your workspace within an hour.

The export issue (HPLT-892) is a separate bug from the authentication issue. It affects exports with row counts divisible by 1,000 (your 25,000-row report hits this exactly). Engineering has a fix in production by December 15. You'll be notified when it's deployed and can resume your normal export schedule then.

I've noted your 3 Zapier workflows to migrate — happy to schedule a session with our integrations team to help you move those over once the Slack connector is GA.

Carlos`,
          timestamp: '2025-12-12T16:15:00Z',
        },
      ],
    },

    // Thread 3: Internal SRE hiring approval (Dec 10)
    {
      threadId: 'thread-sre-hiring',
      subject: 'Approved: 2 SRE headcount additions — posting JDs this week',
      emails: [
        {
          from: EMP.CTO,
          to: [EMP.DevOpsLead, EMP.CEO, 'emp-440'],
          subject: 'Re: Engineering Velocity — SRE team capacity',
          body: `Hi team,

Following the Sprint 8 retrospective and the pattern of incidents pulling engineers off sprint work, I've reviewed the SRE team capacity and I'm approving 2 additional SRE hires effective immediately.

Background: Our current SRE team runs a 3-person on-call rotation. This is burnout territory — each person is on-call every 10 days in addition to sprint work. The November incidents (INC-058, INC-068, INC-076) consumed 28 person-days of unplanned work. With 5 people on rotation, each engineer would be on-call every 17 days, which is sustainable.

Elena, please draft JDs by Friday December 12. I'll approve headcount in Workday today. Target start dates: Q1 2026 (both roles).

Requirements for the JDs:
- Strong Kubernetes and Prometheus/Grafana experience
- Incident response experience at scale (>1M req/day)
- Go or Python (we don't require both)
- On-call experience and willingness to be in rotation

Sarah`,
          timestamp: '2025-12-10T14:00:00Z',
        },
        {
          from: EMP.DevOpsLead,
          to: [EMP.CTO],
          body: `Sarah,

Thank you. This will make a real difference.

JDs will be drafted by Friday. I'll post to LinkedIn, Wellfound, and our internal referral network. Given the market, I'd suggest we also consider contractors initially to cover the on-call gap while we hire — I have 2 contractors who have worked with us before and could start within 2 weeks.

Should I also budget for on-call compensation? Our current policy is $200/week on-call stipend. I'd like to increase this to $300 to be competitive with what I'm seeing at similar-stage companies.

Elena`,
          timestamp: '2025-12-10T15:00:00Z',
        },
      ],
    },
  ];

  return threads;
}

const FILLER_SUBJECTS = [
  // Engineering
  'Q4 Engineering Retrospective — Action Items',
  'Sprint 9 Planning Notes',
  'Jira ticket assigned to you: {jiraId}',
  'PR #{n} needs your review',
  'Deployment to production — {service} v{version}',
  'Incident INC-{n} — Post-mortem assigned',
  'Atlas milestone update — {milestone}',
  'Engineering blog post draft — please review',
  'Code freeze reminder — 48 hours',
  'Architecture RFC: {milestone} — please review before Thursday',
  'Load test results for {service} — action items',
  'Dependency vulnerability scan — 3 critical CVEs',
  'On-call rotation update for December',
  'Kubernetes cluster upgrade — scheduled for January 12',
  'API versioning proposal — v4 migration timeline',
  'Database schema migration plan for Q1',
  'Performance regression in {service} — needs investigation',
  'CI/CD pipeline improvements — proposed changes',
  'Tech debt sprint Q1 2026 — nominations needed',
  'Go 1.23 upgrade — migration guide and timeline',
  // Product
  'Q4 Roadmap Review — Priorities for Q1 2026',
  'Product roadmap update — please review before all-hands',
  'User research synthesis: Enterprise discovery interviews',
  'Feature flag rollout plan — {milestone}',
  'New feature spec: {milestone} — feedback requested',
  'OKR check-in — Q4 midpoint',
  'Beta program invitation: {milestone} for {company}',
  'Connect Marketplace v2 — launch plan',
  'Competitor feature comparison — Atlas vs. competitors',
  'Pricing model review — Q1 changes',
  // Sales & Customer Success
  'QBR prep for {company} — December',
  'Contract renewal reminder: {company} renews in 14 days',
  'New customer onboarding — {company}',
  'Feature request from {company}: bulk export improvements',
  'Executive sponsor program — {company} CTO introduction',
  'Customer NPS Survey Results — November 2025',
  'Expansion opportunity: {company} — new use case identified',
  'Renewal at risk: {company} — health score 42',
  'New logo win: {company} signed — kickoff scheduled',
  'Deal update: {company} — moving to procurement review',
  'Sales forecast update — Q4 week 11',
  'Pipeline review: 3 deals slipping to Q1',
  'Sales Engineering request: {company} technical POC',
  'Customer reference request: {company} for Gartner',
  'Success story: {company} — 10x workflow volume in 90 days',
  // Finance & Legal
  'Board deck review — Q4 metrics draft',
  'Budget forecast for Q1 2026 engineering headcount',
  'Q4 Finance close — action items for department heads',
  'Annual audit preparation — evidence due January 10',
  'Vendor contract renewal: {service} — terms review',
  'Legal review requested: {company} enterprise agreement',
  'DPA addendum for {company} — GDPR compliance',
  'Board materials — Q4 business review',
  'Equity refresh grants — approval needed',
  'Invoice approval needed: {service} subscription renewal',
  // HR & Operations
  'Performance review cycle starts January 6 — manager guide',
  'Intern application review — Q1 2026 cohort',
  'Open headcount approvals — Q1 planning',
  'Benefits renewal 2026 — please review and elect by December 20',
  'New hire onboarding this week — {milestone}',
  'Team offsite planning — Q1 2026 date selection',
  'Workplace policy update — remote work guidelines 2026',
  'Engineering org announcement — team changes effective January 1',
  'Referral bonus: someone joined from your referral — thank you',
  'Parental leave policy update — effective January 1',
  // Security & Compliance
  'SOC 2 Type II audit preparation — action items',
  'Quarterly Security Review — Summary',
  'Penetration test results — remediation plan',
  'HGRD-234: Policy engine security fix — disclosure timeline',
  'Security training completion reminder — due December 31',
  'Access review: quarterly IAM cleanup due',
  'Vulnerability disclosure: {service} dependency — patch required',
  // General
  'All-hands recap — December 5',
  'Holiday schedule confirmed — December 25-26, January 1',
  'Company all-hands: Q4 results and 2026 preview — January 15',
  'Congratulations: {milestone}',
  'Thank you note: team recognition',
];

const FILLER_BODIES = [
  // Engineering
  'I wanted to follow up on our discussion from last week. As discussed, we need to prioritize the auth service fix before the release gate review. The team has capacity to complete this sprint. Please let me know if you have any concerns.',
  'Quick update on the situation: the team has made progress on the identified issues. The engineering team expects a fix by end of week. I\'ve updated the Jira ticket with the latest status. No customer-impacting changes until the fix is validated in staging.',
  'I\'ve reviewed the architecture proposal and have a few concerns about the database migration approach. Specifically: (1) The rollback plan doesn\'t cover partial migration failures, (2) The connection pool configuration seems undersized for the expected load. Can we discuss before the RFC is approved?',
  'Security scan results are in. 3 critical CVEs identified in our dependencies: one in the JWT library (patch available), one in the Redis client (no patch yet, workaround available), one in the PDF rendering library (fix available). Please update your service\'s dependencies this sprint.',
  'Reminder: code freeze is in 48 hours. All PRs must be reviewed and merged before then. If your PR won\'t make it, flag it for the next release. We won\'t be accepting late additions except for critical security fixes.',
  'Load test results are attached. p99 latency on the workflow execution API improved from 2,200ms to 380ms after the CTE index change. We\'re now comfortably within SLO at peak load (1,000 concurrent workflows). The memory footprint also dropped 28%.',
  'The deployment went smoothly — no incidents. Rollback plan was in place but not needed. All health checks passing. I\'ll monitor overnight and send a summary tomorrow morning if anything comes up.',
  'PR review feedback: the approach is solid but I have one concern about the mutex release pattern on lines 247-261. The release needs to happen in a defer statement, not in the error handler, otherwise it won\'t execute if the function returns early without an error. Please update before merging.',
  'The CI pipeline is failing on the integration tests. Root cause: the test database seed script has a race condition when running in parallel. I\'ve filed HPLT-911 and have a fix ready. Will unblock the deploy by tomorrow morning.',
  'On-call handoff notes for this week: (1) Keep an eye on the analytics aggregation job — it\'s been timing out for customers with >500 active workflows. Workaround is to increase the timeout, but we need the root cause fix from HPLT-903. (2) PR #847 still needs a second reviewer. (3) Acme Corp on heightened watch until December 16.',
  // Product
  'Following up on the action items from yesterday\'s all-hands. I\'ve attached the slide deck with the Q4 metrics for your review. Key highlights: ARR grew 18% YoY, churn rate 3.2% (below the 4% target), and customer NPS improved from 41 to 47.',
  'User research synthesis is attached. Key findings from 12 enterprise discovery calls: (1) IT procurement blockers — 8 of 12 prospects require SSO before they can purchase; (2) Bulk operations — editing or deleting many workflows is tedious; (3) Audit log — too much noise, customers want filtering by user/action type. Feeding directly into Q1 roadmap.',
  'Beta invitation sent to 5 customers for the Connect Marketplace. GlobalTech Solutions, QuantumLeap AI, and Nexigen Pharma have accepted. Acme Corp and TechVision are on hold until the P1 tickets are resolved. Will schedule kickoff calls for the three confirmed.',
  'Q1 OKR check-in: we\'re tracking against 3 of 5 key results. KR3 (SSO GA by January 31) is at risk — Atlas is 42% complete and needs to hit 85% by year-end for us to hit the date. Recommending a focused sprint on auth module extraction in Sprint 9.',
  // Sales & CS
  'QBR prep for this account: key talking points are (1) demonstrate value delivered (847 workflows automated, 3-hour daily manual work eliminated), (2) review the outstanding P1 issues and fix timeline, (3) present the Q1 roadmap including SSO and the Slack connector, and (4) discuss expansion potential in the Finance team. I\'ve attached the health score report and usage analytics.',
  'Renewal at risk — I\'d recommend an executive sponsor call before December 20. The customer has two open P1 tickets and experienced the overnight outage last week. Their health score dropped from 67 to 42 in the past 30 days. I\'ve drafted a save plan including a 15% credit and early access to the 3.2 features.',
  'The customer pilot is going well. They\'ve successfully onboarded 50 users and run their first 200 workflows. Initial feedback: the UI is "much cleaner than Zapier" and they love the audit log. One request: they want a Jira integration — already on our Q1 roadmap.',
  'I closed the expansion deal. Additional 200 seats, $84K ACV. Total contract now $204K. The key differentiator was the audit log and SOC 2 compliance report — their InfoSec team had reviewed 3 competitors and we were the only one with both. Invoice sent for counter-signature.',
  'Pipeline update: 3 deals are slipping to Q1. All three are waiting for the Release 3.2 Slack connector (GA December 29). Two have verbally committed; one is evaluating a Zapier alternative. Recommending we offer the Slack connector beta to accelerate the timeline for the at-risk deal.',
  // Finance & Legal
  'The post-mortem review is scheduled for Thursday at 2 PM PST. Please read the draft document I\'ve shared and come prepared with questions. We want to identify the root cause, corrective actions, and preventive measures.',
  'Q4 finance close: I need department heads to submit final expense reports and any outstanding POs by December 19. The audit team is requesting payroll records and equity documentation. Please make sure all approvals are in Workday by EOD Thursday.',
  'The legal team has reviewed the enterprise agreement. Key redlines: (1) data retention clause extended to 7 years (we agreed to 5 — legal says no); (2) the IP ownership clause needs clarification on customer-generated data; (3) indemnification cap is being pushed to 2x ACV (we have 1x in standard contract). Recommending a call with their legal team before December 20.',
  'Vendor contract renewal: the rate increased 23%. I\'ve contacted their account team requesting a 3-year lock at current pricing. If they won\'t budge, I\'ve identified two alternatives we can evaluate in Q1. Need your sign-off on the negotiation approach.',
  // HR & Ops
  'Performance review cycle starts January 6. Managers: please schedule 1:1 review sessions with your direct reports before January 20. Self-review instructions are in Lattice. Remember: ratings should be calibrated across your team before submission — I\'ll hold calibration sessions in the week of January 13.',
  'Open headcount for Q1: Engineering is approved for 5 new hires (2 SREs, 2 senior engineers, 1 staff engineer). Sales approved for 3 AEs. CS approved for 2 CSMs. All JDs should be posted by January 7. Please align on leveling with your HR partner before posting.',
  'Company all-hands is January 15 at 1 PM PST. Agenda: Q4 results, 2026 roadmap preview, team awards, and Q&A with leadership. Please submit questions in advance via the all-hands Slack channel. All hands will be recorded and shared within 24 hours.',
  'Holiday coverage plan: December 25-26 company closed. December 27-31 skeleton crew only. Engineering on-call rotation adjusted — see the PagerDuty schedule. Customer success will have two CSMs available for P1 escalations during this period. Sales will be fully OOO December 25-January 1.',
];

export function generateEmails(employees, customers, jiraIssues) {
  const scenarioThreads = buildScenarioThreads(employees, customers);
  const emails = [];
  let emailN = 1;

  // Add scenario thread emails
  for (const thread of scenarioThreads) {
    for (const msg of thread.emails) {
      emails.push({
        id: `email-${String(emailN).padStart(4,'0')}`,
        from: msg.from,
        fromDisplay: msg.customerContact || null,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        cc: msg.cc || [],
        bcc: msg.bcc || [],
        subject: msg.subject || thread.subject,
        body: msg.body,
        threadId: thread.threadId,
        timestamp: msg.timestamp,
        labels: ['inbox'],
        isCustomerThread: msg.from.startsWith('customer:'),
        relatedJiraId: null,
      });
      emailN++;
    }
  }

  // Generate filler threads — target 5500+ total emails
  const SERVICES = ['platform-api', 'auth-service', 'analytics-pipeline', 'connect-hub', 'guard-core', 'platform-worker', 'connect-marketplace'];
  const MILESTONES = ['auth module extracted', 'Q1 2026 planning', 'Atlas M2 complete', 'SSO GA launch', 'Kronos beta launch', 'Atlas auth module', 'Connect Marketplace v2', 'Release 3.2 shipped'];
  const fillerThreadCount = 920;
  for (let t = 0; t < fillerThreadCount; t++) {
    const threadId = `thread-${String(t + scenarioThreads.length + 1).padStart(4,'0')}`;
    const threadLength = faker.number.int({min:2,max:9});
    const isCustomerThread = faker.datatype.boolean(0.28);
    const customer = isCustomerThread && customers.length ? faker.helpers.arrayElement(customers) : null;
    const jira = faker.datatype.boolean(0.4) && jiraIssues.length ? faker.helpers.arrayElement(jiraIssues) : null;
    const subjectTemplate = faker.helpers.arrayElement(FILLER_SUBJECTS);
    const subject = subjectTemplate
      .replace('{jiraId}', jira?.id || 'HPLT-' + faker.number.int({min:800,max:999}))
      .replace('{n}', String(faker.number.int({min:800,max:950})))
      .replace('{service}', faker.helpers.arrayElement(SERVICES))
      .replace('{version}', faker.system.semver())
      .replace('{milestone}', faker.helpers.arrayElement(MILESTONES))
      .replace('{company}', customer?.name || faker.helpers.arrayElement(['TechCorp Inc', 'Meridian Systems', 'GlobalEdge Solutions', 'ProData Analytics', 'CloudFirst LLC']));
    const baseTime = faker.date.between({from:'2025-01-01',to:'2025-12-14'});

    for (let i = 0; i < threadLength; i++) {
      const from = isCustomerThread && i % 3 === 0 && customer?.contacts?.length
        ? `customer:${customer.id}`
        : faker.helpers.arrayElement(employees).id;
      emails.push({
        id: `email-${String(emailN).padStart(5,'0')}`,
        from,
        fromDisplay: null,
        to: [faker.helpers.arrayElement(employees).id],
        cc: faker.datatype.boolean(0.3) ? [faker.helpers.arrayElement(employees).id] : [],
        bcc: [],
        subject: i === 0 ? subject : `Re: ${subject}`,
        body: faker.helpers.arrayElement(FILLER_BODIES),
        threadId,
        timestamp: new Date(baseTime.getTime() + i * faker.number.int({min:1800000,max:86400000})).toISOString(),
        labels: ['inbox', ...(faker.datatype.boolean(0.2) ? ['important'] : [])],
        isCustomerThread: from.startsWith('customer:'),
        relatedJiraId: jira?.id || null,
      });
      emailN++;
    }
  }

  return emails;
}
