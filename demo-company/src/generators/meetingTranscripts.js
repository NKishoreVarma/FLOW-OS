/**
 * Meeting transcripts generator — real conversation content with decisions.
 * No lorem ipsum. Key scenario meetings have full named transcripts.
 */
import faker from '../faker.js';
import { EMP, INC, JIRA, PROJ } from '../scenarios.js';

const HIGH_VALUE = ['sprint-review','executive','customer','incident-review','all-hands','architecture-review','product-review'];

// ── Real decisions by meeting type ─────────────────────────────────────────────
const DECISIONS = {
  'sprint-review': [
    'Approved carryover of 4 stories into next sprint — all are Release 3.2 gate blockers',
    'Decided to add 15% sprint capacity buffer for stabilization work starting Sprint 9',
    'Approved removing David Park from on-call rotation — focus on Atlas and PR reviews',
    'Agreed to hold feature complete freeze for Sprint 10 — no new features until Release 3.2 ships',
  ],
  executive: [
    'Approved 2 additional SRE headcount (Q1 2026 start) — headcount entered in Workday',
    'Decided to delay Release 3.2 from December 15 to December 29 — quality over schedule',
    'Approved 15% December credit for Acme Corp — CFO sign-off received',
    'Decision: CTO will join the December 16 Acme Corp engineering call',
    'Agreed: Atlas Q1 2026 GA target — no scope reduction, add buffer for auth complexity',
    'Approved Q1 2026 roadmap: Atlas (March 31), Apollo beta (April 30), Titan SSO (January 31)',
  ],
  customer: [
    'Committed to HPLT-892 fix in production by December 15',
    'Committed to HPLT-847 fix in production by December 12-13',
    'Offered Kronos analytics beta and 15% December credit to Acme Corp',
    'Agreed to send INC-076 incident report to Acme Corp by December 16',
    'Customer agreed to proceed with renewal discussion after December 16 call',
  ],
  'incident-review': [
    'Agreed: add load testing with 15,000-template dataset to all deployments',
    'Decided: memory usage alert threshold lowered from 85% to 70%',
    'Approved: PR review checklist to flag removal of safety limits (max_entries, pool sizes)',
    'Agreed: WorkflowCache max entries configurable via environment variable (not hardcoded)',
    'Decision: post-mortem template updated to include "scale testing" section',
  ],
  'architecture-review': [
    'Approved RFC-0041: CQRS + Event Sourcing for Atlas workflow engine',
    'Deferred RFC-0038 (Ares API gateway) to Q1 2026 — Atlas is higher priority',
    'Decided: auth-service will use gRPC (not REST) for internal service-to-service communication',
    'Agreed: WorkflowCache extracted to separate module with configurable backend (in-memory or Redis)',
    'Approved: OpenTelemetry as the standard distributed tracing library across all services',
  ],
  'product-review': [
    'Approved Q3 roadmap with Atlas GA, Apollo enterprise tier, Kronos analytics in scope',
    'Decided: Slack connector will ship in Release 3.2 behind a feature flag (not default-on)',
    'Agreed: user research findings will inform Q1 roadmap — top 3 pain points prioritized',
    'Deferred: GraphQL API to H2 2026 — REST API v3 to be completed first',
  ],
  'all-hands': [
    'Announced: 2 SRE hires approved — engineering team growing to 247 by Q1 2026',
    'Announced: Release 3.2 delayed to December 29 — explained quality-first commitment',
    'Announced: Q4 ARR grew 18% YoY, on track for $60M ARR target',
    'Announced: Acme Corp renewal in progress — critical for Q4 close',
  ],
};

const ACTION_ITEMS = {
  review: ['Review and merge PR #847 (auth fix)', 'Update sprint board with carryover stories', 'Schedule post-mortem for INC-076', 'Send Release 3.2 delay notification to enterprise customers'],
  executive: ['Post SRE JDs by December 12 (Elena Torres)', 'Get CFO approval for Acme credit (Michael Santos)', 'Prepare Acme Corp call talking points (James Wilks)', 'Approve Q1 2026 headcount in Workday (CEO)'],
  engineering: ['Complete HPLT-892 fix by December 12', 'Get second review on PR #847 today', 'Run full regression suite by December 16', 'Update architecture runbook for WorkflowCache behavior'],
  customer: ['Send INC-076 incident report to Acme Corp (Priya Nair)', 'Enable Kronos beta for Acme Corp (Engineering)', 'Follow up on Pinnacle Logistics renewal (James Wilks)', 'Schedule Meridian Health security disclosure call (Elena Vasquez)'],
};

