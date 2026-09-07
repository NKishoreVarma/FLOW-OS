/**
 * Slack threads generator — real conversation content, named scenarios.
 * No lorem ipsum. References real employees, projects, incidents, customers.
 */
import faker from '../faker.js';
import { EMP, INC, JIRA, PROJ, CUST } from '../scenarios.js';

const CHANNELS = ['general','engineering','incidents','product','customer-success','platform-team','analytics-team','security','releases','exec-updates','sre-oncall','code-review','sprint-planning','people-ops','sales','finance','hr','legal','marketing','design','devops','qa'];

// ── Fixed scenario threads (anchored to specific dates/events) ────────────────
function buildScenarioThreads(employees) {
  const emp = (id) => employees.find(e => e.id === id);
  const name = (id) => emp(id)?.name || id;

  return [
    // 1. INC-076: Overnight memory leak incident thread (Dec 14, 2:47 AM)
    {
      id: 'slack-inc-076-main',
      channel: '#incidents',
      topic: `[P1 INC-076] Platform API memory exhaustion — 503 errors on /api/v3/workflows`,
      relatedIncidentId: INC.P1_MEMORY_LEAK,
      messages: [
        { author: EMP.StaffEng2, text: '@channel P1 INCIDENT: Platform API returning 503 on /api/v3/workflows endpoint. Memory usage at 94% on all pods. PagerDuty alert firing. I\'m investigating. Standby.', timestamp: '2025-12-14T02:47:32Z' },
        { author: EMP.DevOpsLead, text: 'On it. Checking Kubernetes dashboard. Pods are about to OOMKill.', timestamp: '2025-12-14T02:49:11Z' },
        { author: EMP.StaffEng2, text: 'kubectl top pods: platform-api-7d4f9b-xxxx shows 3.8/4GB memory. This is every pod simultaneously. Something changed recently.', timestamp: '2025-12-14T02:52:00Z' },
        { author: EMP.StaffEng1, text: 'I\'m awake. Checking the last deployment. v3.1.9 went out yesterday at 6:30 PM. Let me look at what changed in the platform-api worker.', timestamp: '2025-12-14T02:55:22Z' },
        { author: EMP.StaffEng2, text: 'Acme Corp is already hitting us on Slack. 847 failed workflow executions so far. This is critical for their renewal.', timestamp: '2025-12-14T02:57:00Z' },
        { author: EMP.StaffEng1, text: `Found it. WorkflowCache.populate() in v3.1.9 has no eviction policy. For customers with many workflow templates (Acme has 12,400), it fills the entire heap. This explains why it started failing 8 hours after deployment — the cache filled up overnight.`, timestamp: '2025-12-14T03:10:00Z' },
        { author: EMP.DevOpsLead, text: 'Immediate mitigation: rolling restart of all pods to clear memory. Starting now. This buys us time to get a hotfix out.', timestamp: '2025-12-14T03:12:00Z' },
        { author: EMP.StaffEng2, text: 'Error rate dropping: 100% → 78% → 42% → 8% as pods restart. Good, mitigation working.', timestamp: '2025-12-14T03:15:00Z' },
        { author: EMP.StaffEng1, text: 'PR #894 up. Fix: add LRU eviction policy to WorkflowCache (max 5K entries, 15min TTL). @elena.torres can you emergency review? This needs to go to prod tonight.', timestamp: '2025-12-14T03:20:00Z' },
        { author: EMP.DevOpsLead, text: 'Reviewing now. Looks good. LRU logic is correct. Tests pass. LGTM. Merging.', timestamp: '2025-12-14T03:27:00Z' },
        { author: EMP.DevOpsLead, text: 'PR #894 merged. Deploying v3.1.9-p1. 3 minutes.', timestamp: '2025-12-14T03:28:00Z' },
        { author: EMP.StaffEng2, text: 'v3.1.9-p1 deployed. Memory usage stabilizing at 28-31% across all pods. Error rate 0%. We\'re good. Incident resolved at 3:34 AM. MTTR: 47 minutes. I\'ll write up the post-mortem. Scheduling for December 16.', timestamp: '2025-12-14T03:34:00Z' },
        { author: EMP.StaffEng1, text: 'Great work team. I\'ll send customer notifications to Acme Corp, Meridian, and GlobalTech. @james.wilks heads up on Acme — this happened 2 weeks before their renewal. You\'ll want to reach out first thing in the morning.', timestamp: '2025-12-14T03:40:00Z' },
        { author: EMP.CSM1, text: 'On it. Will call Marcus Webb at Acme Corp at 8 AM. This is bad timing.', timestamp: '2025-12-14T03:41:00Z' },
      ],
    },

    // 2. Release 3.2 delay announcement (Dec 12)
    {
      id: 'slack-release-32-delay',
      channel: '#releases',
      topic: 'Release 3.2 — date change announcement',
      relatedIncidentId: INC.P1_AUTH_REGR,
      messages: [
        { author: EMP.VPProduct, text: `Team update on Release 3.2: we are moving the release date from December 15 to December 29. Here's why: QA found a P1 regression in the auth service during regression testing on December 10 (INC-042). PR #847 has the fix but it's been in review for 4 days. We also have HPLT-892 (data export failing for large datasets) and HGRD-234 (policy engine bug) that must be resolved before we can open the release gate. The 2-week delay ensures we ship with quality. Enterprise customers are being notified by email today.`, timestamp: '2025-12-12T10:00:00Z' },
        { author: EMP.CTO, text: 'Agreed on the delay. Quality over schedule. @david.park can you prioritize PR #847 review today? I know you\'re on-call but this is the critical path.', timestamp: '2025-12-12T10:05:00Z' },
        { author: EMP.StaffEng1, text: 'Yes, will start right now. INC-076 seems stable so I have bandwidth. Should have the review done by EOD.', timestamp: '2025-12-12T10:07:00Z' },
        { author: EMP.PMRelease, text: 'I\'ve updated the release tracker. New go/no-go review is December 22. Post-3.2 retrospective will cover how we improve our pre-release QA process so we don\'t find P1s this late.', timestamp: '2025-12-12T10:12:00Z' },
        { author: EMP.QALead, text: 'QA team is running the full regression suite. Current completion: 78%. 2 critical failures outstanding. We\'ll have full results by December 16.', timestamp: '2025-12-12T10:15:00Z' },
        { author: 'emp-020', text: 'The Slack connector in 3.2 is not blocked by the auth regression, right? We have customers asking about it.', timestamp: '2025-12-12T10:22:00Z' },
        { author: EMP.PMRelease, text: 'Correct — Slack connector is behind a feature flag and not part of the release gate. But it goes out with 3.2 on December 29.', timestamp: '2025-12-12T10:25:00Z' },
        { author: EMP.VPSales, text: 'Just a heads up — 3 enterprise customers have Release 3.2 GA as part of their contract milestones (Acme Corp, GlobalTech, TechVision). We need to proactively reach out to them today with the explanation. The AEs will loop in the customers\' CTOs.', timestamp: '2025-12-12T10:30:00Z' },
        { author: EMP.VPProduct, text: 'Agree. Jordan is drafting the customer email now. It focuses on our quality-first commitment and offers a private beta of the 3.2 features if they want early access.', timestamp: '2025-12-12T10:33:00Z' },
      ],
    },

    // 3. PR #847 stuck in review (Dec 13-14)
    {
      id: 'slack-pr-847-review',
      channel: '#code-review',
      topic: 'PR #847 auth fix needs review — blocking Release 3.2',
      messages: [
        { author: EMP.StaffEng1, text: 'PR #847 needs a second reviewer for auth/token_refresh.go. Changes: fixed mutex release bug and added concurrent-safe refresh logic with backoff. Tests included. This is blocking Release 3.2 — @priya.nair and @marcus.reid please take a look when you get a chance.', timestamp: '2025-12-11T10:00:00Z' },
        { author: EMP.StaffEng2, text: 'On my list. I have the post-mortem for INC-076 this week but I\'ll try to review by Thursday.', timestamp: '2025-12-11T10:15:00Z' },
        { author: EMP.CTO, text: 'This needs to be reviewed by EOD Wednesday December 11. It\'s on the critical path for 3.2. Can someone clear their schedule for 30 minutes today?', timestamp: '2025-12-11T11:00:00Z' },
        { author: EMP.VPEng, text: 'I\'ll take a first pass this afternoon. Give me 2 hours. @david.park can you add inline comments explaining the mutex lifecycle?', timestamp: '2025-12-11T11:05:00Z' },
        { author: EMP.StaffEng1, text: 'Added comments to the PR. The key change is moving the mutex release out of the error handler and into a defer statement so it always releases. The race condition was only possible when token_store.Get() returned without error.', timestamp: '2025-12-11T11:45:00Z' },
        { author: EMP.VPEng, text: 'Review done. Left 3 comments — mostly nits about variable naming and one question about the backoff coefficient. Otherwise LGTM. Need 1 more approval (need 2 total for auth service changes).', timestamp: '2025-12-11T14:30:00Z' },
        { author: EMP.StaffEng1, text: 'Addressed all 3 comments. Backoff is 100ms base * 2^attempt, capped at 10s. Industry standard for token refresh. Ready for second review.', timestamp: '2025-12-11T15:00:00Z' },
        { author: EMP.StaffEng2, text: 'I\'ll review this morning (Dec 13). Should have it done by noon.', timestamp: '2025-12-13T08:30:00Z' },
        { author: EMP.StaffEng2, text: 'Starting review now but I\'ve been pulled into INC-076 prep. David can you pair with someone else? I won\'t be able to finish today.', timestamp: '2025-12-13T14:00:00Z' },
        { author: EMP.StaffEng1, text: 'This PR has been open 4 days. It\'s blocking the release. I\'m going to ask Sarah to assign a dedicated reviewer. We can\'t let this slip another day.', timestamp: '2025-12-13T16:00:00Z' },
        { author: EMP.CTO, text: 'Noted. @emp-015 @emp-016 please drop what you\'re doing and review PR #847 today. This is the highest priority item for the team right now.', timestamp: '2025-12-13T16:05:00Z' },
      ],
    },

    // 4. Acme Corp escalation thread (Dec 11)
    {
      id: 'slack-acme-escalation',
      channel: '#customer-success',
      topic: 'URGENT: Acme Corp escalation — renewal December 28',
      messages: [
        { author: EMP.CSM1, text: `@here URGENT: Marcus Webb (CTO, Acme Corp) just emailed VP Customer Success and CC\'d their CEO. They have two P1 issues that have been open for 6+ days (HPLT-847, HPLT-892). Contract renewal is December 28. Health score is 42. This is at serious risk of churning if we don't act today.`, timestamp: '2025-12-11T09:00:00Z' },
        { author: EMP.VPSuccess, text: 'I saw the email. I\'ve escalated both tickets to P1+ priority with engineering. @david.park is INC-042 (auth regression) going to be fixed before December 28?', timestamp: '2025-12-11T09:05:00Z' },
        { author: EMP.StaffEng1, text: 'PR #847 has the fix. It\'s waiting for a second review. The mitigation (feature flag disabling token caching) means Acme Corp\'s auth is working right now — they\'re not seeing failures unless they hit high concurrency. I\'ll escalate the PR review.', timestamp: '2025-12-11T09:12:00Z' },
        { author: EMP.VPSuccess, text: 'And the data export bug (HPLT-892)? Acme runs 50K-row nightly exports and they\'ve been failing for 8 days.', timestamp: '2025-12-11T09:15:00Z' },
        { author: 'emp-030', text: 'HPLT-892 fix is 80% done. Off-by-one error in the pagination cursor. I expect a PR tomorrow and fix in production by Thursday Dec 14 or Friday Dec 15.', timestamp: '2025-12-11T09:22:00Z' },
        { author: EMP.CSM1, text: 'Thank you. I\'m scheduling a call with Marcus Webb for December 16. I need a clear commitment on fix dates by then — with specific PR numbers and deployment dates. Can someone from Engineering join?', timestamp: '2025-12-11T09:30:00Z' },
        { author: EMP.CTO, text: 'I\'ll join the December 16 call. Let\'s show them the fixes are done or in final stages. What\'s Acme\'s usage situation? Are they fully blocked or just degraded?', timestamp: '2025-12-11T09:35:00Z' },
        { author: EMP.CSM1, text: 'The nightly export (HPLT-892) is fully blocked — they\'re running manual workarounds. Auth (HPLT-847) is intermittent, worst during 9 AM peak when all 1,200 users are logging in. Then last night\'s INC-076 took them down completely for 47 minutes. Their team is frustrated.', timestamp: '2025-12-11T09:40:00Z' },
        { author: EMP.VPProduct, text: 'I\'d suggest offering them early access to the 3.2 batch export feature as a goodwill gesture. Also worth connecting them with our Kronos beta (analytics performance) since they\'ve complained about 45s dashboard loads.', timestamp: '2025-12-11T09:50:00Z' },
        { author: EMP.VPSuccess, text: 'Good idea. I\'m also going to suggest a 15% credit for December given the outages. Let me get CFO approval.', timestamp: '2025-12-11T09:55:00Z' },
      ],
    },

    // 5. Engineering velocity discussion (Dec 10)
    {
      id: 'slack-eng-velocity',
      channel: '#engineering',
      topic: 'Engineering velocity — sprint 8 results and what to do about it',
      messages: [
        { author: EMP.CTO, text: 'Sprint 8 results: 62% completion rate (target: 85%). This is the third consecutive sprint below target. I want to understand what\'s happening. Can leads share their retrospective takeaways in this thread?', timestamp: '2025-12-10T10:00:00Z' },
        { author: EMP.StaffEng1, text: 'Platform team: PR review time is the main bottleneck. Average time from PR open to merge: 31 hours (was 18 hours in October). I\'m the primary reviewer for many PRs and I\'ve been in on-call rotation 3 straight weeks. We need to either pull me off on-call or bring in more senior reviewers. I currently have 7 PRs in my review queue.', timestamp: '2025-12-10T10:15:00Z' },
        { author: EMP.VPEng, text: 'I\'ve been monitoring the PR queue. @david.park has 7 open review requests right now. That\'s a bottleneck. Can we rotate code review ownership? Who else has depth in the auth service and workflow engine?', timestamp: '2025-12-10T10:20:00Z' },
        { author: 'emp-015', text: 'I have some context on the workflow engine. I can take on workflow-related PRs. Auth service is a bit outside my comfort zone but I can do surface-level reviews.', timestamp: '2025-12-10T10:25:00Z' },
        { author: EMP.StaffEng2, text: 'SRE team: we were pulled into 3 P1 incidents in November (INC-058, INC-068, INC-076 precursors). That\'s 28 person-days of unplanned work. We had 0 sprint capacity left in week 3 of November. Need to improve our incident detection to catch issues earlier.', timestamp: '2025-12-10T10:30:00Z' },
        { author: EMP.CTO, text: 'What would it take to reduce on-call burnout? I\'ve been asked about hiring 2 additional SREs. Is that the right lever?', timestamp: '2025-12-10T10:35:00Z' },
        { author: EMP.DevOpsLead, text: 'Yes. With 2 more SREs we could have proper 5-person rotation instead of 3. That would also let us run proactive reliability projects instead of being 100% reactive. I\'d also suggest we invest in better runbook tooling (Project Nexus) so on-call engineers aren\'t context switching.', timestamp: '2025-12-10T10:40:00Z' },
        { author: EMP.PMAtlas, text: 'From the Atlas side: Release 3.2 stabilization work took 19% of our sprint capacity for unplanned bug fixes. We need to budget for "stabilization tax" in every sprint — probably 15-20% buffer.', timestamp: '2025-12-10T10:45:00Z' },
        { author: EMP.CTO, text: 'Decision: (1) David Park comes off on-call rotation effective next week, dedicated to Atlas and critical PR reviews. (2) Elena Torres takes primary on-call. (3) I\'m approving 2 SRE hires — posting JDs today. (4) Sprint 9 will include an explicit 15% buffer for stabilization. Agreed?', timestamp: '2025-12-10T11:00:00Z' },
        { author: EMP.StaffEng1, text: 'Agreed. Thank you Sarah.', timestamp: '2025-12-10T11:02:00Z' },
        { author: EMP.DevOpsLead, text: 'Agreed. Will start on the JDs.', timestamp: '2025-12-10T11:03:00Z' },
      ],
    },

    // 6. Project Atlas status update (Dec 9)
    {
      id: 'slack-atlas-update',
      channel: '#platform-team',
      topic: 'Project Atlas — December status and auth module blocker',
      relatedIncidentId: null,
      messages: [
        { author: EMP.PMAtlas, text: 'Monthly Atlas update: we\'re at 42% completion, which puts us on track for the Q1 2026 GA (March 31). The auth module extraction is the current critical path. David is leading this. There are 3 undocumented behaviors in the legacy auth system we\'re still reverse-engineering.', timestamp: '2025-12-09T11:00:00Z' },
        { author: EMP.StaffEng1, text: 'On the auth extraction: the three undocumented areas are (1) device fingerprinting — there\'s a client-side cookie being set that no one documented and it\'s used by the iOS app, (2) concurrent session limits — the current limit of 5 concurrent sessions isn\'t in any spec but it\'s hardcoded, (3) SAML assertion handling — we have custom attribute mapping logic that was written in 2021 and the original author has left the company.', timestamp: '2025-12-09T11:15:00Z' },
        { author: EMP.VPEng, text: 'Can we schedule a discovery spike for each of those 3 items? Even if we can\'t fully document them, we need to capture the behavior.', timestamp: '2025-12-09T11:20:00Z' },
        { author: EMP.StaffEng1, text: 'I\'d need 2 full sprint days per discovery spike. That\'s 6 days of work. If we start in Sprint 9 (starts Dec 16), we can have all three documented by end of December.', timestamp: '2025-12-09T11:25:00Z' },
        { author: EMP.PMAtlas, text: 'Booked. I\'m adding 3 discovery spike stories to the Atlas backlog. This will also inform the PR #847 fix since the SAML assertion handling is related to the token refresh bug.', timestamp: '2025-12-09T11:30:00Z' },
        { author: EMP.CTO, text: 'Good. Atlas is the most important strategic project we have. Velocity on this determines whether we can sell the $500K+ Enterprise tier in H1 2026. Keep me updated daily on the auth module.', timestamp: '2025-12-09T11:35:00Z' },
      ],
    },

    // 7. SRE on-call handoff (Dec 14, morning)
    {
      id: 'slack-oncall-handoff-dec14',
      channel: '#sre-oncall',
      topic: 'On-call handoff — December 14',
      messages: [
        { author: EMP.StaffEng2, text: 'INC-076 post-mortem: memory pool exhaustion in v3.1.9. Fix deployed (v3.1.9-p1). All systems nominal. Handing off primary on-call to @kenji.watanabe. Key things to watch: (1) Platform API memory usage — should stay <35% with LRU cache in place. We have an alert set at 70%. (2) Acme Corp workflow dashboard — they\'re watching for residual latency. (3) PR #847 still open and needs second review — this is for Release 3.2.', timestamp: '2025-12-14T08:00:00Z' },
        { author: EMP.SRE1, text: 'Got it. I\'ve read the INC-076 timeline. Grafana dashboard looks clean. I\'ll monitor the memory metrics for the first hour. Any Acme-specific alerts I should know about?', timestamp: '2025-12-14T08:05:00Z' },
        { author: EMP.StaffEng2, text: 'No Acme-specific alerts set up yet but James Wilks (CSM) will be calling Marcus Webb (their CTO) at 8 AM. If you see any API errors from their tenant (tenant-id: acme-corp), page me directly even though I\'m off primary.', timestamp: '2025-12-14T08:07:00Z' },
        { author: EMP.CSM1, text: 'Call with Marcus Webb went better than expected. He appreciated the fast response time (47 min MTTR). Still frustrated about the two open P1 tickets but agreed to wait until our December 16 joint engineering call before making any renewal decisions. 🤞', timestamp: '2025-12-14T09:30:00Z' },
        { author: EMP.StaffEng1, text: 'That\'s great news. I\'ll make sure PR #847 is fully reviewed and merged before the December 16 call so we can show concrete progress.', timestamp: '2025-12-14T09:35:00Z' },
      ],
    },

    // 8. Weekly exec update (Dec 13)
    {
      id: 'slack-exec-update-dec13',
      channel: '#exec-updates',
      topic: 'Weekly exec update — December 13, 2025',
      messages: [
        { author: EMP.CEO, text: `Weekly update:\n\n**Engineering**: Release 3.2 pushed to Dec 29 due to P1 auth regression. 3 blocking tickets (HPLT-847, HPLT-892, HGRD-234). Overnight incident (INC-076) resolved in 47 min — good response time. Sprint 8: 62% completion.\n\n**Sales**: $2.1M pipeline closing in Q4. GlobalTech expansion ($120K expansion) signed. Acme Corp renewal ($285K) at risk — CSM and Engineering actively working it.\n\n**Product**: 3.2 delay communicated to enterprise customers. Connect Marketplace targeting Dec 31 launch. Atlas at 42% — Q1 2026 GA on track.\n\n**People**: Approved 2 SRE hires. 3 engineering backfills in pipeline. Holiday schedule confirmed — company closed Dec 25-26, Jan 1.\n\nAction items: @sarah.chen own Acme Corp Dec 16 call. @daniel.wright confirm pipeline status by EOW.`, timestamp: '2025-12-13T18:00:00Z' },
        { author: EMP.CTO, text: 'On the Acme Corp call: I\'ll join December 16 with James Wilks. We\'ll have fixes in-hand or very close. I\'m confident we can retain them if we show the right engineering response.', timestamp: '2025-12-13T18:05:00Z' },
        { author: EMP.VPSales, text: 'Pipeline update: closed $1.4M in Q4 so far. 3 deals (total $700K) pushing to Q1 due to release 3.2 delay. Two of those are waiting for the Slack connector which is in 3.2. We need December 29 to hold.', timestamp: '2025-12-13T18:12:00Z' },
        { author: EMP.VPProduct, text: 'Connect Marketplace is 88% complete. Targeting December 31 hard launch. Revenue sharing billing is the last piece. On track.', timestamp: '2025-12-13T18:15:00Z' },
      ],
    },

    // 9. Q4 sales pipeline review (Dec 11)
    {
      id: 'slack-sales-pipeline-dec11',
      channel: '#sales',
      topic: 'Q4 pipeline review — 3 weeks to close',
      messages: [
        { author: EMP.VPSales, text: 'Q4 pipeline call recap: we have $2.1M in active opportunities. Closed so far: $1.4M. Remaining: $700K across 5 deals. Priority deals this week: (1) GlobalTech expansion ($120K, at legal, targeting Dec 15 close), (2) QuantumLeap AI new logo ($180K, in procurement, targeting Dec 22), (3) Rocketship.io ($95K, technical POC passing, targeting Dec 19). 2 deals ($305K) are slipping to Q1 — both waiting for Release 3.2 Slack connector.', timestamp: '2025-12-11T14:00:00Z' },
        { author: EMP.AE1, text: 'GlobalTech DPA has been sent back with 2 redlines. Legal says turnaround by Dec 13. I\'m scheduling a signature call for Dec 15. Confident we close this week.', timestamp: '2025-12-11T14:10:00Z' },
        { author: 'emp-386', text: 'QuantumLeap AI: their procurement team just asked for a security questionnaire. I\'ve routed to the security team. Fastest I\'ve seen this go is 3 business days. Targeting Dec 19 now to be safe.', timestamp: '2025-12-11T14:15:00Z' },
        { author: EMP.VPSales, text: 'For the 2 deals slipping to Q1 — I\'m proposing we offer them the Slack connector beta access on December 19 so they can start integration before the GA. This might pull them back into Q4. @jordan.kim can we make this happen?', timestamp: '2025-12-11T14:22:00Z' },
        { author: EMP.VPProduct, text: 'Yes — I can set up the Slack connector beta flag for 2 specific tenants. Just send me the customer IDs after your calls and I\'ll enable it.', timestamp: '2025-12-11T14:30:00Z' },
      ],
    },

    // 10. Finance Q4 close preparation (Dec 9)
    {
      id: 'slack-finance-q4-close',
      channel: '#finance',
      topic: 'Q4 finance close — action items for department heads',
      messages: [
        { author: 'emp-003', text: 'Q4 close is December 31. Key dates: all purchase orders must be in Ramp and approved by December 23. Final expense reports submitted by December 20. Any capital purchases >$5,000 need CFO approval by December 18. I\'ll send the detailed checklist to department heads today.', timestamp: '2025-12-09T11:00:00Z' },
        { author: EMP.CEO, text: 'Heads up for all leads: the board wants to see Q4 ARR by January 3. We need the final bookings number before then. Daniel — can you confirm pipeline close dates are realistic for the December 31 deadline?', timestamp: '2025-12-09T11:05:00Z' },
        { author: EMP.VPSales, text: '3 deals closing by December 31 are realistic. 2 are slipping. I\'ll have final numbers by December 29.', timestamp: '2025-12-09T11:10:00Z' },
        { author: 'emp-003', text: 'Also: the auditors are requesting all vendor contracts signed in 2025 to be uploaded to the shared drive by January 8. IT and Legal — please confirm your contracts are documented.', timestamp: '2025-12-09T11:15:00Z' },
        { author: 'emp-440', text: 'IT contracts are current. I\'ll upload the 2025 hardware and SaaS renewals to the drive by December 20.', timestamp: '2025-12-09T11:20:00Z' },
      ],
    },

    // 11. HR performance review prep (Dec 8)
    {
      id: 'slack-hr-perf-review',
      channel: '#hr',
      topic: 'Performance review cycle — manager guide',
      messages: [
        { author: 'emp-007', text: 'Performance review cycle starts January 6. Key dates: self-reviews in Lattice due January 15. Manager review drafts due January 22. Calibration sessions: week of January 13 (I\'ll schedule with each department head). Final ratings submitted to HR by January 29. Comp changes effective February 1 paycheck.\n\nImportant: all managers must complete bias training before starting reviews. Link in the company handbook.', timestamp: '2025-12-08T09:00:00Z' },
        { author: EMP.CTO, text: 'Engineering leads: I\'ll run calibration for the engineering org on January 14. Please have your draft ratings ready the day before. I want to see strong/exceptional ratings backed by specific impact examples, not just "did their job well."', timestamp: '2025-12-08T09:10:00Z' },
        { author: EMP.VPSuccess, text: 'Question: for employees hired after September 1 — are they included in this cycle?', timestamp: '2025-12-08T09:15:00Z' },
        { author: 'emp-007', text: 'Employees hired after September 1 are excluded from this formal cycle. They\'ll get a 90-day check-in with their manager instead. The next cycle for them is mid-year in June 2026.', timestamp: '2025-12-08T09:20:00Z' },
        { author: EMP.VPEng, text: 'Reminder for my team: please document your Q4 impact in your self-review with specific metrics. Completed projects, PRs merged, incidents responded to, customers helped. The more specific the better.', timestamp: '2025-12-08T09:30:00Z' },
      ],
    },

    // 12. Design system migration discussion (Dec 6)
    {
      id: 'slack-design-system',
      channel: '#design',
      topic: 'Design system migration to Figma tokens',
      messages: [
        { author: 'emp-278', text: 'The design system migration is 60% complete. We\'ve moved the color tokens, typography, and spacing to Figma variables. Still outstanding: component library (button, input, table, modal), icon library, and the legacy override styles in the platform dashboard. Target: full migration by January 15.', timestamp: '2025-12-06T10:00:00Z' },
        { author: 'emp-279', text: 'The button component has a dark mode variant that\'s not in Figma yet. I\'ll add it this week — it\'s used in the workflow editor toolbar.', timestamp: '2025-12-06T10:10:00Z' },
        { author: 'emp-015', text: 'On the engineering side: we\'re waiting on the finalized design tokens before we implement the dark mode toggle in the platform. Can you confirm the token naming convention? We want to match Figma token names exactly to avoid mapping tables.', timestamp: '2025-12-06T10:20:00Z' },
        { author: 'emp-278', text: 'Token naming convention: `--color-bg-primary`, `--color-text-primary`, `--color-border-default`, `--color-accent-primary`. I\'ll export the full token spec from Figma as a JSON file for you today.', timestamp: '2025-12-06T10:35:00Z' },
      ],
    },
  ];
}

