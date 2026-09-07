# FLOW OS — Phase 3 Policy Engine Specification
**Milestone:** Phase 3 Implementation Specification  
**Status:** Approved for Core Integration  
**Layer:** Security, Governance & Authorization  

---

## 1. Executive Summary & Responsibilities

The **FLOW Policy Engine** is the central gatekeeper for all state-changing activities across the platform. Every connector action, whether triggered manually by a user, automatically by a webhook, or autonomously by a background agent, must undergo evaluation by this engine.

### Core Responsibilities:
1. **Risk Scoring:** Dynamically computes a risk coefficient ($0.0$ to $1.0$) based on payload safety, historical anomalies, and execution environment.
2. **Authorization & Role Checks:** Evaluates multi-tenant workspace permissions matching the user's role and membership constraints.
3. **Approval Flow Management:** Halts executions and spawns multi-signature approval requests for high-risk operations.
4. **Compliance & Audit Logging:** Logs policy outcomes (rules matched, decisions made, signature states) in an unalterable database table.
5. **Emergency Overrides:** Provides break-glass procedures for critical operational conditions under restricted, audited environments.
6. **Policy Inheritance:** Combines global org policies with workspace-level, role-level, and department-level overrides using clear precedence rules.

---

## 2. Architecture & Evaluation Flow

The Policy Engine sits between the Connector API Gateway and the Execution adapters.

```
       [API Call / Connector Execution Request]
                         │
                         ▼
             ┌───────────────────────┐
             │     Policy Engine     │
             └───────────┬───────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
 │ Policy Cache│  │ Rule Engine │  │ Risk Calc   │
 └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
             ┌───────────────────────┐
             │   Evaluation Engine   │
             └───────────┬───────────┘
                         │
        ┌────────────────┼────────────────┬────────────────┐
        ▼ (ALLOW)        ▼ (DENY)         ▼ (REQ_APPROVAL) ▼ (ESCALATE)
 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
 │  Execute    │  │  Log Audit  │  │  Suspend &  │  │ Notify Admins│
 │  Connector  │  │  Abort Run  │  │  Request Vote│ │ Raise Priority│
 └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

### 2.1 Policy Inheritance Tree
Policies are inherited downward, with narrower overrides taking precedence over broader declarations:
```
Organization-wide Policies (Default)
     └── Workspace-specific Overrides (Tenant level)
              └── Department-specific Rules (Group level)
                       └── User/Role Specific Policies (Individual level)
```
*   *Conflict Resolution Rule:* In the event of conflicting policies at the same priority level, a `DENY` rule always wins over `ALLOW`, `REQUIRE_APPROVAL`, or `ESCALATE`.

---

## 3. Database Schema

The Policy Engine requires schema definitions for policy declarations, approval tracking, and audit trails.

```prisma
// prisma/schema.prisma (Policy Engine Section)

enum PolicyEffect {
  ALLOW
  DENY
  REQUIRE_APPROVAL
  ESCALATE
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  ESCALATED
  EXECUTED
}

model Policy {
  id            String       @id @default(cuid())
  orgId         String       @map("org_id")
  workspaceId   String?      @map("workspace_id") // Null indicates global organization policy
  departmentId  String?      @map("department_id") // Null indicates workspace-wide policy
  connectorId   String?      @map("connector_id") // Null matches all connectors
  actionName    String?      @map("action_name")  // Null matches all actions on connector
  subjectRole   Role?        @map("subject_role") // Null matches any user role
  effect        PolicyEffect @default(DENY)
  conditions    Json         @default("{}")       // Time windows, environment constraints, payload checks
  riskLimit     Float        @default(1.0)        // Maximum risk score allowed without escalation
  priority      Int          @default(100)        // Priority scoring: higher value executes first
  enabled       Boolean      @default(true)
  description   String?
  createdAt     DateTime     @default(now())      @map("created_at")
  updatedAt     DateTime     @updatedAt           @map("updated_at")

  @@index([orgId, workspaceId, enabled])
  @@index([orgId, priority])
  @@map("policies")
}

model PendingApproval {
  id             String         @id @default(cuid())
  workspaceId    String         @map("workspace_id")
  requesterId    String         @map("requester_id")
  connectorId    String         @map("connector_id")
  actionName     String         @map("action_name")
  payloadRef     Json           @map("payload_ref")   // Sanitized invocation payload
  riskScore      Float          @map("risk_score")
  status         ApprovalStatus @default(PENDING)
  requiredVotes  Int            @default(1)           // Number of distinct approvals needed
  votes          Json           @default("[]")        // Array of { approverId, timestamp, effect }
  expiresAt      DateTime       @map("expires_at")
  createdAt      DateTime       @default(now())       @map("created_at")
  updatedAt      DateTime       @updatedAt            @map("updated_at")

  @@index([workspaceId, status])
  @@map("pending_approvals")
}

