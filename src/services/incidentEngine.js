import { broadcastToWorkspace } from './socketService.js';
import crypto from 'crypto';

export const incidentDatabase = [];

export function detectIncidents(workspaceId, text, metadata) {
  const lowerText = (text || '').toLowerCase();
  
  const outageTriggers = ['outage', 'crashed', 'sev1', 'sev 1', 'down', 'broken', 'p0', 'unresponsive', 'exhaustion', 'incident', 'failure', 'critical', 'emergency'];
  const riskTriggers = ['bottleneck', 'risk', 'delay', 'blocked', 'escalation', 'blocker'];
  
  const isOutage = outageTriggers.some(kw => lowerText.includes(kw));
  const isRisk = riskTriggers.some(kw => lowerText.includes(kw));
  
  if (isOutage || isRisk) {
    const incident_id = 'INC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const severity = isOutage ? 'CRITICAL' : 'HIGH';
    const status = 'OPEN';
    const detected_at = new Date().toISOString();
    
    const affected_systems = lowerText.includes('db') || lowerText.includes('database') ? ['Database'] : ['Unknown'];
    const affected_teams = ['Engineering'];
    
    const incident = {
      workspaceId: String(workspaceId),
      incident_id,
      title: isOutage ? 'Detected System Outage' : 'Detected Project Risk',
      severity,
      status,
      owner: 'Unassigned',
      detected_at,
      affected_systems,
      affected_teams,
      timeline: [
        { time: detected_at, event: 'Automated detection via Ingestion Stream' }
      ],
      evidence: [text],
      recommended_actions: ['Acknowledge incident', 'Investigate source system']
    };
    
    incidentDatabase.push(incident);
    const eventType = isOutage ? 'INCIDENT_CREATED' : 'RISK_DETECTED';
    // Broadcast with both underscore and camelCase keys for downstream compatibility
    broadcastToWorkspace(String(workspaceId), eventType, {
      ...incident,
      incidentId: incident.incident_id,
      incidentName: incident.title
    });
    
    console.log(`🔥 [Incident Engine] ${severity} Incident Detected: ${incident_id}`);
    return incident;
  }
  
  return null;
}

export function getRecentIncidents(workspaceId, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  return incidentDatabase.filter(inc => 
    inc.workspaceId === String(workspaceId) && 
    new Date(inc.detected_at) >= cutoff
  );
}
