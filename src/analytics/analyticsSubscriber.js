import { eventBus } from '../core/events/eventBus.js';
import { trackEvent } from './pilotTracker.js';
import { broadcast } from './sseClients.js';

eventBus.on('CONNECTOR_ACTION_EXECUTED', async (payload) => {
  const { workspaceId, actor, action } = payload ?? {};
  if (!workspaceId) return;
  try {
    await trackEvent(workspaceId, actor?.id ?? null, 'action.completed', {
      actionType: action?.type ?? null,
      connector: action?.connector ?? null,
    });
    broadcast(workspaceId, { type: 'action.completed', workspaceId });
  } catch { /* non-fatal — analytics must never break execution */ }
});

eventBus.on('CONNECTOR_ACTION_DENIED', async (payload) => {
  const { workspaceId, actor, action } = payload ?? {};
  if (!workspaceId) return;
  try {
    await trackEvent(workspaceId, actor?.id ?? null, 'action.failed', {
      actionType: action?.type ?? null,
      errorCode: 'FORBIDDEN',
    });
  } catch { /* non-fatal */ }
});

eventBus.on('PILOT_FEEDBACK_SUBMITTED', (payload) => {
  const { workspaceId } = payload ?? {};
  if (!workspaceId) return;
  broadcast(workspaceId, { type: 'feedback', data: payload });
});
