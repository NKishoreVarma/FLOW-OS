/**
 * KubernetesAdapter — Infrastructure Operations Connector
 *
 * Wraps the Kubernetes REST API using native fetch with Bearer token auth.
 * Every mutating operation (restart, scale, rollback) flows through
 * executeAction() so governance, audit, and timeline are applied.
 *
 * Credentials: KUBE_API_HOST + KUBE_API_TOKEN env vars, or stored via storeApiKey().
 * Health check: GET /healthz on the API server.
 *
 * payload.operation values: restart_pod | scale_deployment | rollback_deployment |
 *   get_pod_status | get_pod_logs | get_deployment_status | apply_manifest
 */

import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey }          from '../authManager.js';
import { AppError }                             from '../../core/errors/index.js';
import { logger }                               from '../../utils/logger.js';

const CONNECTOR_ID = 'kubernetes';

class KubernetesAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               CONNECTOR_ID,
      name:             'Kubernetes',
      capability:       Capability.OPERATIONS,
      authStrategy:     AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ, ActionType.EXECUTE, ActionType.HEALTH, ActionType.AUDIT,
      ],
      version: '1.0.0',
    });
  }

  // ── Credential resolution ───────────────────────────────────────────────────

  _getToken(workspaceId) {
    const cred = getCredentials(workspaceId, CONNECTOR_ID);
    if (cred?.apiKey) return cred.apiKey;
    const envToken = process.env.KUBE_API_TOKEN;
    if (envToken) return envToken;
    return null;
  }

  _getApiHost() {
    return process.env.KUBE_API_HOST ?? 'https://kubernetes.default.svc';
  }

  _buildHeaders(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    };
  }

  async _request(method, path, body, token) {
    const url = `${this._getApiHost()}${path}`;
    const opts = {
      method,
      headers:         this._buildHeaders(token),
      // k8s clusters often use self-signed certs in non-prod; accept in dev
      // In production, set NODE_EXTRA_CA_CERTS to the cluster CA bundle.
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AppError(`Kubernetes API error ${res.status}: ${text}`, res.status, 'KUBE_API_ERROR');
    }
    return res.status === 204 ? null : res.json();
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  async healthCheck(workspaceId) {
    const token = this._getToken(workspaceId);
    if (!token) {
      return { status: 'DEGRADED', detail: 'No credentials — set KUBE_API_TOKEN or store via /api/connectors/kubernetes/auth/initiate', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await this._request('GET', '/healthz', null, token);
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'DOWN', detail: err.message, latencyMs: Date.now() - start };
    }
  }

  // ── Auth (store PAT/token) ──────────────────────────────────────────────────

  async authenticate(workspaceId, { token }) {
    if (!token) throw new AppError('token is required', 400, 'MISSING_TOKEN');
    storeApiKey(workspaceId, CONNECTOR_ID, token, { type: 'bearer' });
    return { stored: true, connector: CONNECTOR_ID };
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async read(workspaceId, { namespace = 'default', resource, name }) {
    const token = this._getToken(workspaceId);
    if (!token) throw new ConnectorAuthError(CONNECTOR_ID);

    if (resource === 'pods' && name) {
      return this._request('GET', `/api/v1/namespaces/${namespace}/pods/${name}`, null, token);
    }
    if (resource === 'pods') {
      return this._request('GET', `/api/v1/namespaces/${namespace}/pods`, null, token);
    }
    if (resource === 'deployments' && name) {
      return this._request('GET', `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`, null, token);
    }
    if (resource === 'deployments') {
      return this._request('GET', `/apis/apps/v1/namespaces/${namespace}/deployments`, null, token);
    }
    throw new AppError(`Unsupported resource type: ${resource}`, 400, 'UNSUPPORTED_RESOURCE');
  }

  // ── Execute (side-effecting operations) ────────────────────────────────────

  async execute(workspaceId, actionType, payload, approvedBy) {
    this._requiresAction(actionType);
    const token = this._getToken(workspaceId);
    if (!token) throw new ConnectorAuthError(CONNECTOR_ID);

    const { operation } = payload;
    logger.info(`[KubernetesAdapter] execute: ${operation} (approvedBy=${approvedBy ?? 'governance'})`);

    switch (operation) {
      case 'restart_pod':          return this._restartPod(token, payload);
      case 'scale_deployment':     return this._scaleDeployment(token, payload);
      case 'rollback_deployment':  return this._rollbackDeployment(token, payload);
      case 'get_pod_status':       return this._getPodStatus(token, payload);
      case 'get_pod_logs':         return this._getPodLogs(token, payload);
      case 'get_deployment_status': return this._getDeploymentStatus(token, payload);
      case 'apply_manifest':       return this._applyManifest(token, payload);
      default:
        throw new AppError(`Unsupported operation: ${operation}`, 400, 'UNSUPPORTED_OPERATION');
    }
  }

  // ── Private operation handlers ──────────────────────────────────────────────

  async _restartPod(token, { namespace = 'default', podName }) {
    if (!podName) throw new AppError('podName is required', 400, 'MISSING_PARAM');
    // Delete the pod; its ReplicaSet will recreate it automatically
    await this._request('DELETE', `/api/v1/namespaces/${namespace}/pods/${podName}`, null, token);
    return { restarted: true, podName, namespace, restartedAt: new Date().toISOString() };
  }

  async _scaleDeployment(token, { namespace = 'default', deploymentName, replicas }) {
    if (!deploymentName) throw new AppError('deploymentName is required', 400, 'MISSING_PARAM');
    if (typeof replicas !== 'number') throw new AppError('replicas must be a number', 400, 'MISSING_PARAM');
    const patch = { spec: { replicas } };
    const result = await this._request(
      'PATCH',
      `/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`,
      patch,
      { ...this._buildHeaders(token), 'Content-Type': 'application/merge-patch+json' }
    );
    return { scaled: true, deploymentName, replicas, namespace };
  }

  async _rollbackDeployment(token, { namespace = 'default', deploymentName, revision }) {
    if (!deploymentName) throw new AppError('deploymentName is required', 400, 'MISSING_PARAM');
    // Trigger a rollback by patching the deployment annotation
    const patch = {
      spec: {
        template: {
          metadata: {
            annotations: {
              'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
              ...(revision ? { 'deployment.kubernetes.io/revision': String(revision) } : {}),
            },
          },
        },
      },
    };
    await this._request(
      'PATCH',
      `/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`,
      patch,
      token,
    );
    return { rolledBack: true, deploymentName, namespace, revision: revision ?? 'previous' };
  }

  async _getPodStatus(token, { namespace = 'default', podName }) {
    if (!podName) throw new AppError('podName is required', 400, 'MISSING_PARAM');
    const pod = await this._request('GET', `/api/v1/namespaces/${namespace}/pods/${podName}`, null, token);
    return {
      podName,
      namespace,
      phase:       pod.status?.phase,
      conditions:  pod.status?.conditions ?? [],
      containerStatuses: pod.status?.containerStatuses ?? [],
      startTime:   pod.status?.startTime,
    };
  }

  async _getPodLogs(token, { namespace = 'default', podName, container, tailLines = 100 }) {
    if (!podName) throw new AppError('podName is required', 400, 'MISSING_PARAM');
    const qs = new URLSearchParams({ tailLines: String(tailLines) });
    if (container) qs.set('container', container);
    const url = `/api/v1/namespaces/${namespace}/pods/${podName}/log?${qs}`;
    const rawUrl = `${this._getApiHost()}${url}`;
    const res = await fetch(rawUrl, { headers: this._buildHeaders(token) });
    if (!res.ok) throw new AppError(`Failed to get logs: ${res.status}`, res.status, 'KUBE_API_ERROR');
    const logs = await res.text();
    return { podName, namespace, logs, lines: logs.split('\n').length };
  }

  async _getDeploymentStatus(token, { namespace = 'default', deploymentName }) {
    if (!deploymentName) throw new AppError('deploymentName is required', 400, 'MISSING_PARAM');
    const dep = await this._request(
      'GET',
      `/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`,
      null, token
    );
    return {
      deploymentName,
      namespace,
      desiredReplicas:   dep.spec?.replicas ?? 0,
      readyReplicas:     dep.status?.readyReplicas ?? 0,
      availableReplicas: dep.status?.availableReplicas ?? 0,
      updatedReplicas:   dep.status?.updatedReplicas ?? 0,
      conditions:        dep.status?.conditions ?? [],
    };
  }

  async _applyManifest(token, { namespace = 'default', manifest }) {
    if (!manifest || typeof manifest !== 'object') throw new AppError('manifest object is required', 400, 'MISSING_PARAM');
    const kind = manifest.kind?.toLowerCase();
    const name = manifest.metadata?.name;
    if (!kind || !name) throw new AppError('manifest.kind and manifest.metadata.name are required', 400, 'INVALID_MANIFEST');

    const apiPath = kind === 'deployment' || kind === 'replicaset' || kind === 'statefulset'
      ? `/apis/apps/v1/namespaces/${namespace}/${kind}s/${name}`
      : `/api/v1/namespaces/${namespace}/${kind}s/${name}`;

    try {
      await this._request('PUT', apiPath, manifest, token);
      return { applied: true, kind, name, namespace };
    } catch {
      // Resource doesn't exist yet — create it
      const createPath = apiPath.replace(`/${name}`, '');
      await this._request('POST', createPath, manifest, token);
      return { applied: true, kind, name, namespace, created: true };
    }
  }
}

export default new KubernetesAdapter();
