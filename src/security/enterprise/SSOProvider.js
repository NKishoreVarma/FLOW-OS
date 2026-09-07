/**
 * SSOProvider — Module 4 (Enterprise Security)
 *
 * SAML 2.0 and OIDC SSO orchestration.
 * Config stored in enterprise_sso_configs per org.
 * No external SAML/OIDC libraries — uses built-in crypto and jsonwebtoken.
 */

import { createVerify, createHash } from 'crypto';
import jwt       from 'jsonwebtoken';
import { query } from '../../config/db.js';
import { AppError, ValidationError } from '../../core/errors/index.js';
import { createSession } from './SessionManager.js';

// ── SSO Config Management ─────────────────────────────────────────────────────

export async function getSSOConfig(orgId, provider) {
  const { rows } = await query(
    `SELECT * FROM enterprise_sso_configs WHERE org_id=$1 AND provider=$2`,
    [orgId, provider]
  );
  return rows[0] ?? null;
}

export async function upsertSSOConfig(orgId, provider, config) {
  const allowed = ['saml', 'oidc', 'ldap'];
  if (!allowed.includes(provider)) throw new ValidationError(`Provider must be one of: ${allowed.join(', ')}`);

  const { rows } = await query(
    `INSERT INTO enterprise_sso_configs (org_id, provider, config, metadata_url, entity_id, acs_url, enabled)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)
     ON CONFLICT (org_id, provider) DO UPDATE
     SET config=$3::jsonb, metadata_url=$4, entity_id=$5, acs_url=$6, enabled=$7, updated_at=NOW()
     RETURNING *`,
    [orgId, provider, JSON.stringify(config.settings ?? {}),
     config.metadataUrl ?? null, config.entityId ?? null,
     config.acsUrl ?? null, config.enabled ?? true]
  );
  return rows[0];
}

export async function deleteSSOConfig(orgId, provider) {
  await query('DELETE FROM enterprise_sso_configs WHERE org_id=$1 AND provider=$2', [orgId, provider]);
  return { deleted: true };
}

// ── SAML 2.0 ─────────────────────────────────────────────────────────────────

/**
 * Generate a SAML AuthnRequest URL for SP-initiated SSO.
 */
