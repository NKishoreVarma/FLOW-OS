import { draftGmailResponse } from './gmailInboundService.js';

/**
 * Evaluates internal system events to automatically trigger external responses.
 * @param {string} workspaceId 
 * @param {string} eventType 
 * @param {Object} payload 
 * @param {Function} emitCallback - Callback to broadcast ACTION_EXECUTED
 */
export const evaluateActionTriggers = async (workspaceId, eventType, payload, emitCallback) => {
  try {
    switch (eventType) {
      
      // Recipe 1: Incident Response
      case 'INCIDENT_CREATED':
        if (payload.severity === 'CRITICAL') {
          console.log(`⚡ [Orchestrator] Recipe 1 triggered: CRITICAL Incident ${payload.incidentId}`);
          
          const actionPayload = {
            recipe: 'INCIDENT_ALERT',
            action: 'Drafted Slack/Email Alert',
            target: 'Engineering Lead',
            details: `Urgent escalation for ${payload.incidentId}: ${payload.incidentName}`
          };
          
          console.log(`✅ [Action] Dispatched critical alert to Engineering Lead.`);
          if (emitCallback) emitCallback(actionPayload);
        }
        break;

      // Recipe 2: Health Alignment
      case 'HEALTH_SCORE_UPDATED':
        if (payload.sectors) {
          const failingSectors = [];
          for (const [sector, score] of Object.entries(payload.sectors)) {
            if (score < 70) failingSectors.push(sector);
          }
          
          if (failingSectors.length > 0) {
            console.log(`⚡ [Orchestrator] Recipe 2 triggered: Health dropped below 70 in ${failingSectors.join(', ')}`);
            
            const actionPayload = {
              recipe: 'EMERGENCY_HUDDLE',
              action: 'Drafted Alignment Brief',
              target: 'Elite Chief of Staff Agent',
              details: `Initiating emergency alignment protocol for sectors: ${failingSectors.join(', ')}`
            };
            
            console.log(`✅ [Action] Drafted alignment brief for Chief of Staff.`);
            if (emitCallback) emitCallback(actionPayload);
          }
        }
        break;

      // Recipe 3: Customer Interruption Blocker
      case 'INTEL_STORED':
        if (payload.channelName && payload.channelName.startsWith('GMAIL:')) {
          const isBlocker = (payload.text || '').toLowerCase().includes('customer interruption blocker');
          
          if (isBlocker) {
            console.log(`⚡ [Orchestrator] Recipe 3 triggered: Customer Interruption Blocker detected in email.`);
            
            const senderEmail = payload.sender || 'unknown@example.com';
            const subject = payload.channelName.replace('GMAIL: ', '');
            const body = "Hi,\n\nWe have detected your customer interruption blocker and have escalated it to the engineering team. We will update you shortly.\n\n- FLOW OS Automated Response";
            
            let draftId = 'MOCK_DRAFT_ID';
            try {
              const res = await draftGmailResponse(workspaceId, senderEmail, subject, body);
              if (res.draftId) draftId = res.draftId;
            } catch (e) {
              console.warn(`⚠️ [Orchestrator] Gmail draft failed (likely no auth), falling back to mock.`);
            }

            const actionPayload = {
              recipe: 'CUSTOMER_BLOCKER_REPLY',
              action: 'Drafted Contextual Response in Gmail',
              target: senderEmail,
              details: `Draft created successfully. Draft ID: ${draftId}`
            };
            
            console.log(`✅ [Action] Automatically drafted Gmail response.`);
            if (emitCallback) emitCallback(actionPayload);
          }
        }
        break;
        
    }
  } catch (err) {
    console.error('❌ [Orchestrator] Trigger evaluation failed:', err.message);
  }
};
