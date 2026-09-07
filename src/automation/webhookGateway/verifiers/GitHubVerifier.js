/**
 * GitHub Webhook Verifier — HMAC-SHA256 over the raw body.
 * Secret: per-workspace env GITHUB_WEBHOOK_SECRET or global GITHUB_WEBHOOK_SECRET.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export function verify(req, body, secret) {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return { ok: false, reason: 'Missing x-hub-signature-256 header' };
  if (!secret) return { ok: false, reason: 'No webhook secret configured' };

  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  try {
    const ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return ok ? { ok: true } : { ok: false, reason: 'Signature mismatch' };
  } catch {
    return { ok: false, reason: 'Signature comparison failed' };
  }
}

export function extractEventType(req, payload) {
  const ghEvent = req.headers['x-github-event'];
  const action  = payload?.action;
  if (!ghEvent) return null;
  if (action) return `github.${ghEvent}.${action}`;
  return `github.${ghEvent}`;
}

export function extractDeliveryId(req) {
  return req.headers['x-github-delivery'] ?? null;
}
