# Security Intelligence — Solution Specification
## FLOW OS Solutions Library

> **STATUS: DESIGN ONLY**
> Capability layer: Privacy Gate (production) + Governance Engine (Phase 5.3, production) + Audit Persistence (production)

---

## Problem Statement

Mid-market companies sit in the security blind spot: too large to ignore compliance, too small to run a dedicated security operations team. They buy tools — SSO, MDM, vulnerability scanners — but no one is synthesizing the signals. An engineer with admin access leaves, and their API key is still active in 3 production services 90 days later. A contractor is granted temporary access that was never revoked. Nobody knows.

Security information is scattered: IAM logs in AWS, access permissions in GitHub, API key records in Notion, active sessions in Google Workspace. No one is correlating these in real time with organizational context: who left the company, who changed roles, who shouldn't have access based on their current responsibilities.

**FLOW's advantage:** It is already the system that knows who has access to what (via connectors), who should have access (via org graph + role), what has changed (via ingestion pipeline), and what is anomalous (via Incident Engine). Security Intelligence is the layer that makes this actionable for compliance and security teams.

---

## Module Scope

```
Security Intelligence
├── Access Review & Certification    — periodic access review workflows
├── Anomaly Detection                — behavioral anomalies from communication signals
├── Compliance Posture               — SOC2, ISO 27001, GDPR posture from operational data
├── Secrets & Credential Intelligence — detect exposed credentials in operational data
├── Audit Trail Intelligence          — queryable, immutable audit intelligence
└── Incident Response Intelligence   — automated context for security incidents
```

---

## Signature Workflows

### 1. Automated Access Review (User Certification)

**Trigger:** Quarterly scheduled; or on-demand by compliance officer  
**FLOW action:**
- Fan out across all connected systems (GitHub, Jira, Notion, Drive, CRM) to enumerate: who has access to what
- Cross-reference with Org Graph: does this user's current role/department match the access level they have?
- Flag:
  - **Orphaned access:** user left the company but still has active credentials
  - **Role mismatch:** user changed roles but retained previous permissions
  - **Excessive privilege:** user has admin access but has never used admin features in 90 days
  - **Stale access:** user has access but has not used the system in 60+ days
- Generate: Access Review Report with risk-ranked findings
- Workflow: manager reviews each finding → approve (retain) → revoke (execute via connector)

**What no other tool does:** FLOW correlates access with actual usage (from connector activity logs) AND organizational context (role changes from HR system). Most tools only enumerate access — FLOW evaluates whether the access is appropriate given what the person does.

### 2. Anomalous Behavior Detection

**Trigger:** Real-time (ingestion pipeline)  
**FLOW action:**
- Baseline: normal communication patterns per user (volume, timing, channels, recipient groups)
- Detect anomalies:
  - Engineer accessing repositories they've never touched before (sudden wide access exploration)
  - Mass download or export activity in Drive or Notion
  - Off-hours access to production systems
  - Sudden increase in data access velocity
  - Communication with external domains not in known customer/vendor list
- Alert: "James K. accessed 14 GitHub repositories not in his usual set between 11pm–2am on Tuesday. This is a 6σ deviation from his baseline."
- Context: Surface organizational context (is James on a special project? Did his role change recently?)

**Privacy invariant (must not break):** All anomaly detection operates on metadata and access patterns, never on message content from PRIVATE_PERSONAL classified traffic. The Privacy Gate invariant is absolute.

### 3. Compliance Posture Dashboard

**Trigger:** Continuous; weekly report  
**FLOW action:**
- Map organizational controls against framework requirements:
  - **SOC2 Type II:** access reviews complete? Audit log coverage? Encryption in transit? Change management documented?
  - **ISO 27001:** information security policy documented? Asset inventory current? Access control matrix complete?
  - **GDPR:** PII handling documented? Data retention policies enforced? Data subject access request process exists?
- For each control: evidence from FLOW operations (audit log IDs, policy records, access review records)
- Surface: Compliance Score (0–100) per framework + evidence links for auditors
- Gap report: "SOC2 control CC6.1 (Access Review) last completed 127 days ago — quarterly cadence overdue."

### 4. Secret & Credential Exposure Detection

**Trigger:** Every ingestion pass (privacy gate enhanced check)  
**FLOW action:**
- Pattern matching (beyond existing PII gate):
  - `sk_live_*` → Stripe production key
  - `ghp_*` → GitHub PAT
  - `AIza*` → Google API key
  - `AKIA*` → AWS access key
  - Generic patterns: long alphanumeric strings in `key=`, `token=`, `secret=` contexts
- On detection:
  - Do NOT store the credential (hard drop — same as PRIVATE_PERSONAL)
  - Alert security contact: "Potential credential detected in {channel} message from {sender}. Message not stored. Recommend credential rotation immediately."
  - Create SECURITY_FINDING event in Incident Engine
- Score: track credential exposure rate per channel as a security hygiene metric

**Privacy/security invariant:** FLOW never stores detected credentials. The alert contains: who posted it, what channel, when — but never the credential value itself.

### 5. Incident Response Intelligence

**Trigger:** Incident detected (Incident Engine) OR manual trigger by security team  
**FLOW action:**
- On incident classification:
  - RAG query: "What is the history of this system/component?" → surface prior incidents, changes, decisions
  - Access query: "Who has had access to this system in the last 30 days?"
  - Change query: "What changed in this system in the last 14 days?" (commits, deployments, config changes)
  - Communication query: "Who has been discussing this system recently?"
