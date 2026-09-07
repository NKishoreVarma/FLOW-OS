/**
 * Custom Webhook Verifier — HMAC with configurable algorithm and header.
 * Reads from query params: ?algo=sha256&header=x-signature
 */

import { createHmac, timingSafeEqual, getHashes } from 'crypto';

const SAFE_ALGOS = new Set(['sha256', 'sha512', 'sha1', 'md5']);

export function verify(req, body, secret) {
  const algo       = (req.query?.algo ?? 'sha256').toLowerCase();
  const headerName = (req.query?.sigHeader ?? 'x-signature').toLowerCase();

  if (!SAFE_ALGOS.has(algo)) return { ok: false, reason: `Unsupported algo: ${algo}` };
  if (!secret) return { ok: true, reason: 'No secret — unauthenticated custom webhook accepted' };

  const sig = req.headers[headerName];
  if (!sig) return { ok: false, reason: `Missing signature header: ${headerName}` };

  const expected = createHmac(algo, secret).update(body).digest('hex');
  try {
    const ok = timingSafeEqual(Buffer.from(sig.replace(/^sha\d+=/, '')), Buffer.from(expected));
    return ok ? { ok: true } : { ok: false, reason: 'Custom signature mismatch' };
  } catch {
    return { ok: false, reason: 'Custom signature comparison failed' };
  }
}

export function extractEventType(req, payload) {
  return payload?.eventType ?? req.query?.eventType ?? 'custom.webhook';
}

export function extractDeliveryId(req, payload) {
  return payload?.id ?? req.headers['x-delivery-id'] ?? null;
}