// ── Scenario-specific transcript content ──────────────────────────────────────
function buildScenarioContent(eventTitle, employees) {
  const david = employees.find(e => e.id === EMP.StaffEng1);
  const priya = employees.find(e => e.id === EMP.StaffEng2);
  const sarah = employees.find(e => e.id === EMP.CTO);
  const michael = employees.find(e => e.id === EMP.VPSuccess);
  const james = employees.find(e => e.id === EMP.CSM1);
  const elena = employees.find(e => e.id === EMP.DevOpsLead);
  const carlos = employees.find(e => e.id === EMP.PMRelease);
  const jordan = employees.find(e => e.id === EMP.VPProduct);

  const n = (emp) => emp?.name || 'Team Member';

  if (eventTitle?.toLowerCase().includes('sprint 8 retro') || eventTitle?.toLowerCase().includes('sprint review')) {
    return `${n(sarah)}: Let's start with the sprint summary. We completed 19 out of 31 story points — that's a 62% completion rate. Our target is 85%. This is the third consecutive sprint below target and we need to understand why.

${n(david)}: From the Platform team side: PR review time is the main issue. I have 7 PRs in my queue right now. The average time from PR open to first review has gone from 18 hours to 31 hours since October. I'm the primary reviewer for auth service and workflow engine code and I've been in on-call rotation for 3 consecutive weeks. I can't do both at the same quality level.

${n(priya)}: SRE team: we were pulled into 3 P1 incidents in November. That's 28 person-days of unplanned work. In week 3 of November, we had zero planned sprint capacity left by Wednesday. The incidents are both a cause of low velocity and a consequence — when we don't have capacity for proactive reliability work, we get more incidents.

${n(carlos)}: Product side: we had 19% of sprint capacity consumed by unplanned Release 3.2 stabilization tickets. That's higher than any previous sprint. As we get closer to release, the stabilization tax grows.

${n(sarah)}: Okay, three things I want to decide today. First: David, I'm pulling you off on-call rotation starting next week. Elena takes primary on-call. Second: we're adding a 15% sprint buffer for stabilization work in Sprint 9 — that's built into the capacity plan, not "extra" work. Third: I'm approving two additional SRE headcount. Elena, I need JDs by Friday.

${n(elena)}: Agreed. I'll have JDs done by Friday. I also want to flag Project Nexus — the internal runbook system — as a way to reduce on-call cognitive load. If we can get good runbooks in place, on-call time per incident drops significantly.

${n(sarah)}: Approved. Add it to Sprint 9. What are we carrying over?

${n(carlos)}: Four stories: HPLT-847, HPLT-892, HGRD-234, and the QA regression suite completion. All four are Release 3.2 gate blockers.

${n(sarah)}: Those go at the top of Sprint 9. Everything else is lower priority.`;
  }

  if (eventTitle?.toLowerCase().includes('inc-076') || eventTitle?.toLowerCase().includes('post-mortem')) {
    return `${n(priya)}: I'll run through the timeline. At 2:47 AM on December 14, PagerDuty fired: Platform API memory 94%, error rate 100% on /api/v3/workflows. I acknowledged and started investigation. All pods were showing 95%+ memory usage simultaneously.

${n(david)}: I was paged as secondary responder. When I looked at the logs, the pattern was clear — all pods were at high memory and growing. They'd been deployed at 6:30 PM the day before, so they'd been running 8 hours. My first hypothesis was a memory leak introduced in v3.1.9.

${n(priya)}: At 3:10 AM David identified the root cause: WorkflowCache.populate() in the workflow execution engine had no eviction policy. For Acme Corp — who has 12,400 workflow templates — the cache grows to fill the entire heap within 8 hours of a pod restart.

${n(elena)}: I did a rolling restart as immediate mitigation. Error rate dropped from 100% to 0% as pods restarted. This bought us time to build a proper fix.

${n(david)}: I wrote PR #894: add LRU eviction to WorkflowCache. Max 5,000 entries, 15-minute TTL, configurable via environment variables. Elena reviewed it at 3:28 AM and it was deployed as v3.1.9-p1 by 3:31 AM.

${n(priya)}: Service fully restored 3:34 AM. MTTR 47 minutes. Affected customers: Acme Corp (847 failed executions, highest impact), Meridian Health (123), GlobalTech (67).

${n(sarah)}: Why didn't we catch this in testing?

${n(david)}: Our load test dataset has 500 workflow templates. Acme Corp has 12,400. We never tested with customer-realistic data volume.

${n(sarah)}: That changes now. What's the action item?

${n(priya)}: Kenji is adding a load test with a 15,000-template dataset. That will catch this class of issue going forward.

${n(sarah)}: Memory alerts at 70% — not 85%. That's the other thing. We had 15 minutes of warning before the OOMKill but the alert didn't fire until 85%. That's too late.

${n(elena)}: I've already changed it to 70%. Done yesterday morning.

${n(sarah)}: Good. What else?

${n(david)}: I want to do a codebase audit for other unbounded caches. WorkflowCache is the one we found but it might not be the only one. I'll block time in Sprint 9.

${n(sarah)}: Please. And the code review checklist — we should require reviewers to explicitly flag removal of safety limits like max_entries or pool sizes. The PR that introduced this bug removed a configuration check and nobody asked "why is this limit being removed?"`;
  }

  if (eventTitle?.toLowerCase().includes('acme') || eventTitle?.toLowerCase().includes('customer call')) {
    return `${n(sarah)}: Good morning, Marcus. Thank you for making time. I wanted to join today personally to address the issues your team has been experiencing.

Marcus Webb (Acme Corp): Thanks Sarah. I'll be honest — we've been frustrated. Two P1 tickets open for 6-8 days is not what we expect from an enterprise platform. And the overnight outage on December 14 made things worse.

${n(james)}: Marcus, I wanted to start by showing you where we are today on both issues.

${n(david)}: Hi Marcus — I'm David Park, Staff Engineer. I worked on both fixes. On HPLT-892 (data export): the fix is deployed in production as of December 15. I can demonstrate it right now — we have a test export running with 50,000 rows. [shows screen] You can see it's completing successfully. The root cause was an off-by-one error in the pagination cursor that caused it to loop forever when the row count was divisible by 1,000. Your nightly export is 50,000 rows — exactly divisible by 1,000 — so it hit this every time.

Marcus Webb (Acme Corp): So our nightly export tonight will work?

${n(david)}: Yes. You can run it now if you'd like to verify.

Lisa Park (Acme Corp VP Engineering): What about the auth issue? Our 9 AM login spike is when we see most of the failures.

${n(david)}: HPLT-847 (auth timeout) — the fix was merged to the release branch on December 13. It's in production now. The root cause was a mutex that wasn't properly released during concurrent token refresh requests. Your 9 AM spike has 1,200 users all refreshing tokens within a few minutes. The old code could deadlock. The new code uses a defer statement that guarantees the mutex releases regardless of what happens.

${n(sarah)}: Marcus, I want to address the December 14 incident directly. The memory issue that caused 47 minutes of downtime was a separate bug from the auth issue — a different change in the same deployment. We resolved it in 47 minutes (inside our P1 SLA). The fix is permanent. Priya, do you want to walk through the root cause?

${n(priya)}: The root cause was a workflow template cache with no eviction policy. For accounts with many templates like Acme Corp, the cache would fill all available memory within 8 hours of a pod restart. The fix adds an LRU eviction policy. It's been in production since 3:31 AM December 14. We've sent you the full incident report.

Marcus Webb (Acme Corp): Okay. I appreciate the transparency. What I need to know is: are there any other known issues like these sitting in the backlog that could affect us before December 28?

${n(sarah)}: No other P1 or P0 issues affecting enterprise accounts. We have a clear release gate for 3.2 (December 29) and I can share the complete ticket list. There are no unresolved production issues affecting your environment.

${n(james)}: And as we mentioned, we'd like to offer you early access to Kronos — our new analytics engine — which should address the dashboard load time you've experienced.`;
  }

  return null;
}

