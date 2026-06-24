import { broadcastToWorkspace } from './socketService.js';
import crypto from 'crypto';

export const decisionDatabase = [];

export function extractDecisions(workspaceId, text, metadata, sender) {
  const lowerText = (text || '').toLowerCase();
  
  const decisionTriggers = ['decided to', 'moving to', 'we will move to', 'agreed to', 'decision made', 'chose to', 'going with'];
  const hasDecision = decisionTriggers.some(kw => lowerText.includes(kw));
  
  if (hasDecision) {
    const decision_id = 'DEC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    const decisionObj = {
      workspaceId: String(workspaceId),
      decision_id,
      decision: text.substring(0, 100) + (text.length > 100 ? '...' : ''), // heuristic snippet
      reason: 'Extracted from natural language stream',
      owner: sender || 'Unknown',
      date: new Date().toISOString(),
      alternatives_considered: [],
      outcome: 'Pending implementation',
      evidence: [text]
    };
    
    decisionDatabase.push(decisionObj);
    broadcastToWorkspace(String(workspaceId), 'DECISION_RECORDED', decisionObj);
    console.log(`📝 [Decision Memory] Decision Recorded: ${decision_id}`);
    
    return decisionObj;
  }
  
  return null;
}

export function getRecentDecisions(workspaceId, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  return decisionDatabase.filter(dec => 
    dec.workspaceId === String(workspaceId) && 
    new Date(dec.date) >= cutoff
  );
}
