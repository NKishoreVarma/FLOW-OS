export const EVENT_OPEN_ENTITY = 'flow:open-entity';
export const EVENT_ACTIVE_ENTITY = 'flow:active-entity';

export function openEntityContext(entityId, name = '') {
  if (!entityId) return;
  window.dispatchEvent(new CustomEvent(EVENT_OPEN_ENTITY, { detail: { entityId, name } }));
}

export function emitActiveEntity(entityId) {
  window.dispatchEvent(new CustomEvent(EVENT_ACTIVE_ENTITY, { detail: { entityId: entityId || null } }));
}
