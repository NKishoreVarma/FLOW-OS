/**
 * Slack Webhook Verifier — HMAC-SHA256 over "v0:{timestamp}:{body}".
 * Also checks the timestamp to prevent replay attacks (5-minute window).
 */

import { createHmac, timingSafeEqual } from 'crypto';

const REPLAY_WINDOW_SEC = 300;

export function verify(req, body, secret) {
  const ts  = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  if (!ts || !sig) return { ok: false, reason: 'Missing Slack signature headers' };
  if (!secret)     return { ok: false, reason: 'No Slack signing secret configured' };

  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (age > REPLAY_WINDOW_SEC) return { ok: false, reason: `Timestamp too old (${Math.round(age)}s)` };

  const baseString = `v0:${ts}:${body.toString()}`;
  const expected   = 'v0=' + createHmac('sha256', secret).update(baseString).digest('hex');

  try {
    const ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return ok ? { ok: true } : { ok: false, reason: 'Signature mismatch' };
  } catch {
    return { ok: false, reason: 'Signature comparison failed' };
  }
}

export function extractEventType(req, payload) {
  if (payload?.type === 'url_verification') return 'slack.url_verification';
  const evType = payload?.event?.type ?? 'message';
  return `slack.${evType}`;
}

export function extractDeliveryId(req, payload) {
  return payload?.event_id ?? req.headers['x-slack-retry-num'] ? null : null;
}
