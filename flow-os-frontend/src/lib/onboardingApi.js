/**
 * Onboarding + Success API client (Phase 17).
 * Auth + workspace scope from localStorage, same convention as brainApi.
 */

function authHeaders() {
  const token = localStorage.getItem('flow_os_token') || '';
  const workspaceId = localStorage.getItem('flow_os_workspace_id') || '';
  return { 'Content-Type': 'application/json', 'workspace-id': workspaceId, Authorization: `Bearer ${token}` };
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || err.error || err.message || `${path} ${res.status}`);
  }
  return res.json();
}

export const onboardingApi = {
  state: () => request('/api/onboarding/state'),
  discover: (mode = 'demo', connectors) => request('/api/onboarding/discover', { method: 'POST', body: { mode, connectors } }),
  permissions: (selections) => request('/api/onboarding/permissions', { method: 'POST', body: { selections } }),
  complete: (buildImportId) => request('/api/onboarding/complete', { method: 'POST', body: { buildImportId } }),
  reset: () => request('/api/onboarding/reset', { method: 'POST' }),

  // Demo build reuses the dev-only Living Workspace Simulator (best-effort; ignored if unavailable).
  seedDemo: (days = 45) => request('/api/simulator/seed', { method: 'POST', body: { days } }).catch(() => null),
};

export const successApi = {
  summary: (days = 7) => request(`/api/success/summary?days=${days}`),
  model: () => request('/api/success/model'),
};

export default onboardingApi;
