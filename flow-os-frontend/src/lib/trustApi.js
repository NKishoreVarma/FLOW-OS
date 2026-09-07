/**
 * Trust + Team API client (Phase 17, M3).
 * Same auth/workspace convention as brainApi / onboardingApi.
 */

function authHeaders() {
  const token = localStorage.getItem('flow_os_token') || '';
  const workspaceId = localStorage.getItem('flow_os_workspace_id') || 'workspace_corp_alpha';
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

export const trustApi = {
  connectors: () => request('/api/connectors'),
  health: () => request('/api/connectors/health'),
};

export const teamApi = {
  list: () => request('/api/users'),
  invite: ({ email, fullName, role = 'MEMBER', password }) =>
    request('/api/users/invite', { method: 'POST', body: { email, fullName, role, password } }),
};

// Client-side temp credential for a pilot invite (no email infra yet — admin shares it).
export function generateTempPassword() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `flow-${rand}-${Math.floor(Math.random() * 90 + 10)}`;
}

export default trustApi;
