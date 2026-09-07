# FLOW OS — Product Metrics
**Document:** GOV-12  
**Status:** Mandatory  
**Applies to:** All product decisions, pilot evaluations, and quarterly reviews  
**Last updated:** 2026-07-18

---

## Overview

This document defines the metrics that matter for FLOW. Metrics are not reporting tools — they are decision-making tools. Every metric exists to answer a specific question. If a metric does not answer a question that changes behavior, it is removed.

All metrics are measured from real data. Estimated values are labeled as estimates and disclosed as such (as in the Success Dashboard's hybrid ROI model).

---

## 1. North Star Metric

**Minutes from open to decisions handled**

> The time between a user opening FLOW and taking action on the three most important items in their workspace.

**Target (Pilot):** ≤ 25 minutes  
**Target (Production):** ≤ 10 minutes  
**Measurement:** 
- T1: User session start timestamp (first API call after auth)
- T2: Third `ExecutionRecord` with status `EXECUTED` in the session
- North Star = T2 − T1

If T2 does not occur within the session, the session does not count toward the North Star.

This is the metric that matters above all others. If the North Star is trending up, something is wrong in the product — regardless of what other metrics say.

---

## 2. Activation Metrics

These measure whether a new user or workspace gets real value quickly.

| Metric | Definition | Target |
|---|---|---|
| Time to first action | Minutes from account creation to first `ExecutionRecord EXECUTED` | ≤ 30 min (pilot) |
| Time to value | Minutes from account creation to completing the onboarding flow | ≤ 15 min |
| Connectors connected on day 1 | Average number of connectors authenticated in the first session | ≥ 2 |
| Resources permitted on day 1 | Average number of Trust Center resources set to ALLOWED | ≥ 5 |
| First Brain conversation | Percentage of users who ask FLOW a question within first 7 days | ≥ 80% |
| Onboarding completion rate | Percentage of workspaces that complete all 5 onboarding steps | ≥ 90% |

**Source:** `src/onboarding/` onboarding state, `src/success/successMetrics.js`, `execution_records`, `pending_approvals`

---

## 3. Retention Metrics

These measure whether FLOW becomes a daily habit.

| Metric | Definition | Target |
|---|---|---|
| D7 retention | % of workspaces with at least one action executed in first 7 days | ≥ 70% |
| D30 retention | % of workspaces active (≥3 actions) in their 30th day | ≥ 50% |
| Weekly active workspaces | Workspaces with ≥1 execution in the past 7 days | Trending up |
| Daily active users | Users with ≥1 FLOW session per day | Trending up |
| Chief of Staff adoption | % of active users who view `/chief` at least 3x/week | ≥ 60% |
| Brain conversation frequency | Average conversations per active user per week | ≥ 5 |

**Source:** `flow_events` session tracking, `execution_records`, onboarding state

---

## 4. Engagement Metrics

These measure how deeply users engage with FLOW's capabilities.

| Metric | Definition | Target |
|---|---|---|
| Actions executed per session | Average number of `execution_records` per user session | ≥ 2 |
| Action acceptance rate | Actions accepted / Actions surfaced (Chief of Staff) | ≥ 40% |
| Approval completion rate | Approvals resolved (approved/rejected) / approvals created | ≥ 85% within 24h |
| Executive Council queries | Uses of `/council` per active workspace per week | ≥ 3 |
| Context switches eliminated | Notifications handled in FLOW / total notifications | ≥ 60% |
| Weekly Review completion | `/review` viewed per week per active workspace | ≥ 1 |

---

## 5. Trust Metrics

Trust is the prerequisite for intelligent behavior. If users do not trust FLOW's permissions, they will not use its intelligence.

| Metric | Definition | Target |
|---|---|---|
| Trust Center setup rate | % of workspaces with ≥1 connector resource explicitly allowed | ≥ 90% (after onboarding) |
| Governance denials | Actions denied by policy / total actions attempted | ≤ 5% (high deny rate means policy misconfiguration) |
| Approval resolution time | Time from approval created to approved/rejected | ≤ 4 hours (median) |
| Privacy shield triggers | `PRIVACY_SHIELD_TRIGGERED` events per 1000 messages | Monitor for spikes |
| Auth errors | 401 responses per 1000 API calls | ≤ 1% |

---

## 6. Execution Quality Metrics

These measure whether FLOW's executed actions are producing correct results.

| Metric | Definition | Target |
|---|---|---|
| Execution success rate | `EXECUTED` / total execution attempts | ≥ 95% |
| Rollback rate | Executions followed by a reversal action within 1h | ≤ 3% |
| Two-person approval usage | CRITICAL actions with 2 distinct approvers / total CRITICAL | 100% (invariant) |
| Automation accuracy | Automated actions not followed by user reversal | ≥ 90% |

**Source:** `execution_records` table

---

## 7. AI Usage Metrics

These measure whether FLOW's AI is useful and trusted.

| Metric | Definition | Target |
|---|---|---|
| Brain response acceptance | Recommended actions clicked / recommendations shown | ≥ 35% |
| Copilot follow-up rate | Conversations with ≥2 turns / total conversations | ≥ 50% |
| Fallback rate | Responses using heuristic fallback / total AI responses | ≤ 15% (monitor for Gemini issues) |
| Evidence panel open rate | Evidence panels expanded / AI responses shown | ≥ 20% |
| Prediction accuracy (proxy) | Predictions where action was taken / predictions surfaced | ≥ 25% |
| AI governance denial rate | AI-suggested actions denied / AI-suggested actions executed | ≤ 10% |

---

## 8. Pilot Metrics

These apply specifically to the initial pilot engagement (Rahul's CTO workspace and any additional pilot orgs).

| Metric | Definition | Pilot target |
|---|---|---|
| Time to Morning Brief value | Minutes from login to reading the morning brief | ≤ 5 min |
| Pilot NPS | Net Promoter Score (0–10 survey) | ≥ 8 |
| Pilot interviews done | Qualitative interviews conducted | ≥ 2/month |
| Friction log entries | Items in DOGFOOD_LOG.md | Reviewed weekly; declining trend |
| Features used without prompting | Features used without an onboarding push | Tracked qualitatively |

---

## 9. Enterprise Metrics

These apply to production multi-tenant deployments.

| Metric | Definition | Target |
|---|---|---|
| Workspace setup time | Time from license provisioned to first active session | ≤ 1 business day |
| User invitation acceptance | Invited users who logged in within 72h | ≥ 75% |
| Admin operations time | Time from admin login to IAM/governance configured | ≤ 30 min |
| Cross-workspace isolation | Incidents of data crossing workspace boundaries | 0 (invariant) |
| Audit log completeness | Actions with audit records / total actions executed | 100% (invariant) |
| Enterprise connector coverage | % of supported connectors connected per workspace | ≥ 3 at 90-day mark |

---

## 10. ROI Metrics (Success Dashboard)

These appear in the Success Dashboard and are disclosed as measured vs. estimated.

| Metric | Type | Measurement |
|---|---|---|
| Executions in FLOW | Measured | `execution_records` count with status EXECUTED |
| Approvals handled | Measured | `pending_approvals` resolved count |
| Notifications processed | Measured | `notifications` count |
| Events processed | Measured | `flow_events` count |
| Time saved (estimated) | Estimated | Execution × 8min + Approval × 12min + Notification × 3min + Event × 2min |
| Context switches eliminated (estimated) | Estimated | Notifications + Approvals handled in FLOW |

Estimated values are disclosed with their basis in the UI. They are never presented as measured values.

---

## Metric Review Cadence

| Cadence | Metrics reviewed |
|---|---|
| Daily (automated) | Health checks, error rates, fallback rates, security alerts |
| Weekly (pilot review) | North Star, activation, engagement, action acceptance rate |
| Monthly (product review) | All retention metrics, pilot NPS, feature adoption, ROI |
| Quarterly (executive review) | Year-over-year retention, enterprise metrics, ARR correlation |

---

## What We Do Not Measure

Deliberately excluded to prevent Goodhart's Law:

- **Total page views.** FLOW is not a content platform. Views without actions mean nothing.
- **Time on site.** A fast resolution is better than a long session.
- **Feature discovery rate.** Discovering a feature matters only if using it drives value.
- **AI response word count.** Shorter responses that drive action are better than long ones.
- **Number of connectors connected.** Connecting 10 connectors with no resources permitted means nothing.
