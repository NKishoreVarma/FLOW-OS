# FLOW OS Enterprise Security Guide

## Authentication

### JWT
- Algorithm: HS256 (RS256 in roadmap)
- Secret: minimum 32 characters, cryptographically random (`openssl rand -hex 32`)
- Expiry: 24 hours (configurable via `JWT_EXPIRY`)
- WebSocket: token in `?token=` query param, verified before channel join (`WS_AUTH_REQUIRED=true`)

### Enterprise SSO
- **SAML 2.0**: SP-initiated, XML AuthnRequest, NameID extraction, auto-provision
- **OIDC**: Authorization code flow, id_token JWT decoding, auto-provision
- Config: `PUT /api/admin/sso` (OWNER/ADMIN)

### MFA (TOTP)
- RFC 6238, HMAC-SHA1, 30-second windows, ±1 step tolerance
- 10 single-use backup codes
- Setup: `POST /api/admin/mfa/setup`; Verify: `POST /api/admin/mfa/verify`

## Authorization

### Role Hierarchy
`OWNER > ADMIN > MEMBER > VIEWER > GUEST`

### Custom Roles
- 11-level scope hierarchy: org → workspace → department → team → project → connector → workflow → action → agent → report → marketplace
- Wildcard permissions: `read:*` matches `read:users`; `*` matches all
- Custom roles inherit from parent role
- Managed via `/api/admin/roles`

### Governance
- **ALLOW**: Action proceeds
- **DENY**: Action blocked, logged to `audit_logs`
- **REQUIRE_APPROVAL**: `pending_approvals` row created; 48h TTL; self-approval blocked
- Risk tiers: LOW (auto) → MEDIUM (confirm) → HIGH (1 ADMIN) → CRITICAL (2 distinct ADMINs)

## Network Security

### IP Allowlist
- Per-org CIDR ranges; 60s in-memory cache
- Decision order: no allowlist → ALLOW; not in any range → DENY
- Configured via `/api/admin/ip-allowlist`

### TLS
- Terminate at load balancer (nginx/ALB)
- Redirect HTTP → HTTPS
- Headers: `Strict-Transport-Security`, `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`

### SSRF Protection
- Crawler validates URL against blocklist (localhost, 169.254.x.x, 10.x, 172.16-31.x, 192.168.x.x)
- Only HTTP/HTTPS schemes allowed

## Data Protection

### PII
- Privacy gate drops all `PRIVATE_PERSONAL` classified messages
- No raw PII ever enters `workspace_intel_chunks`
- No PII logged — logger redacts keys matching `token|password|secret|authorization|apikey|jwt|cookie|pii`

### Vault Encryption
- Vault files (Markdown) are written to `VAULT_ROOT` unencrypted
- For encryption at rest: mount an encrypted volume (LUKS, AWS EBS encryption, GCP CMEK)

### Database
- TLS required for `DATABASE_URL` in production
- pgvector access gated by `workspace_id` on every query
- No raw SQL string concatenation — parameterized queries only

## Compliance

### SOC 2 Type II Evidence
- Access control: `enterprise_sessions` (MFA, unique users)
- Change management: `workflow_executions` (all changes via governed workflows)
- Availability: execution success rate
- Confidentiality: privacy gate activations (`flow_events`)
- Security events: `audit_logs` (DENIED actions)
- Generate: `POST /api/admin/compliance/soc2`

### ISO 27001
- A9 Access Control, A8 Asset Management, A16 Incident Management, A12.7 Audit Trail
- Generate: `POST /api/admin/compliance/iso27001`

## Audit Trail

Every connector action, governance decision, approval, and auth event is written to `audit_logs`. Query: `GET /api/admin/audit`.

Fields: `actor_id`, `action`, `resource_type`, `resource_id`, `workspace_id`, `outcome`, `metadata`, `created_at`.

Retention: managed by `EventRetention` service (configurable TTL per event type).