model PolicyAuditLog {
  id            String       @id @default(cuid())
  workspaceId   String       @map("workspace_id")
  userId        String?      @map("user_id")
  connectorId   String       @map("connector_id")
  actionName    String       @map("action_name")
  riskScore     Float        @map("risk_score")
  matchedPolicy String?      @map("matched_policy_id")
  decision      PolicyEffect
  reason        String
  ipAddress     String?      @map("ip_address")
  createdAt     DateTime     @default(now())      @map("created_at")

  @@index([workspaceId, createdAt])
  @@map("policy_audit_logs")
}
```

---

## 4. Policy Language Spec & Examples

FLOW Policies are defined in JSON or YAML. Conditions use a sandboxed syntax to evaluate execution context (such as time windows, IP boundaries, and payload parameters).

### 4.1 Specification Attributes
*   `conditions.timeWindow`: restricts execution window (e.g. `09:00-18:00`).
*   `conditions.allowedIPs`: CIDR block whitelist check.
*   `conditions.requireMFA`: boolean flag requiring fresh MFA token check.
*   `conditions.payloadMatches`: Key-value expressions mapped to target API payloads.

### 4.2 Production Examples

#### 1. Merge PR Policy
*   **Goal:** Restrict merging to main branch to admin roles during weekend lockouts.
```yaml
id: policy-merge-pr-restrictions
orgId: org_corp_alpha
workspaceId: ws_engineering
connectorId: github
actionName: GH_MERGE_PR
effect: REQUIRE_APPROVAL
priority: 200
riskLimit: 0.75
conditions:
  targetBranch: "main"
  requireMFA: true
  timeWindow: "09:00-17:00"
  weekendOverride: "DENY"
description: "Restricts main merges during off-hours, requiring admin approvals."
```

#### 2. Delete Repository Policy
*   **Goal:** Require two-person approval for deleting repos.
```yaml
id: policy-delete-repo-safeguard
orgId: org_corp_alpha
workspaceId: null
connectorId: github
actionName: GH_DEL_BRANCH
effect: ESCALATE
priority: 500
riskLimit: 0.90
conditions:
  requireDistinctApprovers: 2
  allowedIPs: ["10.0.0.0/8"]
description: "Escalates all repo deletions to owner roles, requiring distinct approvals."
```

#### 3. Send Email Policy
*   **Goal:** Require approval when sending emails to more than 100 recipients.
```yaml
id: policy-mass-email-guard
orgId: org_corp_alpha
workspaceId: null
connectorId: gmail
actionName: GM_SEND_EMAIL
effect: REQUIRE_APPROVAL
priority: 150
riskLimit: 0.50
conditions:
  recipientLimit: 100
description: "Detects bulk email actions and halts execution for manual approval."
```

#### 4. Deploy Production Policy
*   **Goal:** Restrict production Kubernetes deployment to owner roles, denying all other attempts.
```yaml
id: policy-deploy-production-restriction
orgId: org_corp_alpha
workspaceId: null
connectorId: aws
actionName: AWS_UPD_SRV
effect: DENY
priority: 400
riskLimit: 0.85
conditions:
  env: "production"
  subjectRoleExclusion: ["OWNER"]
description: "Denies production deployment actions for all roles except OWNER."
```

#### 5. Restart Kubernetes Pod Policy
*   **Goal:** Allow normal restarts, but require confirmation for production critical service pods.
```yaml
id: policy-k8s-pod-restart
orgId: org_corp_alpha
workspaceId: ws_devops
connectorId: kubernetes
actionName: K8S_DELETE_POD
effect: REQUIRE_APPROVAL
priority: 180
riskLimit: 0.60
conditions:
  namespace: "production"
  criticalLabels: ["app=db", "app=auth"]
description: "Protects critical production pods from accidental command restarts."
```

#### 6. Reset User Password Policy
*   **Goal:** Force escalation and security logging for database resets.
```yaml
id: policy-db-password-reset
orgId: org_corp_alpha
workspaceId: null
connectorId: postgresql
actionName: PG_EXECUTE
effect: ESCALATE
priority: 450
riskLimit: 0.95
conditions:
  containsKeyword: ["ALTER USER", "PASSWORD", "secrets"]
