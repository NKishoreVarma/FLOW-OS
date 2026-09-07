# FLOW OS — Pilot Operations Runbook

> For the workspace admin (ops/IT person). Covers daily checks, connector maintenance, user management, approvals, and escalation.

---

## Daily Checklist (5 minutes)

Every morning, before your team's standup:

1. Open FLOW → the Morning Briefing should load in under 3 seconds.
2. Go to `/integrations` → all connected tools should show a green "Healthy" badge.
3. Check the bell icon (top right) for new approval requests.
4. Glance at `/chief` — if there are CRITICAL items, action them before standup.

**If anything is red:** follow the "Connection expired" procedure below. Most connector issues resolve with a one-click re-authorize.

---

## Connection Management

### A connector shows "Degraded" or "Error"

1. Go to `/integrations`.
2. Find the connector showing the error.
3. Click **Reconnect** (or **Re-authorize** for OAuth connectors).
4. You will be redirected to the provider's login screen.
5. Sign in with the shared service account (not your personal account).
6. Return to `/integrations` — the connector should now show green.

**Affected connectors:** Gmail, Google Calendar, GitHub, Notion, Jira

**Common causes:**
- OAuth tokens expire every 30–90 days depending on the provider
- Password change on the service account revokes all OAuth tokens
- GitHub PATs expire if created with an expiry date

**If reconnect doesn't work:**
- For GitHub: generate a new PAT at `github.com/settings/tokens` with scopes: `repo, read:user, read:org`
- For Gmail/Calendar: re-run the OAuth flow from `/integrations` → Google → "Connect"
- For Jira: re-run the Composio OAuth flow

---

### Check what FLOW has access to

Go to `/settings/permissions`. This shows:
- Which repositories, email labels, calendars, and Jira projects FLOW can see
- Resources that have been hidden from FLOW (shown grayed out)

To restrict access: find a resource → toggle "Allowed" to off → Save. FLOW will stop indexing that resource within 1 hour.

To expand access: toggle a resource on. FLOW will index it on the next sync (usually within 6 hours).

---

## User Management

### Invite a new team member

1. Go to `/settings/team`.
2. Click **Invite member**.
3. Enter their work email and select their role:
   - **Member** — can use FLOW for search, meetings, inbox, council queries
   - **Admin** — can also manage connectors and approve HIGH-risk actions
   - **Owner** — full control including governance policies and billing
4. Click **Send invite**.
5. A temporary password will appear — share it with them directly (no email delivery).
6. Ask them to change their password after first login.

### Remove a team member

1. Go to `/settings/team`.
2. Find the member's row.
3. Click **Remove**.
4. Confirm. Their FLOW access is revoked immediately and all their active sessions end.

**Note:** Removing a user from FLOW does not affect their access to the underlying tools (GitHub, Gmail, etc.). FLOW access and tool access are independent.

### Change a team member's role

1. Go to `/settings/team`.
2. Click the role dropdown next to the member's name.
3. Select the new role.
4. Save.

Role changes take effect on their next page load.

---

## Approvals

### When an action needs approval

FLOW follows a risk-tiered approval model:

| Risk level | Required approval |
|-----------|-------------------|
| LOW | Auto-executed (no approval needed) |
| MEDIUM | The requester confirms before executing |
| HIGH | One ADMIN or OWNER approves |
| CRITICAL | Two separate ADMINs or OWNERs approve |

When an action requires your approval:
1. You receive a notification in FLOW (bell icon, top right).
2. Click the notification to open the approval request.
3. Read what the action will do — this is always shown exactly before you approve.
4. Click **Approve** or **Reject**.
5. Approved actions execute immediately and appear in `/activity`.

**You cannot approve your own HIGH or CRITICAL risk requests.** This is by design.

### Find all pending approvals

Go to `/inbox` and click the "Approvals" filter, or go directly to `/settings/audit`. All pending approvals are listed with their requester, action description, risk level, and expiry time.

Approvals expire after 48 hours if not acted on.

---

## Data Freshness

### When did FLOW last sync?

FLOW syncs from each connected tool on the following schedule:
- **GitHub:** every 6 hours (or manually via `/api/engineering/sync`)
- **Gmail:** real-time (Gmail Push notifications) + 6-hour full sync
- **Google Calendar:** real-time (watch notifications) + 6-hour full sync
- **Jira:** every 6 hours via Composio

To check last sync time: `/settings/health` shows the timestamp for each connector's last successful sync.

### Force a sync

If you need FLOW to immediately pick up recent changes:

```
# Using the Admin Operations panel
Go to /admin/ops → Connectors → [Connector Name] → Sync Now
```

Or via API (requires ADMIN JWT):
```bash
# GitHub sync
curl -X POST /api/engineering/sync \
  -H "Authorization: Bearer [your-jwt]" \
  -H "workspace-id: [your-workspace-id]" \
  -d '{"owner":"your-org","repo":"your-repo","limit":50}'

# Gmail sync
curl -X POST /api/communication/sync \
  -H "Authorization: Bearer [your-jwt]" \
  -H "workspace-id: [your-workspace-id]" \
  -d '{"limit":100}'

# Calendar sync
curl -X POST /api/meetings/sync \
  -H "Authorization: Bearer [your-jwt]" \
  -H "workspace-id: [your-workspace-id]" \
  -d '{"days":7}'
```