// ── Filler thread content (real English, no lorem ipsum) ─────────────────────
const THREAD_STARTERS = [
  { channel: 'engineering', text: 'PSA: I found a memory leak in the background task scheduler. Not production-impacting yet but it will cause OOMKills if left for >72 hours. PR up for review.' },
  { channel: 'engineering', text: 'Reminder: code freeze for the 3.2 release branch is December 19. No new features after that date without PM approval.' },
  { channel: 'engineering', text: 'The Go upgrade to 1.23 is ready. I\'ve run the full test suite — 0 failures. Targeting next deployment window (Thursday). Please review the migration notes.' },
  { channel: 'engineering', text: 'API response time p99 has improved 40% since we moved the workflow list query to a CTE with proper indexing. Before: 2,200ms. After: 380ms. Will write this up as a case study.' },
  { channel: 'platform-team', text: 'Sprint 9 planning: we\'re carrying over 4 stories from Sprint 8 (Release 3.2 blockers). I need everyone to cut scope elsewhere to ensure we can close these.' },
  { channel: 'platform-team', text: 'New ticket: HPLT-904 — the workflow trigger endpoint needs rate limiting per-tenant. Acme Corp can fire 10,000 triggers/minute which degrades other tenants. Assigning to myself.' },
  { channel: 'platform-team', text: 'Daily standup notes Dec 14: David unblocked on Atlas auth after overnight INC-076. Marcus reviewing PR #847. Emily on HPLT-892 fix (ETA: tomorrow). Priya writing INC-076 post-mortem.' },
  { channel: 'analytics-team', text: 'Kronos query planner MVP is running in dev. Cold query on 1-year lookback: 8ms (target: <10ms). Hot cache: 1ms. We\'re ahead of schedule on performance.' },
  { channel: 'analytics-team', text: 'A customer (QuantumLeap AI) is using our aggregation API in a way we didn\'t expect — they\'re running 2,000 concurrent aggregations. This is causing queue starvation for other tenants. We need per-tenant aggregation rate limiting.' },
  { channel: 'security', text: 'Monthly security review: 47 Dependabot alerts (3 critical, 12 high). Critical ones assigned to respective teams. Please close all high-severity alerts before Release 3.2.' },
  { channel: 'security', text: 'HGRD-234 (policy engine bug) has been confirmed: custom role users with read-only permissions could perform write operations. Root cause: missing AND clause in permission evaluator SQL. Hotfix in progress. Meridian Health noticed first — we\'ll owe them a security disclosure.' },
  { channel: 'security', text: 'SOC 2 Type II renewal audit is scheduled for January 15-16. Need all teams to have their control evidence ready by January 10. I\'ll send the evidence checklist this week.' },
  { channel: 'customer-success', text: 'QBR scheduled for Q4 top 10 customers. Priority: Acme Corp (high risk, renewal Dec 28), Pinnacle Logistics (renewal Dec 31, low engagement), Meridian Health (HGRD-234 security issue).' },
  { channel: 'customer-success', text: 'QuantumLeap AI announced Series A ($40M). Their CTO Alex Rivera wants to expand to enterprise tier. This is an expansion opportunity — AE Daniel Wright please loop in.' },
  { channel: 'product', text: 'Q1 2026 roadmap is ready for review: (1) Atlas GA (March 31), (2) Apollo enterprise tier beta (April 30), (3) Kronos analytics engine GA (April 30), (4) Titan SSO GA (Jan 31). High-level themes: enterprise readiness, performance, and developer experience.' },
  { channel: 'product', text: 'User research results from the enterprise discovery: top 3 pain points are (1) SSO not supported — blocking IT procurement at 8 enterprise prospects, (2) bulk operations — editing/deleting many workflows is tedious, (3) audit log — too much noise, customers want filtering. These are feeding directly into the roadmap.' },
  { channel: 'releases', text: 'Release 3.2 feature freeze is complete. Features in scope: Bulk workflow editor, Advanced retry policies, Slack connector (flagged). NOT in scope (pushed to 3.3): Connector marketplace v2, Webhook signing.' },
  { channel: 'general', text: 'Welcome to the team @emp-031! Yuna is joining as a Senior Product Manager working on the Connect Marketplace and developer experience. She was previously at Stripe and Twilio.' },
  { channel: 'general', text: 'Company reminder: performance review cycle starts January 6. Please complete self-reviews by January 15. Manager reviews due January 29.' },
  { channel: 'sre-oncall', text: 'On-call reminder: INC-076 post-mortem is December 16 at 2 PM PST. Required attendees: SRE team, David Park, and anyone who touched the v3.1.9 deployment. Please come with timeline notes.' },
  { channel: 'sprint-planning', text: 'Sprint 9 velocity target: 52 story points (same as Sprint 8 planned). But we\'re adding 15% buffer (8 points) for stabilization work. Net: target 44 points of planned work. Carry-over from Sprint 8: 4 stories (18 points).' },
  { channel: 'code-review', text: 'Code review turnaround SLO: < 24 hours for P1 tickets, < 48 hours for regular PRs. Currently we\'re at 31 hours average. Everyone please check your review queue daily.' },
  { channel: 'people-ops', text: 'Holiday office hours: December 25-26 (company closed). December 27 - January 1: skeleton crew. Engineering on-call rotation will be adjusted — check the on-call schedule for your assignments.' },
  // Sales & CS
  { channel: 'sales', text: 'Just closed the GlobalTech expansion — $120K ACV, 200 additional seats. They cited the audit log and SOC 2 report as the deciding factors. Their procurement team moved fast once we got them the security questionnaire.' },
  { channel: 'sales', text: 'QuantumLeap AI is asking about multi-region support — specifically EU data residency for GDPR. Do we have a timeline for this? It\'s the last blocker for their procurement approval.' },
  { channel: 'sales', text: 'Rocketship.io POC update: they\'ve automated 45 workflows in 2 weeks. Their VP Ops said it\'s "the fastest time-to-value we\'ve seen from any SaaS tool." Pushing for a signed contract by December 19.' },
  { channel: 'sales', text: 'Competitive intel: Zapier just announced a new enterprise tier at $2,500/month with unlimited team members. This is their response to losing 3 deals to us this quarter. I\'ve updated the battlecard.' },
  { channel: 'customer-success', text: 'Meridian Health QBR went well despite HGRD-234. They appreciated the security disclosure and the 48-hour response time. They\'ve agreed to renew for 2 years at a 10% rate increase ($200K/year). Signed today.' },
  { channel: 'customer-success', text: 'Pinnacle Logistics engagement report: only 12% of their seats are active (24 of 200). Main blocker: IT team hasn\'t set up SSO yet and their policy requires SSO before they\'ll allow broader rollout. This is the Titan project — we need to prioritize this for them.' },
  { channel: 'customer-success', text: 'CloudNine Retail just submitted a GDPR data access request. We have 30 days to respond. Routing to the legal team now. This is our first formal GDPR request — let\'s make sure the process is documented.' },
  // Marketing
  { channel: 'marketing', text: 'Q4 content calendar: the "Automation ROI" case study with QuantumLeap AI is live on the website. 847 unique views in the first 48 hours. This is our best-performing case study ever. Sales team — feel free to share this in deals.' },
  { channel: 'marketing', text: 'SaaStr conference debrief: we had 340 badge scans and 28 qualified demos. Top questions: (1) How does this compare to Workato? (2) Do you support on-premise deployment? (3) Can it integrate with Salesforce? All three going into the Q1 content roadmap.' },
  { channel: 'marketing', text: 'SEO results: "enterprise workflow automation" is now ranking #4 on Google. Up from #18 in September. Organic traffic to the pricing page is up 63% MoM. The technical content strategy is working.' },
  // Finance
  { channel: 'finance', text: 'Budget vs actual through November: Engineering is 8% under budget (delayed SRE hires). Sales is 4% over (higher-than-expected travel for in-person demos). Marketing is on budget. Overall: company is 3% under budget for 2025. Full close numbers by January 3.' },
  { channel: 'finance', text: 'Insurance renewal is coming up in January. I\'ve gotten 3 quotes for cyber liability. The current premium is $48K/year. Best new quote is $41K with the same coverage. Recommend switching — need CFO sign-off.' },
  { channel: 'finance', text: 'Heads up: the annual software audit identified 12 SaaS tools with zero usage in the past 90 days (total cost: $28,400/year). Scheduling reviews with department heads to cancel unused subscriptions.' },
  // Legal
  { channel: 'legal', text: 'HGRD-234 customer disclosure letters have been sent to all 5 affected customers. No customer reported actual data loss or unauthorized modifications in the 2-hour exposure window. We\'re documenting this for our SOC 2 controls testing.' },
  { channel: 'legal', text: 'New DPA template is ready for review. The updates reflect GDPR Article 28 requirements and the UK GDPR post-Brexit guidelines. All new enterprise contracts should use the updated template effective January 1.' },
  { channel: 'legal', text: 'Patent application filed: "System and method for real-time workflow execution monitoring with causal chain attribution." Application number #2025-884221. This covers our core Synapse engine technology.' },
  // DevOps
  { channel: 'devops', text: 'Kubernetes upgrade to 1.29 completed this morning. Zero-downtime rolling upgrade. All health checks passing. Next up: upgrading the Prometheus operator to support new scrape interval configuration we need for the high-cardinality fix.' },
  { channel: 'devops', text: 'Terraform state migration is complete. All infrastructure is now in the new remote state backend. Removed all local state files. If anyone had local terraform files from before December 1, please delete them to avoid conflicts.' },
  { channel: 'devops', text: 'GitHub Actions runners are hitting disk limits again. I\'ve set up daily cache pruning via a cron job. Also added disk usage alerting at 80%. We won\'t have a repeat of the deployment block from last week.' },
  // QA
  { channel: 'qa', text: 'Release 3.2 regression suite: 94% pass rate (target: 100%). 2 critical failures outstanding — HPLT-847 and HPLT-892. Both assigned and in-flight. Will re-run once fixes are merged. Target: full pass by December 20.' },
  { channel: 'qa', text: 'New end-to-end test added for the data export pagination scenario (the HPLT-892 root cause). Test matrix covers: 1,000 rows, 9,999 rows, 10,000 rows, 50,000 rows across all export formats. This scenario is now permanently in the regression suite.' },
  { channel: 'qa', text: 'Performance test results for the workflow execution API after the CTE index fix: p50 improved 68% (1.4s → 0.45s), p99 improved 83% (8.2s → 1.4s). This meets our SLO targets. Marking HPLT-891 as resolved.' },
  // More engineering
  { channel: 'engineering', text: 'RFC-017 approved: we\'re adopting OpenTelemetry for distributed tracing across all services. Implementation starting Q1 2026. This will give us proper trace propagation and let us correlate logs, metrics, and traces from a single incident timeline.' },
  { channel: 'engineering', text: 'The database connection pool exhaustion is now fixed. Root cause: long-running analytics queries were holding connections during peak hours. Fix: separate read replica connection pool for analytics. Pool metrics now visible in the engineering dashboard.' },
  { channel: 'platform-team', text: 'Atlas update (week of Dec 9): auth module extraction 65% complete. Three undocumented behaviors being reverse-engineered: device fingerprinting (iOS cookie), concurrent session limits (hardcoded at 5), and SAML assertion mapping. Discovery spikes planned for Sprint 9.' },
  { channel: 'analytics-team', text: 'Kronos performance update: cold query on 90-day lookback is now 8ms (target: <10ms). Warm cache: 1ms. We\'re ready to invite 5 customers into the beta. Requesting product to send beta invitations to QuantumLeap AI and GlobalTech.' },
];

