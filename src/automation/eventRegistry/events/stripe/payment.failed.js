export default {
  id: 'stripe.payment.failed', version: '1.0.0',
  connector: 'stripe', category: 'FINANCE', source: 'webhook',
  displayName: 'Payment Failed', description: 'A Stripe payment failed.',
  priority: 'CRITICAL',
  schema: {
    'id':                        { type: 'string' },
    'amount':                    { type: 'number' },
    'currency':                  { type: 'string' },
    'customer':                  { type: 'string' },
    'payment_intent':            { type: 'string' },
    'status':                    { type: 'string' },
    'last_payment_error.message': { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 3_600_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 5, backoffMs: 2_000 },
  security:      { signatureRequired: true, signatureHeader: 'stripe-signature', algorithm: 'hmac-sha256' },
};
