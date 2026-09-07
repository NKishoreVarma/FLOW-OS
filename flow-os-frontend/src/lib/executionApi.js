/**
 * FLOW OS — Execution / Collaboration / Notification API client (Phase 14 M4).
 * Auth + workspace-id pulled from localStorage, matching the other FLOW clients.
 */
function headers() {
  const token = localStorage.getItem('flow_os_token') || '';
  const workspaceId = localStorage.getItem('flow_os_workspace_id') || '';
  return { 'Content-Type': 'application/json', 'workspace-id': workspaceId, Authorization: `Bearer ${token}` };
}

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || `HTTP ${res.status}`);
    err.status = res.status; err.body = data;
    throw err;
  }
  return data;
}

export const executionApi = {
  // Execution
  plan:    (recommendation) => req('/api/execution/plan', { method: 'POST', body: { recommendation } }),
  execute: (recommendation, { confirmed = false } = {}) =>
    req('/api/execution/execute', { method: 'POST', body: { recommendation, confirmed } }),
  history: (limit = 50) => req(`/api/execution/history?limit=${limit}`),
  approval:(id) => req(`/api/execution/approvals/${encodeURIComponent(id)}`),
  vote:    (id) => req(`/api/execution/approvals/${encodeURIComponent(id)}/vote`, { method: 'POST' }),
  rejectApproval: (id, note) => req(`/api/execution/approvals/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { note } }),

  // Collaboration
  conflicts: (owner, repo) => req(`/api/collaboration/conflicts${owner && repo ? `?owner=${owner}&repo=${repo}` : ''}`),
  signals:   (owner, repo) => req(`/api/collaboration/signals${owner && repo ? `?owner=${owner}&repo=${repo}` : ''}`),

  // Notifications
  notifications: ({ limit = 50, unread = false } = {}) => req(`/api/notifications?limit=${limit}${unread ? '&unread=true' : ''}`),
  unreadCount:   () => req('/api/notifications/unread-count'),
  markRead:      (id) => req(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
};

export default executionApi;
