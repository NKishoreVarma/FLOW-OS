import { broadcastToWorkspace } from './socketService.js';
import { eventBus } from '../core/events/eventBus.js';
import crypto from 'crypto';
import { saveMemory } from './orgMemoryService.js';
import db from '../config/db.js';

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
    // Persist incident to durable store — fire and forget
    db.query('SELECT org_id FROM workspaces WHERE external_id = $1 LIMIT 1', [String(workspaceId)])
      .then(({ rows }) => {
        if (rows[0]) {
          return saveMemory(String(workspaceId), rows[0].org_id, 'INCIDENT', {
            title: incident.title,
            body: JSON.stringify(incident),
            source: metadata?.platform || 'system',
            importance: incident.severity === 'CRITICAL' ? 0.95 : 0.8
          });
        }
      })
      .catch(() => {});
    const eventType = isOutage ? 'INCIDENT_CREATED' : 'RISK_DETECTED';
    // Broadcast with both underscore and camelCase keys for downstream compatibility
    broadcastToWorkspace(String(workspaceId), eventType, {
      ...incident,
      incidentId: incident.incident_id,
      incidentName: incident.title
    });
    eventBus.emit(eventType, { workspaceId: String(workspaceId), incidentId: incident.incident_id, severity: incident.severity, title: incident.title, platform: metadata?.platform || 'system' });

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