const GENERIC_TRANSCRIPT_LINES = [
  'We need to prioritize the auth fix before any other release gate items.',
  'Can we get an ETA on the data export fix? Customers are asking.',
  'The QA team found two critical failures in the regression suite. We need to address them before we can open the release gate.',
  'I want to make sure we\'re tracking the Acme Corp renewal closely. This is our largest renewal in Q4.',
  'On the engineering velocity topic: we need to reduce PR review latency. 31 hours average is too high.',
  'The INC-076 post-mortem action items are all assigned. I want a status update next sprint.',
  'Atlas is at 42% — we\'re on track for Q1 2026 if we stay focused on the auth module extraction.',
  'I\'d recommend we add the Slack connector to the 3.2 release behind a feature flag. Low risk, high customer value.',
  'The Meridian Health disclosure needs to happen this week. We can\'t wait any longer on the HGRD-234 communication.',
  'Security scan results: 47 Dependabot alerts. Team leads, please close all high-severity ones before 3.2 ships.',
  'Project Kronos is ahead of schedule on the query performance target — 8ms for 1-year lookback, under the 10ms goal.',
  'Connect Marketplace is at 88% complete. Revenue sharing billing is the last piece. Targeting December 31.',
  'I want to thank the on-call team for the fast response to INC-076. 47-minute MTTR on a P1 at 3 AM is excellent work.',
  'The new SRE headcount is approved. Elena, please post the JDs this week.',
  'Regarding Project Apollo: we need to start the SOC 2 Type II observation period by January to hit the Q2 GA target.',
  'The bulk workflow editor feature is tested and ready. It\'s in the 3.2 release branch and waiting for the release gate to clear.',
  'User research synthesis: the top 3 pain points are SSO not supported, bulk operations are tedious, and audit log is too noisy. These are all in the roadmap.',
  'On the retention policy: all audit logs now retained 3 years per our SOC 2 requirements. This was updated in the policy last September.',
  'I want to flag that QuantumLeap AI announced a Series A. Alex Rivera has expressed interest in expanding to enterprise tier.',
  'The Guardian 2.0 policy engine fix is in review. We expect it in production by December 20, which clears the last 3.2 release gate item.',
];

