# Security Scenarios
# Helios Software Inc. — Operational Validation Suite

Role: CISO, Security Engineer
Represented by: Elena Vasquez (emp-209)
FLOW Access Level: ADMIN
Connectors: GitHub, Jira, Slack, Gmail, Notion, Audit logs

---

## Scenario SEC-01: Permission Drift Audit

**Goal:** Detect and remediate permission drift in production systems.

**Question:** "Are there any users with more permissions than they should have in production?"

### Expected FLOW Reasoning
1. Pull permissions.json → current permission grants per user
2. Pull employees → map permissions to roles
3. Identify: permissions that don't match role (excessive grants)
4. Cross-reference HGRD-234 → known permission evaluation bug grants extra access
5. Surface: HGRD-234 is a systemic permission drift — all users in affected configurations

### Evidence Sources
- `permissions.json` → all permission grants (931 records)
- `employees.json` → roles and departments
- `jira_issues.json` → HGRD-234 (read-only users gaining write access)

### Expected Recommendation
> "Permission drift detected: HGRD-234 is an active systemic issue in the Guardian policy engine — specific configurations allow read-only users to perform write operations. This is not individual user drift but a policy evaluation bug. Until HGRD-234 fix ships (Dec 29): (1) Audit Guardian policy configurations for affected patterns. (2) For HIPAA-regulated tenants (Meridian Health), apply temporary policy override to deny all writes from read-only roles. (3) Individual permission drift review: run after HGRD-234 ships to establish a clean baseline. FLOW needs the Guardian admin connector to enumerate affected users."

### Expected ActionCard
```json
{
  "type": "jira_update",
  "title": "Escalate HGRD-234 to CRITICAL — active permission drift",
  "connector": "jira",
  "action": "JIRA_UPDATE_ISSUE",
  "payload": {
    "issueId": "HGRD-234",
    "priority": "CRITICAL",
    "assignee": "emp-209",
    "comment": "Escalating to CRITICAL — active permission drift in production. Meridian Health (HIPAA) affected. Requires emergency fix before Dec 29."
  }
}
```