const FOLLOWUP_MESSAGES = [
  'On it. Will have an update by end of day.',
  'This is related to the issue I saw last week. Let me check the logs.',
  'Approved. Good catch.',
  'Thanks for the heads up. I\'ll include this in the sprint retro.',
  'Can you link the Jira ticket? Want to track it.',
  '+1. Let\'s add this to the next sprint planning.',
  'The root cause makes sense given what we saw in the November incident.',
  'Good work. I\'ll share this in the exec update.',
  'Agreed. I\'ll update the runbook accordingly.',
  'Is this customer-impacting? If so we should open a P2.',
  'I just reproduced this in staging. Creating a Jira ticket now.',
  'This matches what the customer reported. Good to have the root cause.',
  'Will need a review from the security team before merging.',
  'Happy to pair on this tomorrow morning if helpful.',
  'Updated the PR with your feedback. Ready for re-review.',
  'This is now tracked in HPLT-903. Assigned to the platform team for next sprint.',
  'Confirmed fixed in production. Closing the ticket.',
  'This will be in the weekly customer report. Thanks for documenting it.',
  'Architecture decision needed here — let\'s discuss in the Thursday ADR review.',
  'Anyone else seeing this? I want to understand if it\'s isolated or wider.',
  'Fixed in the hotfix. Deployed 10 minutes ago. Monitoring for stability.',
  'This is a great catch. Let\'s add a regression test for this scenario.',
  'The performance improvement is significant. Let\'s document the query pattern for the team.',
  'Escalated to the engineering lead. Will have a priority response within 2 hours.',
  'Added to the Sprint 9 backlog. We\'ll prioritize based on impact.',
];