- Surface: structured Incident Context brief
  - Timeline: what changed and when
  - Access list: who had access
  - Communication: who was discussing this before/during the incident
  - Prior incidents: similar past incidents and how they were resolved
  - Suggested responders: based on graph proximity to the affected system

---

## Reused FLOW Components

| Component | Role |
|---|---|
| Privacy Gate | PRIVATE_PERSONAL and credential detection |
| Incident Engine | Real-time incident detection + classification |
| Governance Engine | Policy evaluation + approval workflows |
| Audit Persistence | Immutable audit log for all connector actions |
| ExecutionEngine | Credential revocation + access removal |
| Operational Graph | Access + relationship mapping |
| Org Memory | Historical security decisions + incidents |
| Vector Store | Anomaly baseline + semantic security queries |
| Operational Brain | Security copilot for incident response |
| All connector adapters | Access enumeration across all systems |

---

## New Services Required

| Service | Purpose |
|---|---|
| `accessReviewService.js` | Fan-out access enumeration + cross-reference with org graph |
| `anomalyDetectionService.js` | Baseline + deviation detection per user |
| `compliancePostureService.js` | Map operational evidence to framework controls |
| `credentialScannerService.js` | Enhanced credential pattern detection in ingestion |
| `incidentContextService.js` | Structured incident context assembly |

---

## Data Architecture Additions

```prisma
model AccessReview {
  id              String             @id @default(cuid())
  orgId           String
  workspaceId     String
  reviewType      String             // QUARTERLY | AD_HOC | OFFBOARDING
  framework       String?            // SOC2 | ISO27001 | GDPR
  status          AccessReviewStatus @default(IN_PROGRESS)
  startedAt       DateTime           @default(now())
  completedAt     DateTime?
  approvedBy      String?
  findings        AccessFinding[]
}

enum AccessReviewStatus { IN_PROGRESS AWAITING_REVIEW COMPLETE }

model AccessFinding {
  id             String        @id @default(cuid())
  reviewId       String
  userId         String
  system         String
  accessLevel    String
  findingType    FindingType
  riskLevel      String        // CRITICAL | HIGH | MEDIUM | LOW
  evidence       Json
  resolution     String?       // RETAIN | REVOKE | ESCALATE
  resolvedAt     DateTime?
  auditLogId     String?
  review         AccessReview  @relation(fields: [reviewId], references: [id])
}

enum FindingType {
  ORPHANED_ACCESS
  ROLE_MISMATCH
  EXCESSIVE_PRIVILEGE
  STALE_ACCESS
  UNREVIEWED_ADMIN
}

model SecurityFinding {
  id          String   @id @default(cuid())
  orgId       String
  workspaceId String
  type        String   // CREDENTIAL_EXPOSURE | ANOMALOUS_BEHAVIOR | POLICY_VIOLATION
  severity    String
  description String   @db.Text
  evidence    Json     // { channel, sender, timestamp } — NEVER the credential value
  status      String   @default("OPEN") // OPEN | INVESTIGATING | RESOLVED | FALSE_POSITIVE
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?
}
```

---

## API Additions

```
POST /api/security/access-review/start       — Start quarterly access review
GET  /api/security/access-review/:id         — Review findings + risk levels
POST /api/security/access-review/:id/resolve — Resolve finding (retain/revoke)
GET  /api/security/findings                  — All open security findings
GET  /api/security/compliance/:framework     — Compliance posture + evidence
GET  /api/security/anomalies                 — Recent anomalous behavior events
POST /api/security/incident/:id/context      — Generate incident context brief
```

---

## Privacy & Security Invariants (Absolute — Cannot Be Relaxed)

These apply to the Security Intelligence module and cannot be overridden by any policy:

1. **Credential values are never stored.** Detection is a hard drop — only metadata is logged.
2. **PRIVATE_PERSONAL traffic is never analyzed for anomalies.** Anomaly detection operates on access patterns and metadata only, not message content.
3. **Security findings never include the text of the triggering message.** Only: sender, channel, timestamp, finding type.
4. **Access reviews require ADMIN+ authority.** Standard members cannot initiate or view review findings.
5. **All access revocations via this module go through the Governance Engine.** No direct connector calls bypassing audit persistence.

---

## Competitive Differentiation

**vs. Okta / Microsoft Entra (IAM):** They manage identity. FLOW evaluates whether identity access is appropriate given operational context. FLOW knows the engineer's GitHub activity patterns, their Jira throughput, their meeting attendance — and flags when behavior deviates from that baseline.

**vs. Vanta / Drata (compliance automation):** They collect evidence for compliance reviews. FLOW generates that evidence naturally as a byproduct of operations — every connector action is audited, every access review produces audit log IDs. The compliance certificate from Workforce Intelligence is a real artifact.

**vs. Datadog / Splunk (SIEM):** They ingest infrastructure logs. FLOW ingests organizational communication signals. The combination of both layers — infrastructure anomalies AND communication anomalies — is a level of correlation no single tool has.

**FLOW's moat:** Context. When a SIEM fires an alert that an engineer accessed 14 repositories at 2am, the security team has to manually look up who the engineer is, what their role is, whether they changed roles recently, and who to notify. FLOW already knows all of this. The alert includes organizational context, suggested responders, and one-click remediation.

---

## Roadmap Stage

**Phase 5.3** (Current): Governance Engine, Audit Persistence, Privacy Gate — production  
**Phase 8.0** (Beta): Security Intelligence dashboard with access review + credential scanning  
**Phase 11.8** (Post-Beta): Anomaly detection + compliance posture + incident context engine

---

*Last updated: 2026-07-01 · Status: DESIGN ONLY*