---

## Troubleshooting

### Morning Briefing is blank

1. Wait 60 seconds and hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).
2. Check connector status at `/integrations` — are any showing Degraded?
3. If all connectors are green: go to `/admin/ops` → "Refresh Intelligence" — this rebuilds the Workspace Intelligence Cache.
4. If still blank after 5 minutes: check `/settings/health` for the last successful sync timestamp. If older than 24 hours, force a sync.

### FLOW gave a wrong or outdated answer

FLOW can only know what's in its connected tools. Common causes of wrong answers:

1. **The information is in a tool that isn't connected.** FLOW doesn't know about Confluence if Confluence isn't connected.
2. **The sync hasn't run yet.** A PR merged 30 minutes ago may not be in FLOW yet — force a sync.
3. **The information was marked private.** If an email label or repo was hidden in `/settings/permissions`, FLOW won't include it.
4. **It's a genuine AI error.** Click "This is wrong" (thumbs down on the response) — this feeds back to improve FLOW's answers.

### A team member says they can't see their data

1. Check their role at `/settings/team` — Members have full access to query FLOW.
2. Check if the relevant connector is connected at `/integrations`.
3. Check `/settings/permissions` — the specific repository/label/calendar needs to be allowed.

### An action failed

1. Check `/activity` for the error message (shown in red on the failed action row).
2. Most common causes:
   - Expired OAuth token → reconnect the connector
   - Insufficient permissions → the service account needs write access to that tool
   - The resource doesn't exist → the PR/ticket was already closed or merged

---

## Chief of Staff

Go to `/chief`. This is your most actionable view:

- **NOW** — the top 5 things that need attention right now, sorted by urgency
- **TODAY** — items to address before end of day
- **WATCH** — items to monitor (no immediate action required)

Each card shows a risk badge (LOW/MEDIUM/HIGH/CRITICAL). Cards with HIGH or CRITICAL badges will require approval from another admin.

**How to use the Chief of Staff effectively:**
- Open `/chief` at the start of your day instead of checking Slack and email separately
- Complete at least one action every day — FLOW learns which action types you prefer
- Dismiss items that aren't relevant — this tells FLOW to stop surfacing that type

---

## Weekly Review

Go to `/review` every Monday morning. The review shows:

- **Time saved** — measured from execution_records (not estimated)
- **Execution success rate** — what % of FLOW-initiated actions succeeded
- **Engineering velocity** — PRs merged, deployments this week vs. last week
- **Top risks** — AI predictions ranked by probability × impact
- **Recommended priorities** — the top 3 things to focus on this week

**If execution success rate drops below 80%:** Go to `/activity`, filter by "Failed", and look for patterns. Usually a connector token has expired or permissions changed.

---

## Audit & Compliance

All FLOW actions are permanently logged. To access:

- **Full audit log:** `/settings/audit` — filterable by user, action type, risk level, date
- **Connector-specific audit:** `/settings/integrations` → click any connector → "View audit"
- **Activity feed:** `/activity` — real-time stream of FLOW events

The audit log is append-only. No FLOW action can be hidden or deleted from the audit log.

For SOC 2 or internal compliance reviews: export the audit log at `/settings/audit` → "Export CSV" and filter by the relevant date range.

---

## Governance & Policies

### What are governance policies?

Policies control what FLOW is allowed to do autonomously. By default, FLOW uses a conservative role-based policy:
- Members can request any action but HIGH/CRITICAL require admin approval
- Admins can approve HIGH risk actions
- Two owners must approve CRITICAL actions

### Create a custom policy

Go to `/settings/governance` → "New policy". You can:
- Require approval for specific action types (e.g., always require approval for PR merges, even if LOW risk)
- Restrict certain actions to specific roles (e.g., only OWNERs can merge to main)
- Block certain actions entirely (e.g., never allow email sends to external domains)

Custom policies override the default role matrix for the conditions you specify.

---

## Escalation

| Severity | Description | Response target | Who to contact |
|----------|-------------|-----------------|----------------|
| P1 | FLOW completely inaccessible | < 1 hour | On-call engineer (paged automatically) |
| P2 | Major feature broken (briefing, approvals, or connectors) | < 4 hours | Submit ticket via `/help` |
| P3 | Minor issue or data question | < 24 hours | Submit ticket via `/help` |
| P4 | Feature request or feedback | < 48 hours | Submit via `/help` |

**For P1:** If you can access `/health` — share the response JSON with support. If the server is unreachable — contact your IT admin to check the infrastructure health first, then reach out to the FLOW team.

**Before escalating:** always note what page you were on, what you clicked, what you expected, and what happened instead. A screenshot helps.

---

## What the FLOW team monitors

The FLOW team watches a live operational dashboard that shows:
- Server health (CPU, memory, database connections)
- Error rate across all API endpoints
- WebSocket connection count
- Queue depth (background jobs)
- Connector sync success rates

You do not need to send manual status reports. The team is automatically alerted when error rates spike or health checks fail.

If you notice something before the team does: use `/help` → "Report urgent issue."