description: "Escalates any attempts to modify user password secrets in database tables."
```

---

## 5. Execution & Evaluation Engine (Implementation Skeleton)

Here is the JavaScript implementation blueprint for the Policy Evaluation and Risk Scoring algorithms.

### 5.1 Risk Calculator Implementation
```javascript
// src/core/governance/riskCalculator.js

/**
 * Dynamically computes a risk score between 0.0 and 1.0
 */
export function calculateRiskScore(context) {
  const { connectorId, actionName, payload, actorRole, ipAddress, healthScore = 100 } = context;
  
  let riskBase = 0.1; // Baseline risk

  // 1. Evaluate Connector Sensitivity
  const connectorRiskFactors = {
    postgresql: 0.6,
    kubernetes: 0.5,
    aws: 0.4,
    github: 0.3,
    slack: 0.1,
    gmail: 0.2
  };
  riskBase += (connectorRiskFactors[connectorId] || 0.1);

  // 2. Evaluate Destructive Keywords
  const criticalActions = ['delete', 'drop', 'truncate', 'terminate', 'kill', 'purge', 'merge'];
  const nameMatch = actionName.toLowerCase();
  if (criticalActions.some(action => nameMatch.includes(action))) {
    riskBase += 0.3;
  }

  // 3. Evaluate Payload Sensitivity
  if (payload) {
    const payloadStr = JSON.stringify(payload).toLowerCase();
    const sensitiveKeywords = ['production', 'main', 'secret', 'password', 'root', 'arr'];
    if (sensitiveKeywords.some(keyword => payloadStr.includes(keyword))) {
      riskBase += 0.2;
    }
  }

  // 4. Role Mitigations
  const roleMitigations = {
    OWNER: -0.2,
    ADMIN: -0.1,
    MEMBER: 0.1,
    VIEWER: 0.3
  };
  riskBase += (roleMitigations[actorRole] || 0.1);

  // 5. System Health Penalty (If systems are unstable, raise execution risk)
  if (healthScore < 80) {
    riskBase += 0.15;
  }

  // Clamp result between 0.0 and 1.0
  const finalScore = Math.max(0.0, Math.min(1.0, riskBase));
  console.log(`🧠 [Risk Calculator] Computed Score: ${finalScore} for ${connectorId}.${actionName}`);
  return finalScore;
}
```

### 5.2 Evaluation Engine Implementation
```javascript
// src/core/governance/evaluationEngine.js
import { prisma } from '../config/prisma.js';
import { calculateRiskScore } from './riskCalculator.js';

/**
 * Evaluates permission logic against active database policies
 */
export async function evaluatePolicy(context) {
  const { orgId, workspaceId, departmentId, connectorId, actionName, actorId, actorRole } = context;

  // 1. Calculate Dynamic Execution Risk
  const riskScore = calculateRiskScore(context);

  // 2. Query Policies matching parameters, ordered by priority
  const activePolicies = await prisma.policy.findMany({
    where: {
      orgId,
      enabled: true,
      OR: [
        { workspaceId: null }, // Global policies
        { workspaceId }
      ]
    },
    orderBy: { priority: 'desc' }
  });

  let decision = null;
  let matchedPolicy = null;

  // 3. Evaluate Rules by Precedence
  for (const policy of activePolicies) {
    // Check connector scope
    if (policy.connectorId && policy.connectorId !== connectorId) continue;
    if (policy.actionName && policy.actionName !== actionName) continue;
    
    // Check Subject scope
    if (policy.subjectRole && policy.subjectRole !== actorRole) continue;

    // Check conditions
    if (!evaluateConditions(policy.conditions, context)) continue;

    // If policy has a risk limit and score exceeds it, raise action effect
    if (riskScore > policy.riskLimit) {
      decision = 'REQUIRE_APPROVAL';
      matchedPolicy = policy;
      break;
    }

    // Match found
    decision = policy.effect;
    matchedPolicy = policy;
    break;
  }

  // 4. Default Fallback Policy if no rule matches
  if (!decision) {
    decision = getDefaultDecision(actorRole, riskScore);
    matchedPolicy = { id: 'DEFAULT_POLICY_SYSTEM' };
  }

  // 5. Write to Policy Audit Log (durable persistence)
  await prisma.policyAuditLog.create({
    data: {
      workspaceId: workspaceId || 'global',
      userId: actorId,
      connectorId,
      actionName,
      riskScore,
      matchedPolicyId: matchedPolicy.id,
      decision,
      reason: `Matched policy: ${matchedPolicy.id}. Evaluated risk: ${riskScore}`,
      ipAddress: context.ipAddress
    }
  });

  return {
    effect: decision,
    riskScore,
    matchedPolicyId: matchedPolicy.id,
    reason: `Evaluated decision: ${decision}. Risk factor: ${riskScore}`
  };
}

