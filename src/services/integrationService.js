import { Composio } from '@composio/core';
import { processIncomingIntel } from './cognitiveBrainService.js';
import { broadcastToWorkspace } from './socketService.js';

let composioInstance = null;

/**
 * Lazily retrieves the Composio SDK instance using the api key from environment variables.
 */
export function getComposio() {
  if (!composioInstance && process.env.COMPOSIO_API_KEY) {
    composioInstance = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY
    });
  }
  return composioInstance;
}

/**
 * Process webhooks received from live integrations (Slack, Gmail, etc.)
 * 
 * @param {string|number} workspaceId - Corporate tenant identifier
 * @param {string} sourceOrigin - 'slack' or 'gmail'
 * @param {string} identifierMetadata - e.g. Slack channel name or Gmail subject
 * @param {string} rawBodyText - Incoming text stream payload
 * @returns {Promise<Object>} Process result metadata
 */
export async function handleIncomingWebhook(workspaceId, sourceOrigin, identifierMetadata, rawBodyText) {
  console.log(`\n🔌 [Integration Service] Processing incoming webhook for Workspace ${workspaceId} from ${sourceOrigin}`);
  
  // 1. Broadcast the start of ingestion down WebSocket pipeline
  broadcastToWorkspace(String(workspaceId), 'INGESTION_START', { 
    workspaceId, 
    platform: sourceOrigin, 
    channel: identifierMetadata 
  });

  try {
    // 2. Route incoming text data directly through our active cognitiveBrainService.js to clear personal identifiers
    const result = await processIncomingIntel(workspaceId, identifierMetadata, rawBodyText);

    // 3. Simultaneously broadcast the ingestion summary down WebSocket pipeline
    broadcastToWorkspace(String(workspaceId), 'INGESTION_COMPLETE', {
      workspaceId,
      sourcesProcessed: [sourceOrigin],
      status: result.status,
      scope: result.scope
    });

    console.log(`✅ [Integration Service] Webhook processing complete: status [${result.status}] scope [${result.scope}]`);
    return result;
  } catch (error) {
    console.error(`❌ [Integration Service] Webhook pipeline failed:`, error.message);
    
    broadcastToWorkspace(String(workspaceId), 'INGESTION_FAILED', {
      workspaceId,
      platform: sourceOrigin,
      error: error.message
    });
    
    throw error;
  }
}