export async function generateSAMLRequest(orgId, { relayState = '' } = {}) {
  const config = await getSSOConfig(orgId, 'saml');
  if (!config?.enabled) throw new AppError('SAML SSO not configured', 400, 'SSO_NOT_CONFIGURED');

  const settings     = _parseJson(config.config, {});
  const idpSSOUrl    = settings.idpSSOUrl ?? settings.sso_url;
  if (!idpSSOUrl)    throw new AppError('IdP SSO URL not configured', 400, 'SSO_MISCONFIGURED');

  const requestId    = `_${createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 32)}`;
  const issueInstant = new Date().toISOString();
  const acsUrl       = config.acs_url ?? `${process.env.FRONTEND_URL}/auth/saml/callback`;

  const authnRequest = `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}" Version="2.0" IssueInstant="${issueInstant}"
  AssertionConsumerServiceURL="${acsUrl}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${config.entity_id ?? acsUrl}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

  const encoded = Buffer.from(authnRequest).toString('base64');
  const url     = `${idpSSOUrl}?SAMLRequest=${encodeURIComponent(encoded)}&RelayState=${encodeURIComponent(relayState)}`;

  return { url, requestId };
}

/**
 * Process a SAML Response and create a session.
 */
export async function processSAMLResponse(orgId, samlResponse, { ipAddress, userAgent } = {}) {
  const config = await getSSOConfig(orgId, 'saml');
  if (!config?.enabled) throw new AppError('SAML SSO not configured', 400, 'SSO_NOT_CONFIGURED');

  const settings = _parseJson(config.config, {});
  let   xml;
  try {
    xml = Buffer.from(samlResponse, 'base64').toString('utf8');
  } catch {
    throw new ValidationError('Invalid SAML Response encoding');
  }

  const nameId = _extractXmlValue(xml, 'NameID') ?? _extractXmlValue(xml, 'saml:NameID');
  if (!nameId)  throw new ValidationError('SAML Response missing NameID');

  const attrs = _extractSAMLAttributes(xml);
  const email = nameId.includes('@') ? nameId : (attrs.email ?? attrs.mail ?? nameId);

  // Find or provision user
  const { userId } = await _findOrProvisionUser(orgId, email, attrs);

  const session = await createSession(userId, orgId, {
    ipAddress, userAgent, mfaVerified: true, ssoSessionId: `saml:${nameId}`,
  });

  return { userId, email, attributes: attrs, session };
}

// ── OIDC ─────────────────────────────────────────────────────────────────────

/**
 * Generate the OIDC authorization URL.
 */
export async function generateOIDCAuthURL(orgId, { state = '' } = {}) {
  const config = await getSSOConfig(orgId, 'oidc');
  if (!config?.enabled) throw new AppError('OIDC SSO not configured', 400, 'SSO_NOT_CONFIGURED');

  const settings     = _parseJson(config.config, {});
  const authEndpoint = settings.authorizationEndpoint ?? settings.auth_endpoint;
  const clientId     = settings.clientId ?? settings.client_id;
  const redirectUri  = settings.redirectUri ?? `${process.env.FRONTEND_URL}/auth/oidc/callback`;

  if (!authEndpoint || !clientId) throw new AppError('OIDC configuration incomplete', 400, 'SSO_MISCONFIGURED');

  const nonce  = createHash('sha256').update(state + Date.now()).digest('hex').slice(0, 16);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         'openid email profile',
    state,
    nonce,
  });

  return { url: `${authEndpoint}?${params}`, nonce };
}

/**
 * Exchange OIDC code for tokens and create a session.
 */
export async function exchangeOIDCCode(orgId, code, { ipAddress, userAgent } = {}) {
  const config = await getSSOConfig(orgId, 'oidc');
  if (!config?.enabled) throw new AppError('OIDC SSO not configured', 400, 'SSO_NOT_CONFIGURED');

  const settings      = _parseJson(config.config, {});
  const tokenEndpoint = settings.tokenEndpoint ?? settings.token_endpoint;
  const clientId      = settings.clientId ?? settings.client_id;
  const clientSecret  = settings.clientSecret ?? settings.client_secret;
  const redirectUri   = settings.redirectUri ?? `${process.env.FRONTEND_URL}/auth/oidc/callback`;

  if (!tokenEndpoint) throw new AppError('OIDC token endpoint not configured', 400, 'SSO_MISCONFIGURED');

  const res = await fetch(tokenEndpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
  });

  if (!res.ok) throw new AppError(`OIDC token exchange failed: ${res.status}`, 502, 'OIDC_TOKEN_ERROR');

  const tokens   = await res.json();
  const idToken  = tokens.id_token;
  const payload  = idToken ? JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) : {};
  const email    = payload.email;
  const name     = payload.name ?? payload.preferred_username ?? email;

  if (!email) throw new ValidationError('OIDC response missing email claim');

  const { userId } = await _findOrProvisionUser(orgId, email, { name });
  const session    = await createSession(userId, orgId, {
    ipAddress, userAgent, mfaVerified: true, ssoSessionId: `oidc:${payload.sub ?? email}`,
  });

  return { userId, email, name, session };
}

// ── SCIM Provisioning ─────────────────────────────────────────────────────────

export async function scimProvisionUser(orgId, scimUser) {
  const email = scimUser.emails?.[0]?.value ?? scimUser.userName;
  if (!email)  throw new ValidationError('SCIM user must have an email');

  const { userId, created } = await _findOrProvisionUser(orgId, email, {
    name:       `${scimUser.name?.givenName ?? ''} ${scimUser.name?.familyName ?? ''}`.trim() || email,
    active:     scimUser.active !== false,
    externalId: scimUser.externalId,
  });

  return { userId, email, created };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _findOrProvisionUser(orgId, email, attrs = {}) {
  const { rows: existing } = await query(
    `SELECT u.id FROM users u JOIN organizations o ON o.id = u.org_id
     WHERE o.id = $1 AND u.email = $2`,
    [orgId, email]
  ).catch(() => ({ rows: [] }));

  if (existing[0]) return { userId: existing[0].id, created: false };

  const name = attrs.name ?? attrs.displayName ?? email.split('@')[0];
  const { rows: org } = await query('SELECT id FROM organizations WHERE id = $1', [orgId]);
  if (!org[0]) throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');

  const { rows: newUser } = await query(
    `INSERT INTO users (org_id, email, full_name, role, password_hash)
     VALUES ($1,$2,$3,'MEMBER','sso-provisioned') RETURNING id`,
    [orgId, email, name]
  );
  return { userId: newUser[0].id, created: true };
}

function _extractXmlValue(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
  return xml.match(re)?.[1]?.trim() ?? null;
}

function _extractSAMLAttributes(xml) {
  const attrs = {};
  const re    = /<(?:saml:)?Attribute[^>]*Name="([^"]+)"[^>]*>[\s\S]*?<(?:saml:)?AttributeValue[^>]*>([^<]+)<\/(?:saml:)?AttributeValue>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const key = m[1].split('/').pop().split(':').pop();
    attrs[key] = m[2].trim();
  }
  return attrs;
}

function _parseJson(v, fallback) {
  if (typeof v === 'object' && v !== null) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
