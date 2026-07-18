/**
 * Integration Permissions API client (Phase 13.1).
 *
 * OAuth authenticates; these endpoints decide what FLOW is allowed to understand.
 */

function authHeaders() {
  const token       = localStorage.getItem('flow_os_token') || '';
  const workspaceId = localStorage.getItem('flow_os_workspace_id') || 'workspace_corp_alpha';
  return {
    'Content-Type':  'application/json',
    'workspace-id':  workspaceId,
    'Authorization': `Bearer ${token}`,
  };
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/integration-permissions${path}`, {
    method,
    headers: authHeaders(),
    body:    body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error?.message || data.message || `Request failed (${res.status})`);
    err.code   = data.error?.code || data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const permissionsApi = {
  overview:   ()                    => request(''),
  connector:  (id, params = {})     => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all'),
    ).toString();
    return request(`/${id}${qs ? `?${qs}` : ''}`);
  },
  discover:   (id)                  => request(`/${id}/discover`, { method: 'POST' }),
  save:       (id, changes)         => request(`/${id}/resources`, { method: 'PUT', body: { changes } }),
  bulk:       (id, allowed, resourceType = null) =>
    request(`/${id}/bulk`, { method: 'POST', body: { allowed, resourceType } }),
  settings:   (id, patch)           => request(`/${id}/settings`, { method: 'PATCH', body: patch }),
  audit:      (id)                  => request(`/${id}/audit`),
};

export default permissionsApi;
