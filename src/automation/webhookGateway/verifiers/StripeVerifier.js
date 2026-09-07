/**
 * Stripe Webhook Verifier — HMAC-SHA256 using Stripe's signed-event format.
 * Header: stripe-signature   value: t=<ts>,v1=<sig>[,v1=<sig>...]
 * Signs: "{timestamp}.{body}"
 */

import { createHmac, timingSafeEqual } from 'crypto';

const REPLAY_WINDOW_SEC = 300;

export function verify(req, body, secret) {
  const header = req.headers['stripe-signature'];
  if (!header) return { ok: false, reason: 'Missing stripe-signature header' };
  if (!secret) return { ok: false, reason: 'No Stripe webhook secret configured' };

  const parts = Object.fromEntries(
    header.split(',').map(p => { const [k, v] = p.split('='); return [k, v]; })
  );
  const ts   = parts.t;
  const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));

  if (!ts || !sigs.length) return { ok: false, reason: 'Malformed stripe-signature' };

  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (age > REPLAY_WINDOW_SEC) return { ok: false, reason: `Timestamp too old (${Math.round(age)}s)` };

  const expected = createHmac('sha256', secret)
    .update(`${ts}.${body.toString()}`)
    .digest('hex');

  const ok = sigs.some(sig => {
    try { return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); }
    catch { return false; }
  });
  return ok ? { ok: true } : { ok: false, reason: 'Signature mismatch' };
}

export function extractEventType(req, payload) {
  const type = payload?.type ?? 'unknown';
  return `stripe.${type.replace(/\./g, '_')}`;
}

export function extractDeliveryId(req, payload) {
  return payload?.id ?? null;
}