export function generateMeetingTranscripts(calendarEvents, employees) {
  const high  = calendarEvents.filter(e => HIGH_VALUE.includes(e.type));
  const low   = calendarEvents.filter(e => !HIGH_VALUE.includes(e.type));
  const selected = [...high, ...faker.helpers.arrayElements(low, Math.max(0, 150 - high.length))].slice(0, 150);

  return selected.map(event => {
    const parts = (event.attendees || []).slice(0, 5).filter(Boolean);
    const participantEmps = parts.map(id => employees.find(e => e.id === id)).filter(Boolean);

    // Try to get scenario content for key meetings
    const scenarioContent = buildScenarioContent(event.title, employees);

    let content;
    if (scenarioContent) {
      content = scenarioContent;
    } else {
      // Generate realistic transcript lines using real employee names
      const lines = faker.helpers.shuffle(
        participantEmps.flatMap(emp => {
          const topicLines = faker.helpers.arrayElements(GENERIC_TRANSCRIPT_LINES, faker.number.int({min:2, max:5}));
          return topicLines.map(line => `${emp.name}: ${line}`);
        })
      );
      content = lines.join('\n\n');
    }

    // Decisions by meeting type
    const decisionPool = DECISIONS[event.type] || DECISIONS['sprint-review'];
    const decisions = faker.helpers.arrayElements(decisionPool, faker.number.int({min:1, max:Math.min(3, decisionPool.length)}));

    // Action items
    const actionPool = Object.values(ACTION_ITEMS).flat();
    const actionItems = Array.from({length: faker.number.int({min:2, max:5})}, () => {
      const owner = faker.helpers.arrayElement(employees);
      return {
        owner: owner.id,
        text: faker.helpers.arrayElement(actionPool),
        dueDate: faker.date.soon({days:14}).toISOString().split('T')[0],
      };
    });

    const summary = scenarioContent
      ? `Meeting covered key decisions: ${decisions[0]}. Action items assigned to engineering and product leads. Full transcript available.`
      : `Meeting covered ${event.type} topics. ${decisions.length} decisions made. ${actionItems.length} action items assigned. Key topics: engineering velocity, customer health, and release readiness.`;

    return {
      id: `transcript-${event.id}`,
      eventId: event.id,
      content,
      participants: parts,
      summary,
      decisions,
      actionItems,
    };
  });
}
