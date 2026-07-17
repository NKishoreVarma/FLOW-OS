// Module-level registry: workspaceId → Set of SSE response objects.
// Lives for the process lifetime — acceptable because SSE connections
// are re-established on reconnect and the pilot dashboard is dev-only.
const clients = new Map();

export function addClient(workspaceId, res) {
  if (!clients.has(workspaceId)) clients.set(workspaceId, new Set());
  clients.get(workspaceId).add(res);
}

export function removeClient(workspaceId, res) {
  clients.get(workspaceId)?.delete(res);
}

export function broadcast(workspaceId, data) {
  const set = clients.get(workspaceId);
  if (!set?.size) return;
  const frame = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(frame); } catch { set.delete(res); }
  }
}
