const privacySignals = [
  'medical', 'salary', 'personal', 'dm', 'password', 'ssn', 'secret', 'private', 
  'confidential', 'account number', 'routing', 'payroll', 'clearance', 'credit card',
  'social security', 'dob', 'date of birth', 'passport', 'pin code',
  'security code', 'bank account', 'api key', 'access token'
];

export function evaluateScores(sender, channel, text) {
  const lowerText = (text || '').toLowerCase();
  const senderStr = (sender || '').toLowerCase();

  console.log('=== COGNITIVE ENGINE INGESTION TRACE ===');
  console.log('Raw text length:', lowerText ? lowerText.length : 0);
  console.log('Evaluating text content:', JSON.stringify(lowerText));

  // 1. Privacy Score
  let privacyHits = 0;
  for (const kw of privacySignals) {
    if (lowerText.includes(kw)) privacyHits++;
  }
  const privacy_score = Math.min(privacyHits * 0.35, 1.0);

  // 2. Intent Score (Actionable Intelligence vs noise)
  let intent_score = 0.2;
  if (lowerText.includes('need to') || lowerText.includes('must') || lowerText.includes('fix') || lowerText.includes('deploy')) {
    intent_score = Math.min(intent_score + 0.4, 1.0);
  }

  // 3. Operational Value Score (Infrastructure, systems)
  let operational_value_score = 0.2;
  if (
    lowerText.includes('prod') || lowerText.includes('production') ||
    lowerText.includes('database') || lowerText.includes('db') ||
    lowerText.includes('server') || lowerText.includes('api') ||
    lowerText.includes('redis') || lowerText.includes('cluster') ||
    lowerText.includes('session') || lowerText.includes('infrastructure')
  ) {
    operational_value_score = Math.min(operational_value_score + 0.5, 1.0);
  }

  // 4. Business Impact Score (Revenue, churn, executive)
  let business_impact_score = 0.1;
  if (lowerText.includes('revenue') || lowerText.includes('churn') || lowerText.includes('client') || lowerText.includes('customer')) {
    business_impact_score = Math.min(business_impact_score + 0.6, 1.0);
  }

  // 5. Memory Value Score (Long-term reference)
  let memory_value_score = 0.3;
  if (lowerText.includes('architecture') || lowerText.includes('decision') || lowerText.includes('document')) {
    memory_value_score = 0.9;
  }

  // 6. Authority Score & Importance Score
  let authority_score = 0.3;
  let importance_score = 0.3;

  if (
    ['ceo', 'cto', 'director', 'vp', 'executive', 'founder'].includes(senderStr) || 
    lowerText.includes('critical') || 
    lowerText.includes('announcement') || 
    lowerText.includes('architecture') ||
    lowerText.includes('p0') || lowerText.includes('p1') ||
    lowerText.includes('sev1') || lowerText.includes('blocker') ||
    lowerText.includes('unresponsive') || lowerText.includes('exhaustion')
  ) {
    importance_score = 0.95;
    authority_score = 0.90;
  }

  // 7. Urgency Score
  let urgency_score = 0.1;
  if (
    lowerText.includes('today') || 
    lowerText.includes('asap') || 
    lowerText.includes('broken') || 
    lowerText.includes('deadline') ||
    lowerText.includes('outage') ||
    lowerText.includes('critical') || lowerText.includes('incident') ||
    lowerText.includes('unresponsive') || lowerText.includes('down') ||
    lowerText.includes('failure') || lowerText.includes('emergency') ||
    lowerText.includes('blocker') || lowerText.includes('now') ||
    lowerText.includes('immediately')
  ) {
    urgency_score = 0.85;
  }

  return {
    privacy_score,
    intent_score,
    operational_value_score,
    business_impact_score,
    memory_value_score,
    authority_score,
    importance_score,
    urgency_score
  };
}
