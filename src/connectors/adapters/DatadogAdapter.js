/**
 * DatadogAdapter — Infrastructure Observability Connector
 *
 * Wraps the Datadog REST API v1/v2 using native fetch.
 *
 * Credentials: DD_API_KEY + DD_APP_KEY env vars, or stored via storeApiKey()
 *   (store as JSON: { apiKey, appKey }).
 * Health check: GET /api/v1/validate
 *
 * payload.operation values: get_alert_details | list_active_monitors |
 *   mute_monitor | unmute_monitor | post_event | get_metrics | get_dashboard
 */

import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey }          from '../authManager.js';
import { AppError }                             from '../../core/errors/index.js';
import { logger }                               from '../../utils/logger.js';

const CONNECTOR_ID = 'datadog';
const DD_API_BASE  = 'https://api.datadoghq.com';

class DatadogAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               CONNECTOR_ID,
      name:             'Datadog',
      capability:       Capability.OPERATIONS,
      authStrategy:     AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ, ActionType.SEARCH, ActionType.EXECUTE,
        ActionType.CREATE, ActionType.HEALTH, ActionType.AUDIT,
      ],
      version: '1.0.0',
    });
  }

  _getCreds(workspaceId) {
    const stored = getCredentials(workspaceId, CONNECTOR_ID);
    if (stored?.apiKey) {
      try {
        const parsed = JSON.parse(stored.apiKey);
        return { apiKey: parsed.apiKey, appKey: parsed.appKey };
      } catch {
        return { apiKey: stored.apiKey, appKey: stored.meta?.appKey };
      }
    }
    return {
      apiKey: process.env.DD_API_KEY,
      appKey: process.env.DD_APP_KEY,
    };
  }

  _buildHeaders({ apiKey, appKey }) {
    return {
      'DD-API-KEY':         apiKey,
      'DD-APPLICATION-KEY': appKey,
      'Content-Type':       'application/json',
    };
  }

  async _request(method, path, body, creds) {
    const url = `${DD_API_BASE}${path}`;
    const opts = { method, headers: this._buildHeaders(creds) };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AppError(`Datadog API error ${res.status}: ${text}`, res.status, 'DD_API_ERROR');
    }
    return res.status === 204 ? null : res.json();
  }

  async healthCheck(workspaceId) {
    const creds = this._getCreds(workspaceId);
    if (!creds.apiKey) {
      return { status: 'DEGRADED', detail: 'No credentials — set DD_API_KEY + DD_APP_KEY', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await this._request('GET', '/api/v1/validate', null, creds);
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'DOWN', detail: err.message, latencyMs: Date.now() - start };
    }
  }

  async authenticate(workspaceId, { apiKey, appKey }) {
    if (!apiKey) throw new AppError('apiKey is required', 400, 'MISSING_PARAM');
    if (!appKey) throw new AppError('appKey is required', 400, 'MISSING_PARAM');
    storeApiKey(workspaceId, CONNECTOR_ID, JSON.stringify({ apiKey, appKey }), { appKey });
    return { stored: true, connector: CONNECTOR_ID };
  }

  async read(workspaceId, options) {
    const creds = this._getCreds(workspaceId);
    if (!creds.apiKey) throw new ConnectorAuthError(CONNECTOR_ID);

    const { resource, monitorId, query, from, to } = options;

    if (resource === 'monitor' && monitorId) {
      return this._request('GET', `/api/v1/monitor/${monitorId}`, null, creds);
    }
    if (resource === 'monitors') {
      return this._request('GET', '/api/v1/monitor', null, creds);
    }
    if (resource === 'metrics' && query) {
      const qs = new URLSearchParams({ query, from: from ?? String(Math.floor(Date.now()/1000) - 3600), to: to ?? String(Math.floor(Date.now()/1000)) });
      return this._request('GET', `/api/v1/query?${qs}`, null, creds);
    }
    throw new AppError(`Unsupported resource: ${resource}`, 400, 'UNSUPPORTED_RESOURCE');
  }

  async execute(workspaceId, actionType, payload, approvedBy) {
    this._requiresAction(actionType);
    const creds = this._getCreds(workspaceId);
    if (!creds.apiKey) throw new ConnectorAuthError(CONNECTOR_ID);

    const { operation } = payload;
    logger.info(`[DatadogAdapter] execute: ${operation}`);

    switch (operation) {
      case 'get_alert_details':    return this._getAlertDetails(creds, payload);
      case 'list_active_monitors': return this._listActiveMonitors(creds, payload);
      case 'mute_monitor':         return this._muteMonitor(creds, payload);
      case 'unmute_monitor':       return this._unmuteMonitor(creds, payload);
      case 'post_event':           return this._postEvent(creds, payload);
      case 'get_metrics':          return this._getMetrics(creds, payload);
      default:
        throw new AppError(`Unsupported operation: ${operation}`, 400, 'UNSUPPORTED_OPERATION');
    }
  }

  async _getAlertDetails(creds, { alertId, monitorId }) {
    const id = monitorId ?? alertId;
    if (!id) throw new AppError('monitorId/alertId is required', 400, 'MISSING_PARAM');
    const monitor = await this._request('GET', `/api/v1/monitor/${id}`, null, creds);
    return {
      alertId:   String(id),
      monitorId: String(id),
      name:      monitor.name,
      status:    monitor.overall_state,
      type:      monitor.type,
      message:   monitor.message,
      tags:      monitor.tags ?? [],
      query:     monitor.query,
      created:   monitor.created,
      modified:  monitor.modified,
    };
  }

  async _listActiveMonitors(creds, { alerting = true } = {}) {
    const qs = alerting ? '?monitor_states=Alert,Warn,No Data' : '';
    const result = await this._request('GET', `/api/v1/monitor${qs}`, null, creds);
    const monitors = Array.isArray(result) ? result : (result.monitors ?? []);
    return {
      monitors: monitors.map(m => ({
        id:     m.id,
        name:   m.name,
        status: m.overall_state,
        type:   m.type,
        tags:   m.tags,
      })),
      count: monitors.length,
    };
  }

  async _muteMonitor(creds, { monitorId, end, message }) {
    if (!monitorId) throw new AppError('monitorId is required', 400, 'MISSING_PARAM');
    const body = {};
    if (end)     body.end = end;
    if (message) body.message = message;
    await this._request('POST', `/api/v1/monitor/${monitorId}/mute`, body, creds);
    return { muted: true, monitorId, mutedAt: new Date().toISOString(), end: end ?? null };
  }

  async _unmuteMonitor(creds, { monitorId }) {
    if (!monitorId) throw new AppError('monitorId is required', 400, 'MISSING_PARAM');
    await this._request('POST', `/api/v1/monitor/${monitorId}/unmute`, {}, creds);
    return { unmuted: true, monitorId, unmutedAt: new Date().toISOString() };
  }

  async _postEvent(creds, { title, text, alertType = 'info', tags = [], priority = 'normal' }) {
    if (!title) throw new AppError('title is required', 400, 'MISSING_PARAM');
    const body = { title, text: text ?? title, alert_type: alertType, tags, priority };
    const result = await this._request('POST', '/api/v1/events', body, creds);
    return { eventId: result.event?.id, title, postedAt: new Date().toISOString() };
  }

  async _getMetrics(creds, { query, from, to }) {
    if (!query) throw new AppError('query is required', 400, 'MISSING_PARAM');
    const now = Math.floor(Date.now() / 1000);
    const qs  = new URLSearchParams({
      query,
      from: String(from ?? now - 3600),
      to:   String(to  ?? now),
    });
    const result = await this._request('GET', `/api/v1/query?${qs}`, null, creds);
    return {
      query,
      series:      result.series ?? [],
      fromTs:      result.from_date,
      toTs:        result.to_date,
      status:      result.status,
    };
  }
}

export default new DatadogAdapter();
