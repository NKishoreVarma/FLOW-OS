function authHeaders() {
  const token = localStorage.getItem('flow_os_token') || '';
  const workspaceId = localStorage.getItem('flow_os_workspace_id') || 'workspace_corp_alpha';
  return {
    'Content-Type': 'application/json',
    'workspace-id': workspaceId,
    'Authorization': `Bearer ${token}`
  };
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/brain${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `Brain API ${res.status}`);
  }
  return res.json();
}

export const brainApi = {
  briefing: (role = 'EMPLOYEE') => request(`/briefing?role=${encodeURIComponent(role)}`),
  copilot: (payload) => request('/copilot', { method: 'POST', body: payload }),
  recommendations: () => request('/recommendations'),
  executeRecommendation: (recommendation) => request('/recommendations/execute', { method: 'POST', body: { recommendation } }),
  timeline: ({ hours = 168, limit = 50 } = {}) => request(`/timeline?hours=${hours}&limit=${limit}`),
  context: (entityId) => request(`/context/${encodeURIComponent(entityId)}`),
  memory: ({ hours = 168 } = {}) => request(`/memory?hours=${hours}`),
  graph: (entityId) => request(`/graph${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}`),
  decisions: ({ hours = 168, limit = 20 } = {}) => request(`/decisions?hours=${hours}&limit=${limit}`),
  updateDecision: (id, updates) => request(`/decisions/${id}`, { method: 'PATCH', body: updates }),
  automations: () => request('/automations'),
  goals: (status) => request(`/goals${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  evaluateGoal: (id) => request(`/goals/${id}/evaluate`)
};

export default brainApi;