export function generateSlackThreads(employees, incidents, jiraIssues, customers) {
  const scenarioThreads = buildScenarioThreads(employees);

  // Generate filler threads with real content — target 1200 total
  const fillerThreads = Array.from({length: 1200 - scenarioThreads.length}, (_, idx) => {
    const i = idx + scenarioThreads.length + 1;
    const starter = faker.helpers.arrayElement(THREAD_STARTERS);
    const channel = starter.channel || faker.helpers.arrayElement(CHANNELS);
    const incident = channel === 'incidents' && incidents.length ? faker.helpers.arrayElement(incidents) : null;
    const jira = faker.datatype.boolean(0.3) && jiraIssues.length ? faker.helpers.arrayElement(jiraIssues) : null;
    const msgCount = faker.number.int({min: 2, max: 8});
    const baseTime = faker.date.between({from: '2025-01-01', to: '2025-12-10'});
    const topic = starter.text;

    return {
      id: `slack-${String(i).padStart(4,'0')}`,
      channel: `#${channel}`,
      messages: [
        {
          author: faker.helpers.arrayElement(employees).id,
          text: topic,
          timestamp: baseTime.toISOString(),
        },
        ...Array.from({length: msgCount - 1}, (_, j) => ({
          author: faker.helpers.arrayElement(employees).id,
          text: faker.helpers.arrayElement(FOLLOWUP_MESSAGES),
          timestamp: new Date(baseTime.getTime() + (j + 1) * faker.number.int({min: 180000, max: 3600000})).toISOString(),
        })),
      ],
      topic,
      relatedIncidentId: incident?.id || null,
      relatedJiraId: jira?.id || null,
    };
  });

  return [
    ...scenarioThreads,
    ...fillerThreads,
  ];
}
