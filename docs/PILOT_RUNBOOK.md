# FLOW OS — Pilot Operations Runbook

**For:** The workspace admin (ops/IT person). No terminal access needed for any of these tasks.

---

## Daily Checklist

1. Open FLOW → check the morning brief loads within a few seconds.
2. Open `/admin/ops` → verify all connections are green.
3. If anything is red, follow the "Connection Expired" procedure below.

---

## Common Procedures

### A connection expired (OAuth token expired)

1. Go to `/admin/ops` → Connections section.
2. Find the connection showing "Needs attention" or "Disconnected".
3. Click **Reconnect**.
4. You will be redirected to the provider's sign-in page.
5. Sign in with the shared service account.
6. You will return to `/admin/ops` automatically.
7. Verify the connection is now green.

**Affected connectors:** Gmail, Google Calendar, GitHub, Notion, Jira.

---

### Invite a new team member

1. Go to `/admin/ops` → Team section.
2. Click **Invite**.
3. Enter their work email and select their role:
   - **Member** — can use FLOW (search, meetings, inbox, council).
   - **Admin** — can also manage connections and approve actions.
4. Click **Send invite**.
5. Share the temporary password shown on screen with the new member.
6. Ask them to change it after first login.

---

### Morning Brief is blank or slow

1. Wait 60 seconds and refresh.
2. If still blank, go to `/admin/ops` → Workspace Health.
3. If any area shows red, reconnect the affected connector.
4. If all connections are green and the brief is still blank, click **Report this** in the error message and notify the FLOW team.

---

### A team member needs to be removed

1. Go to `/admin/ops` → Team section.
2. Find the member's row.
3. Click **Remove**.
4. Confirm. Their access is revoked immediately.

---

### Approving a pending action

When someone requests an action that needs approval:

1. You will receive a notification inside FLOW (bell icon, top right).
2. Click the notification to open the approval request.
3. Review what the action does and click **Approve** or **Reject**.
4. Approved actions execute immediately.

---

### Reporting a problem to the FLOW team

Every error in FLOW shows a **"Report this"** button. Click it. The dev team is notified within 60 seconds.

For urgent issues, also send a message to the FLOW Slack channel with:
- What page you were on
- What you clicked
- What you expected vs. what happened

---

## What the FLOW team monitors

The dev team watches a live pilot dashboard at `/pilot`. It shows:
- Daily active users
- Features being used most
- Errors as they happen
- Feedback submitted via "Report this"

You do not need to send manual status reports.

---

## Escalation

If FLOW is completely inaccessible:

1. Check with your IT team that the server is running.
2. If the server is running, the FLOW team can restart it remotely.
3. Contact the FLOW team with the error shown at `/health`.

---

## Chief of Staff panel

Available at `/chief`. Opens automatically in the sidebar under "Chief of Staff."

The panel shows the most important items right now — approvals, conflicts, risks — with one-click action buttons. Click the primary button on each card to execute the action inside FLOW. A risk badge (LOW/MEDIUM/HIGH/CRITICAL) appears on each button so you know what you're approving before you click.

For HIGH or CRITICAL actions: you will be prompted for approval from an admin. That person will get a notification automatically.

## Weekly Review

Available at `/review`. A structured weekly digest covering:
- Time saved + tasks completed (measured from FLOW records)
- Engineering velocity (PRs merged, deployments)
- Execution success rate
- Operational risks (from AI predictions)
- Recommended priorities

Review this every Monday morning. If "Execution Success Rate" drops below 80%, check the Admin panel for failed executions.