/**
 * Evaluate boolean condition expressions on execution context
 */
function evaluateConditions(conditions, context) {
  // Sandbox validation logic
  if (conditions.timeWindow) {
    const currentHour = new Date().getHours();
    const [startStr, endStr] = conditions.timeWindow.split('-');
    const startHour = parseInt(startStr.split(':')[0]);
    const endHour = parseInt(endStr.split(':')[0]);
    if (currentHour < startHour || currentHour > endHour) {
      return false; // Action outside permitted timeframe
    }
  }

  if (conditions.allowedIPs && context.ipAddress) {
    // Simple mock check (extend to subnet CIDR matches)
    if (!conditions.allowedIPs.includes(context.ipAddress)) {
      return false;
    }
  }

  return true;
}

/**
 * Default fallback rules based on role and risk
 */
function getDefaultDecision(role, riskScore) {
  if (role === 'OWNER') return 'ALLOW';
  if (role === 'ADMIN') {
    return riskScore > 0.7 ? 'REQUIRE_APPROVAL' : 'ALLOW';
  }
  if (role === 'MEMBER') {
    if (riskScore > 0.8) return 'DENY';
    return riskScore > 0.4 ? 'REQUIRE_APPROVAL' : 'ALLOW';
  }
  return 'DENY'; // Default DENY for VIEWERS and unknown actors
}
```

---

## 6. WebSocket Events & Telemetry

The Policy Engine streams live evaluation stages to clients via WebSockets to feed compliance dashboards.

| Event Type | Direction | Payload Attributes | Trigger |
| :--- | :--- | :--- | :--- |
| `POLICY_EVALUATION_START` | Server $\rightarrow$ Client | `connectorId`, `actionName`, `actorId` | Prior to evaluating rules |
| `POLICY_EVALUATION_COMPLETE`| Server $\rightarrow$ Client | `decision`, `riskScore`, `matchedPolicyId` | Immediately post decision resolve |
| `APPROVAL_REQUESTED` | Server $\rightarrow$ Client | `approvalId`, `votesNeeded`, `expiresAt` | On `REQUIRE_APPROVAL` decision |
| `APPROVAL_RESOLVED` | Server $\rightarrow$ Client | `approvalId`, `status` (`APPROVED`/`REJECTED`)| When votes criteria are resolved |
| `EMERGENCY_OVERRIDE_ALERT` | Server $\rightarrow$ Client | `actionName`, `overrideReason`, `actorId` | On trigger override executions |

---

## 7. Operational REST API

Exposed under `/api/governance/*` for administrators to manage rules and review audit reports.

### 7.1 GET `/api/governance/policies`
*   **Access:** OWNER, ADMIN.
*   **Description:** Returns the active policy list for the workspace.
*   **Response:**
    ```json
    {
      "success": true,
      "policies": [
        { "id": "policy-merge-pr-restrictions", "effect": "REQUIRE_APPROVAL", "enabled": true }
      ]
    }
    ```

### 7.2 POST `/api/governance/policies`
*   **Access:** OWNER only.
*   **Description:** Create a new workspace rule.
*   **Body:** Payload matching the `Policy` database schema model.

### 7.3 GET `/api/governance/audits`
*   **Access:** OWNER, ADMIN.
*   **Description:** Retrieve paginated audit logs.
*   **Query params:** `?limit=20&offset=0&decision=DENY`.

---

## 8. Verification & Test Plan

1. **Unit Testing (`tests/governance/evaluator.test.js`):**
   * Assert that `evaluatePolicy` returns `DENY` when a MEMBER attempts to delete a repository.
   * Verify that `calculateRiskScore` escalates the output value when a payload containing the `"production"` string is parsed.
2. **Integration Verification (Validation Suite):**
   * Run the validation script to verify that policy evaluation completes under 50ms:
     `node scripts/testPolicySpeed.js`
   * Confirm that mock SQL injection queries trigger the automated `DENY` rules.
