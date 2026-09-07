export default {
  id: 'stripe.payment.succeeded', version: '1.0.0',
  connector: 'stripe', category: 'FINANCE', source: 'webhook',
  displayName: 'Payment Succeeded', description: 'A Stripe payment was successful.',
  priority: 'HIGH',
  schema: {
    'id':                        { type: 'string' },
    'amount':                    { type: 'number' },
    'currency':                  { type: 'string' },
    'customer':                  { type: 'string' },
    'payment_intent':            { type: 'string' },
    'status':                    { type: 'string' },
    'metadata':                  { type: 'object' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 3_600_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 5, backoffMs: 2_000 },
  security:      { signatureRequired: true, signatureHeader: 'stripe-signature', algorithm: 'hmac-sha256' },
};