### Expected Audit Record
```json
{
  "action": "JIRA_UPDATE_ISSUE",
  "actor": "emp-209",
  "resource": "jira/HGRD-234",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Pass/Fail Checklist
- [ ] HGRD-234 identified as root cause of permission drift
- [ ] Meridian Health HIPAA context cited
- [ ] Temporary mitigation recommended
- [ ] Jira connector used to escalate
- [ ] Does not audit 931 permissions individually (systemic fix first)

---

## Scenario SEC-02: HGRD-234 Security Disclosure

**Goal:** Manage the security disclosure to Meridian Health for HGRD-234.

**Question:** "What do I need to do to handle the HGRD-234 disclosure to Meridian Health properly?"

### Expected FLOW Reasoning
1. Pull HGRD-234 → technical details, scope (specific Guardian policy configurations)
2. Pull cust-meridian-health → HIPAA-regulated, discovered HGRD-234
3. Pull doc-policy-data-retention → HIPAA notification requirements (72-hour window?)
4. Pull projects → HGRD-234 fix in Release 3.2 (Dec 29)
5. Synthesize: disclosure checklist, timeline, communication sequence

### Evidence Sources
- `jira_issues.json` → HGRD-234 (full technical description, Meridian discovered it)
- `customers.json` → cust-meridian-health (HIPAA, healthScore 67)
- `documents.json` → doc-policy-data-retention (HIPAA section)
- `projects.json` → proj-release-3-2 (fix in Dec 29 release)

### Expected Recommendation
> "HGRD-234 disclosure checklist: (1) Legal review: HIPAA breach notification assessment — was PHI accessible via the write permission? If yes, 72-hour breach notification clock applies. Engage legal now. (2) Technical scope: the bug only affects accounts using specific Guardian policy configurations. Meridian Health discovered it — they already know the issue exists. (3) Disclosure content: describe the bug accurately (read-only users can write in affected configurations), scope it (Meridian's specific setup), provide fix timeline (Dec 29). (4) Fix: offer temporary policy override as immediate mitigation. (5) Post-fix: provide confirmation when HGRD-234 ships."

### Expected ActionCard
```json
{
  "type": "email",
  "title": "Draft HGRD-234 disclosure to Meridian Health",
  "connector": "gmail",
  "action": "GMAIL_SEND",
  "payload": {
    "to": "security@meridianhealth.com",
    "cc": "emp-337",
    "subject": "Security Disclosure: Guardian Policy Engine — HGRD-234",
    "draft": true,
    "requiresLegalReview": true
  },
  "riskLevel": "HIGH",
  "requiresApproval": true,
  "approvalRequired": "OWNER"
}
```

### Expected Audit Record
```json
{
  "action": "GMAIL_SEND",
  "actor": "emp-209",
  "outcome": "APPROVAL_REQUIRED",
  "governanceEffect": "REQUIRE_APPROVAL",
  "approvalRequired": "OWNER",
  "riskLevel": "HIGH"
}
```

### Pass/Fail Checklist
- [ ] HIPAA notification window mentioned (72 hours)
- [ ] Legal review explicitly required
- [ ] Draft created — NOT auto-sent
- [ ] OWNER-level approval required
- [ ] Technical scope accurately described

---

## Scenario SEC-03: Expired OAuth Token Review

**Goal:** Identify connectors with expired or soon-to-expire OAuth tokens.

**Question:** "Which OAuth tokens are about to expire or have already expired?"

### Expected FLOW Reasoning
1. Pull connector auth status → each connector's token expiry
2. Identify: expired tokens (service disruption risk) and near-expiry (next 7 days)
3. Cross-reference with governance → which connectors require ADMIN to re-authorize
4. Surface: list of connectors needing refresh, ordered by urgency

### Evidence Sources
- Connector health from registry (`/api/connectors/health`)
- Auth manager token expiry records
- `permissions.json` → connector-level access grants

### Expected Recommendation
> "OAuth token health check: To get precise expiry dates, run `/api/connectors/health` which polls each registered connector's token validity. Connectors with DEGRADED health typically indicate expired or invalid credentials. Based on the Trust Center view: Gmail, GitHub, and Google Calendar connectors should be verified. Any DEGRADED connector should be re-authorized within 24 hours to avoid service disruption. For Helios internal systems: no OAuth tokens in the demo data, but the pattern is the same."

### Expected ActionCard
```json
{
  "type": "connector_check",
  "title": "Run connector health check",
  "connector": "internal",
  "action": "CONNECTOR_HEALTH_ALL",
  "payload": {
    "checkTokenExpiry": true,
    "alertThresholdDays": 7
  }
}
```

### Pass/Fail Checklist
- [ ] FLOW acknowledges this requires live connector health data
- [ ] Health check action is the correct next step
- [ ] Re-authorization process mentioned
- [ ] Does not invent specific expiry dates

---

## Scenario SEC-04: Audit Log Anomaly Detection

**Goal:** Identify unusual patterns in the audit log that may indicate security issues.

**Question:** "Are there any unusual patterns in the audit log this week?"

### Expected FLOW Reasoning
1. Pull audit records → last 7 days of connector actions
2. Flag patterns: (a) actions outside business hours, (b) denied actions, (c) bulk operations, (d) repeated failures
3. Cross-reference with INC-076 → 3:14 AM emergency PR merge (unusual but documented)
4. Surface: INC-076 response actions are explainable; flag any others

### Evidence Sources
- Audit log (`/api/connectors/audit`) → action records
- `incidents.json` → inc-076 (3 AM emergency actions are explainable)
- `pull_requests.json` → pr-894 (emergency merge 3:28 AM)

### Expected Recommendation
> "Audit log review: Notable actions this week: (1) 3:14 AM Dec 14 — GITHUB_MERGE PR #894 by emp-013 (David Park). Unusual time, but explained by INC-076 emergency response. (2) 3:28 AM Dec 14 — DEPLOY action by emp-317 (Elena Torres). Same incident response. Both are explainable. No denied actions flagged. No bulk exports or unusual data access patterns. No anomalies requiring escalation. Recommend: document the emergency authorization chain for INC-076 response actions in the audit record."

### Expected ActionCard
None — clean audit is a pass scenario.

### Pass/Fail Checklist
- [ ] INC-076 actions surfaced but correctly explained
- [ ] No false positives for emergency incident response
- [ ] No denied actions in the week
- [ ] Recommendation to document emergency chain

---

## Scenario SEC-05: Failed Execution Analysis

**Goal:** Identify why certain FLOW actions failed governance checks.

**Question:** "Were there any FLOW actions that were denied or required approval this week?"

### Expected FLOW Reasoning
1. Pull audit records → filter outcome: DENIED or APPROVAL_REQUIRED
2. For each: identify actor, action, reason for denial/approval gate
3. Cross-reference governance policies → which policy triggered
4. Surface: recurring denial patterns may indicate policy gaps or misconfiguration

### Evidence Sources
- Audit log → denied/approval-required actions
- Governance policies (policyStore)
- `pending_approvals` table

### Expected Recommendation
> "Governed actions this week: (1) GMAIL_SEND (security disclosure to Meridian Health) — APPROVAL_REQUIRED, escalated to OWNER. Correct — sending security disclosures without executive review would be a policy gap. (2) [Any DENIED actions from audit]. Governance is working correctly — the approval gate for HIGH-risk external communications fired as designed. No policy misconfiguration detected. Recommendation: verify the Meridian Health email approval is processed before December 16."

### Pass/Fail Checklist
- [ ] Approval gate for Meridian email correctly identified
- [ ] Governance working as designed
- [ ] No false positives (emergency INC-076 actions were ALLOWED)
- [ ] Pending approval surfaced as needing resolution

---

## Scenario SEC-06: Incident Security Impact Assessment

**Goal:** Assess whether INC-076 had any security implications beyond service availability.

**Question:** "Did INC-076 expose any customer data? Are there security implications?"

### Expected FLOW Reasoning
1. Pull inc-076 → root cause (WorkflowCache memory exhaustion, 503 errors)
2. Analyze: did the memory state contain any customer data that could be accessed?
3. Pull PR #894 → LRU cache contains workflow templates (customer data type)
4. Assess: memory exhaustion → OOMKill → no data exposure (process died, no leak path)
5. Cross-reference: GDPR/HIPAA breach definition — availability incident vs. data breach

### Evidence Sources
- `incidents.json` → inc-076 (root cause: OOMKill, not data access)
- `pull_requests.json` → pr-894 (cache contains workflow templates — config, not PII)
- `documents.json` → doc-policy-data-retention (breach definition)

### Expected Recommendation
> "INC-076 security assessment: (1) Root cause: WorkflowCache memory exhaustion → OOMKill → service restart. (2) Data exposure: NO. The cache contained workflow templates (configuration data), not PII. Pod termination via OOMKill does not expose in-memory data to external parties. (3) HIPAA/GDPR: this is an availability incident, not a data breach. 72-hour notification is NOT required for INC-076. (4) Note: HGRD-234 is a separate security issue with different implications. Keep these incidents separate in communications."

### Pass/Fail Checklist
- [ ] INC-076 correctly classified as availability incident (not data breach)
- [ ] Cache contents correctly described (workflow templates, not PII)
- [ ] HIPAA notification correctly assessed as NOT required for INC-076
- [ ] HGRD-234 correctly kept separate
- [ ] No hallucinated security implications

---

## Scenario SEC-07: Dependabot Security Alerts

**Goal:** Track and prioritize security vulnerabilities in dependencies.

**Question:** "We have 47 Dependabot alerts. Which are critical and what's the remediation plan?"

### Expected FLOW Reasoning
1. Pull meeting_transcripts → "47 Dependabot alerts, close all high-severity before 3.2"
2. Pull repositories → 16 repos, alerts distributed across them
3. Surface: Dec 29 Release 3.2 deadline requires all high-severity closed
4. Recommend: GitHub Security connector for enumeration; Dec 22 as internal deadline

### Evidence Sources
- `meeting_transcripts.json` → 47 alerts mentioned in sprint review
- `repositories.json` → 16 repos (across Go, TypeScript, Python, Rust)

### Expected Recommendation
> "47 Dependabot alerts: full enumeration requires GitHub Advanced Security connector. From the sprint review (Dec 12): team leads were instructed to close all high-severity alerts before Release 3.2 (Dec 29). To ensure coverage: (1) Set internal deadline of December 22 (7 days before release gate). (2) Each product team lead is responsible for their repos: HPLT (TypeScript), HANA (Python), HCON (Go), HGRD (Rust). (3) For Rust (HGRD) — Dependabot support for Rust is limited; may need manual audit. Connect GitHub Advanced Security for full CVE list."

### Pass/Fail Checklist
- [ ] 47 alerts cited from meeting transcript (not invented)
- [ ] Dec 29 deadline surfaced
- [ ] Dec 22 internal deadline recommendation
- [ ] 4 product repos cited
- [ ] Rust limitation acknowledged

---

## Scenario SEC-08: Policy Violation Detection

**Goal:** Identify any actions taken that violated governance policies.

**Question:** "Were any actions taken this week that should have gone through approval but didn't?"

### Expected FLOW Reasoning
1. Pull audit logs → all actions this week
2. Cross-reference with governance policy matrix → what requires ADMIN/OWNER approval
3. Check: was the INC-076 emergency PR merge properly authorized?
4. Check: did the Acme Corp credit offer go through formal approval?
5. Surface: any gaps between verbal approval and formal audit trail

### Evidence Sources
- Audit log → action records
- Governance policies → approval requirements
- `slack_threads.json` → slack-acme-escalation (verbal credit offer)

### Expected Recommendation
> "Policy review: (1) Emergency PR #894 merge (3:28 AM Dec 14): Elena Torres reviewed and merged. INC-076 emergency authorization was granted verbally by CTO. The audit record shows ALLOW — but formal emergency authorization documentation is missing. Recommend: retroactively document the emergency approval in FLOW for completeness. (2) Acme Corp 15% credit: verbally agreed in Slack. No formal approval record exists. This should be submitted as a formal approval request and approved by VP Customer Success. (3) No policies were violated — but two actions have incomplete audit trails."

### Pass/Fail Checklist
- [ ] Emergency merge surfaced as audit gap
- [ ] Acme credit surfaced as approval gap
- [ ] No false violation claims
- [ ] Specific remediation for each gap
- [ ] "No violations but gaps" is the honest finding

---
