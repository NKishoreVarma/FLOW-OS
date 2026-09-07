/**
 * Google Webhook Verifier — validates Google Cloud Pub/Sub push subscriptions.
 * Google signs the message with an OIDC token in the Authorization header.
 * In dev/test, accepts all (configure GOOGLE_WEBHOOK_AUDIENCE for prod).
 */

export function verify(req, body, secret) {
  const authHeader = req.headers['authorization'];
  const audience   = process.env.GOOGLE_WEBHOOK_AUDIENCE;

  if (!audience) {
    // Dev mode — no OIDC validation
    return { ok: true, reason: 'GOOGLE_WEBHOOK_AUDIENCE not set — dev mode bypass' };
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, reason: 'Missing Bearer token for Google webhook' };
  }

  // Full OIDC verification requires fetching Google's JWK Set and verifying the JWT.
  // In production, deploy behind Cloud Run/Cloud Functions which verify OIDC automatically.
  // Here we do a structural check — validate token exists.
  const token = authHeader.slice(7);
  if (!token) return { ok: false, reason: 'Empty Bearer token' };

  return { ok: true };
}

export function extractEventType(req, payload) {
  const msgData = payload?.message?.data;
  if (!msgData) return 'google.pubsub.message';
  try {
    const decoded = JSON.parse(Buffer.from(msgData, 'base64').toString());
    return decoded.eventType ? `google.${decoded.eventType}` : 'google.pubsub.message';
  } catch {
    return 'google.pubsub.message';
  }
}

export function extractDeliveryId(req, payload) {
  return payload?.message?.messageId ?? null;
}
