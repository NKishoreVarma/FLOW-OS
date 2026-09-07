/**
 * Jira Webhook Verifier — shared secret via Authorization header or x-hub-signature.
 * Jira Cloud: Basic auth header or no auth (IP-restricted).
 * On-prem Jira: HMAC-SHA256 via x-hub-signature.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export function verify(req, body, secret) {
  // HMAC path (on-prem / configured secret)
  const hmacSig = req.headers['x-hub-signature'];
  if (hmacSig && secret) {
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    try {
      const ok = timingSafeEqual(Buffer.from(hmacSig), Buffer.from(expected));
      return ok ? { ok: true } : { ok: false, reason: 'Jira HMAC mismatch' };
    } catch {
      return { ok: false, reason: 'Jira signature comparison failed' };
    }
  }

  // Cloud / no-sig path — accept if no secret configured (IP trust)
  if (!secret) return { ok: true, reason: 'No secret configured — accepting (IP trust mode)' };

  return { ok: false, reason: 'No recognizable Jira signature header' };
}

export function extractEventType(req, payload) {
  const webhookEvent = payload?.webhookEvent ?? '';
  return `jira.${webhookEvent.replace(/:/g, '.').toLowerCase()}`;
}

export function extractDeliveryId(req, payload) {
  return payload?.timestamp ? `jira-${payload.timestamp}` : null;
}
