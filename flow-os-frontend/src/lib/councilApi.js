/**
 * FLOW OS — Executive Council API client (Phase 15).
 */
function headers() {
  const token = localStorage.getItem('flow_os_token') || '';
  const workspaceId = localStorage.getItem('flow_os_workspace_id') || '';
  return { 'Content-Type': 'application/json', 'workspace-id': workspaceId, Authorization: `Bearer ${token}` };
}

async function req(path, { method = 'GET', body, timeoutMs } = {}) {
  const ctrl = timeoutMs ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: ctrl?.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data;
  } finally { if (t) clearTimeout(t); }
}

export const councilApi = {
  agents:    () => req('/api/council/agents'),
  dashboard: () => req('/api/council/dashboard', { timeoutMs: 120000 }),
  ask:       (question) => req('/api/council/ask', { method: 'POST', body: { question }, timeoutMs: 125000 }),
  agent:     (id, question) => req(`/api/council/agent/${id}`, { method: 'POST', body: { question }, timeoutMs: 90000 }),
};

export default councilApi;
