/**
 * PagerDutyAdapter — Incident Management Connector
 *
 * Wraps the PagerDuty REST API v2 using native fetch.
 *
 * Credentials: PD_API_KEY env var (write-level API key) or stored via storeApiKey().
 * Health check: GET /users/me
 *
 * payload.operation values: create_incident | resolve_incident |
 *   acknowledge_incident | add_note | list_incidents | get_incident
 */

import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey }          from '../authManager.js';
import { AppError }                             from '../../core/errors/index.js';
import { logger }                               from '../../utils/logger.js';

const CONNECTOR_ID = 'pagerduty';
const PD_API_BASE  = 'https://api.pagerduty.com';

class PagerDutyAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               CONNECTOR_ID,
      name:             'PagerDuty',
      capability:       Capability.OPERATIONS,
      authStrategy:     AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ, ActionType.CREATE, ActionType.UPDATE,
        ActionType.EXECUTE, ActionType.HEALTH, ActionType.AUDIT,
      ],
      version: '1.0.0',
    });
  }

  _getKey(workspaceId) {
    const cred = getCredentials(workspaceId, CONNECTOR_ID);
    return cred?.apiKey ?? process.env.PD_API_KEY ?? null;
  }

  _headers(key, email) {
    const h = {
      'Authorization':  `Token token=${key}`,
      'Content-Type':   'application/json',
      'Accept':         'application/vnd.pagerduty+json;version=2',
    };
    if (email) h['From'] = email;
    return h;
  }

  async _request(method, path, body, key, fromEmail) {
    const url = `${PD_API_BASE}${path}`;
    const opts = { method, headers: this._headers(key, fromEmail) };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AppError(`PagerDuty API error ${res.status}: ${text}`, res.status, 'PD_API_ERROR');
    }
    return res.status === 204 ? null : res.json();
  }

  async healthCheck(workspaceId) {
    const key = this._getKey(workspaceId);
    if (!key) {
      return { status: 'DEGRADED', detail: 'No credentials — set PD_API_KEY', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await this._request('GET', '/users/me', null, key);
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'DOWN', detail: err.message, latencyMs: Date.now() - start };
    }
  }

  async authenticate(workspaceId, { apiKey }) {
    if (!apiKey) throw new AppError('apiKey is required', 400, 'MISSING_PARAM');
    storeApiKey(workspaceId, CONNECTOR_ID, apiKey);
    return { stored: true, connector: CONNECTOR_ID };
  }

  async read(workspaceId, options) {
    const key = this._getKey(workspaceId);
    if (!key) throw new ConnectorAuthError(CONNECTOR_ID);
    const { resource, incidentId, limit = 10, statuses } = options;

    if (resource === 'incident' && incidentId) {
      const r = await this._request('GET', `/incidents/${incidentId}`, null, key);
      return r.incident;
    }
    if (resource === 'incidents') {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (statuses) statuses.forEach(s => qs.append('statuses[]', s));
      const r = await this._request('GET', `/incidents?${qs}`, null, key);
      return { incidents: r.incidents, total: r.total };
    }
    throw new AppError(`Unsupported resource: ${resource}`, 400, 'UNSUPPORTED_RESOURCE');
  }

  async execute(workspaceId, actionType, payload, approvedBy) {
    this._requiresAction(actionType);
    const key = this._getKey(workspaceId);
    if (!key) throw new ConnectorAuthError(CONNECTOR_ID);

    const { operation } = payload;
    logger.info(`[PagerDutyAdapter] execute: ${operation}`);

    switch (operation) {
      case 'create_incident':     return this._createIncident(key, payload);
      case 'resolve_incident':    return this._updateIncident(key, payload, 'resolved');
      case 'acknowledge_incident': return this._updateIncident(key, payload, 'acknowledged');
      case 'add_note':            return this._addNote(key, payload);
      case 'list_incidents':      return this._listIncidents(key, payload);
      case 'get_incident':        return this._getIncident(key, payload);
      default:
        throw new AppError(`Unsupported operation: ${operation}`, 400, 'UNSUPPORTED_OPERATION');
    }
  }

  async _createIncident(key, { title, serviceId, urgency = 'high', details, fromEmail }) {
    if (!title)     throw new AppError('title is required', 400, 'MISSING_PARAM');
    if (!serviceId) throw new AppError('serviceId is required', 400, 'MISSING_PARAM');
    if (!fromEmail && !process.env.PD_FROM_EMAIL) {
      throw new AppError('fromEmail (or PD_FROM_EMAIL env) is required by PagerDuty API', 400, 'MISSING_PARAM');
    }
    const body = {
      incident: {
        type: 'incident',
        title,
        service:  { id: serviceId, type: 'service_reference' },
        urgency,
        body:     details ? { type: 'incident_body', details } : undefined,
      },
    };
    const r = await this._request('POST', '/incidents', body, key, fromEmail ?? process.env.PD_FROM_EMAIL);
    return {
      incidentId:     r.incident.id,
      incidentNumber: r.incident.incident_number,
      status:         r.incident.status,
      urgency:        r.incident.urgency,
      title:          r.incident.title,
      htmlUrl:        r.incident.html_url,
      createdAt:      r.incident.created_at,
    };
  }

  async _updateIncident(key, { incidentId, fromEmail, resolution }, status) {
    if (!incidentId) throw new AppError('incidentId is required', 400, 'MISSING_PARAM');
    const body = {
      incident: {
        type:   'incident',
        status,
        ...(resolution ? { resolution } : {}),
      },
    };
    const r = await this._request('PUT', `/incidents/${incidentId}`, body, key, fromEmail ?? process.env.PD_FROM_EMAIL);
    return {
      incidentId,
      status:    r.incident.status,
      updatedAt: r.incident.updated_at,
    };
  }

  async _addNote(key, { incidentId, note, fromEmail }) {
    if (!incidentId) throw new AppError('incidentId is required', 400, 'MISSING_PARAM');
    if (!note)       throw new AppError('note is required', 400, 'MISSING_PARAM');
    const body = { note: { content: note } };
    const r = await this._request('POST', `/incidents/${incidentId}/notes`, body, key, fromEmail ?? process.env.PD_FROM_EMAIL);
    return { noteId: r.note?.id, incidentId, content: note, createdAt: r.note?.created_at };
  }

  async _listIncidents(key, { statuses = ['triggered', 'acknowledged'], limit = 20 }) {
    const qs = new URLSearchParams({ limit: String(limit) });
    statuses.forEach(s => qs.append('statuses[]', s));
    const r = await this._request('GET', `/incidents?${qs}`, null, key);
    return { incidents: r.incidents ?? [], total: r.total };
  }

  async _getIncident(key, { incidentId }) {
    if (!incidentId) throw new AppError('incidentId is required', 400, 'MISSING_PARAM');
    const r = await this._request('GET', `/incidents/${incidentId}`, null, key);
    return r.incident;
  }
}

export default new PagerDutyAdapter();
