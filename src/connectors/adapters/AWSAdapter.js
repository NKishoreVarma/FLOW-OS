/**
 * AWSAdapter — Cloud Infrastructure Connector
 *
 * Wraps AWS REST APIs using native fetch + SigV4 request signing.
 * No external SDK required — only Node.js built-in crypto.
 *
 * Credentials (resolved in priority order):
 *   1. Stored credential (JSON: { accessKeyId, secretAccessKey, sessionToken, region })
 *   2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION env vars
 *   3. DEGRADED health if neither present
 *
 * payload.operation values: update_ecs_service | rotate_secret |
 *   get_instance_health | describe_instances | get_secret_value |
 *   put_parameter | create_snapshot | describe_stacks
 */

import { createHmac, createHash } from 'crypto';
import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey }          from '../authManager.js';
import { AppError }                             from '../../core/errors/index.js';
import { logger }                               from '../../utils/logger.js';

const CONNECTOR_ID = 'aws';

// ── SigV4 signing (no external deps) ─────────────────────────────────────────

function _hmac(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function _hash(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function _sigV4Headers(method, url, body = '', service, region, accessKeyId, secretKey, sessionToken) {
  const parsed   = new URL(url);
  const datetime = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, 'Z');
  const date     = datetime.slice(0, 8);

  const canonicalHeaders = `host:${parsed.host}\nx-amz-date:${datetime}\n`;
  const signedHeaders    = 'host;x-amz-date';
  const payloadHash      = _hash(body);

  const canonicalRequest = [
    method,
    parsed.pathname,
    parsed.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credScope    = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credScope, _hash(canonicalRequest)].join('\n');

  const kDate    = _hmac(`AWS4${secretKey}`, date);
  const kRegion  = _hmac(kDate, region);
  const kService = _hmac(kRegion, service);
  const kSign    = _hmac(kService, 'aws4_request');
  const sig      = createHmac('sha256', kSign).update(stringToSign, 'utf8').digest('hex');

  const headers = {
    'x-amz-date':    datetime,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    'Content-Type':  'application/x-amz-json-1.1',
  };
  if (sessionToken) headers['x-amz-security-token'] = sessionToken;
  return headers;
}

class AWSAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               CONNECTOR_ID,
      name:             'AWS',
      capability:       Capability.OPERATIONS,
      authStrategy:     AuthStrategy.SERVICE_ACCOUNT,
      supportedActions: [
        ActionType.READ, ActionType.EXECUTE, ActionType.CREATE,
        ActionType.UPDATE, ActionType.HEALTH, ActionType.AUDIT,
      ],
      version: '1.0.0',
    });
  }

  _getCreds(workspaceId) {
    const stored = getCredentials(workspaceId, CONNECTOR_ID);
    if (stored?.keyJson) {
      try { return JSON.parse(stored.keyJson); } catch { /* fall through */ }
    }
    if (stored?.apiKey) {
      try { return JSON.parse(stored.apiKey); } catch { /* fall through */ }
    }
    if (process.env.AWS_ACCESS_KEY_ID) {
      return {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken:    process.env.AWS_SESSION_TOKEN ?? null,
        region:          process.env.AWS_REGION ?? 'us-east-1',
      };
    }
    return null;
  }

  _endpoint(service, region) {
    const overrides = { sts: 'sts.amazonaws.com' };
    return overrides[service] ?? `${service}.${region}.amazonaws.com`;
  }

  async _awsRequest(service, path, target, body, creds) {
    const region   = creds.region ?? 'us-east-1';
    const endpoint = this._endpoint(service, region);
    const url      = `https://${endpoint}${path}`;
    const bodyStr  = typeof body === 'string' ? body : JSON.stringify(body);

    const headers = _sigV4Headers(
      'POST', url, bodyStr, service, region,
      creds.accessKeyId, creds.secretAccessKey, creds.sessionToken
    );
    headers['x-amz-target'] = target;

    const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AppError(`AWS ${service} error ${res.status}: ${text}`, res.status, 'AWS_API_ERROR');
    }
    return res.json();
  }

  async healthCheck(workspaceId) {
    const creds = this._getCreds(workspaceId);
    if (!creds) {
      return { status: 'DEGRADED', detail: 'No credentials — set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      // STS GetCallerIdentity — lightweight, always accessible
      await this._awsRequest('sts', '/', 'AmazonSTS.GetCallerIdentity', '{}', creds);
      return { status: 'HEALTHY', region: creds.region, latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'DOWN', detail: err.message, latencyMs: Date.now() - start };
    }
  }

  async authenticate(workspaceId, { accessKeyId, secretAccessKey, sessionToken, region }) {
    if (!accessKeyId || !secretAccessKey) throw new AppError('accessKeyId and secretAccessKey are required', 400, 'MISSING_PARAM');
    storeApiKey(workspaceId, CONNECTOR_ID, JSON.stringify({ accessKeyId, secretAccessKey, sessionToken, region: region ?? 'us-east-1' }));
    return { stored: true, connector: CONNECTOR_ID };
  }

  async execute(workspaceId, actionType, payload, approvedBy) {
    this._requiresAction(actionType);
    const creds = this._getCreds(workspaceId);
    if (!creds) throw new ConnectorAuthError(CONNECTOR_ID);

    const { operation } = payload;
    logger.info(`[AWSAdapter] execute: ${operation} (approvedBy=${approvedBy ?? 'governance'})`);

    switch (operation) {
      case 'update_ecs_service':  return this._updateECSService(creds, payload);
      case 'rotate_secret':       return this._rotateSecret(creds, payload);
      case 'get_instance_health': return this._getInstanceHealth(creds, payload);
      case 'describe_instances':  return this._describeInstances(creds, payload);
      case 'get_secret_value':    return this._getSecretValue(creds, payload);
      case 'put_parameter':       return this._putParameter(creds, payload);
      case 'create_snapshot':     return this._createSnapshot(creds, payload);
      case 'describe_stacks':     return this._describeStacks(creds, payload);
      default:
        throw new AppError(`Unsupported operation: ${operation}`, 400, 'UNSUPPORTED_OPERATION');
    }
  }

  async _updateECSService(creds, { cluster, service, desiredCount, taskDefinition }) {
    if (!cluster) throw new AppError('cluster is required', 400, 'MISSING_PARAM');
    if (!service) throw new AppError('service is required', 400, 'MISSING_PARAM');
    const body = { cluster, service };
    if (typeof desiredCount === 'number') body.desiredCount = desiredCount;
    if (taskDefinition) body.taskDefinition = taskDefinition;

    const r = await this._awsRequest('ecs', '/', 'AmazonEC2ContainerServiceV20141113.UpdateService', body, creds);
    return {
      cluster,
      service:        r.service?.serviceName,
      status:         r.service?.status,
      desiredCount:   r.service?.desiredCount,
      runningCount:   r.service?.runningCount,
      pendingCount:   r.service?.pendingCount,
      taskDefinition: r.service?.taskDefinition,
    };
  }

  async _rotateSecret(creds, { secretId, rotationLambdaARN }) {
    if (!secretId) throw new AppError('secretId is required', 400, 'MISSING_PARAM');
    const body = { SecretId: secretId };
    if (rotationLambdaARN) body.RotationLambdaARN = rotationLambdaARN;
    const r = await this._awsRequest('secretsmanager', '/', 'secretsmanager.RotateSecret', body, creds);
    return { secretId, rotationToken: r.VersionId, rotatedAt: new Date().toISOString() };
  }

  async _getInstanceHealth(creds, { instanceIds }) {
    if (!instanceIds?.length) throw new AppError('instanceIds array is required', 400, 'MISSING_PARAM');
    const body = { InstanceIds: instanceIds };
    const r = await this._awsRequest('ec2', '/', 'AmazonEC2.DescribeInstanceStatus', body, creds);
    return {
      instances: (r.InstanceStatuses ?? []).map(s => ({
        instanceId:    s.InstanceId,
        state:         s.InstanceState?.Name,
        systemStatus:  s.SystemStatus?.Status,
        instanceStatus: s.InstanceStatus?.Status,
        availabilityZone: s.AvailabilityZone,
      })),
    };
  }

  async _describeInstances(creds, { instanceIds, filters } = {}) {
    const body = {};
    if (instanceIds?.length) body.InstanceIds = instanceIds;
    if (filters?.length)     body.Filters     = filters;
    const r = await this._awsRequest('ec2', '/', 'AmazonEC2.DescribeInstances', body, creds);
    const instances = (r.Reservations ?? []).flatMap(res =>
      (res.Instances ?? []).map(i => ({
        instanceId:       i.InstanceId,
        instanceType:     i.InstanceType,
        state:            i.State?.Name,
        publicDnsName:    i.PublicDnsName,
        privateIpAddress: i.PrivateIpAddress,
        launchTime:       i.LaunchTime,
        tags:             i.Tags ?? [],
      }))
    );
    return { instances };
  }

  async _getSecretValue(creds, { secretId, versionId }) {
    if (!secretId) throw new AppError('secretId is required', 400, 'MISSING_PARAM');
    const body = { SecretId: secretId };
    if (versionId) body.VersionId = versionId;
    const r = await this._awsRequest('secretsmanager', '/', 'secretsmanager.GetSecretValue', body, creds);
    return { secretId, versionId: r.VersionId, createdAt: r.CreatedDate };
  }

  async _putParameter(creds, { name, value, type = 'SecureString', overwrite = true }) {
    if (!name || !value) throw new AppError('name and value are required', 400, 'MISSING_PARAM');
    const body = { Name: name, Value: value, Type: type, Overwrite: overwrite };
    const r = await this._awsRequest('ssm', '/', 'AmazonSSM.PutParameter', body, creds);
    return { name, version: r.Version, tier: r.Tier, updatedAt: new Date().toISOString() };
  }

  async _createSnapshot(creds, { volumeId, description, tags = [] }) {
    if (!volumeId) throw new AppError('volumeId is required', 400, 'MISSING_PARAM');
    const body = {
      VolumeId:    volumeId,
      Description: description ?? `FLOW backup ${new Date().toISOString()}`,
      TagSpecifications: tags.length ? [{ ResourceType: 'snapshot', Tags: tags }] : [],
    };
    const r = await this._awsRequest('ec2', '/', 'AmazonEC2.CreateSnapshot', body, creds);
    return { snapshotId: r.SnapshotId, volumeId, state: r.State, startTime: r.StartTime };
  }

  async _describeStacks(creds, { stackName }) {
    const body = stackName ? { StackName: stackName } : {};
    const r = await this._awsRequest('cloudformation', '/', 'CloudFormation.DescribeStacks', body, creds);
    return { stacks: r.Stacks ?? [] };
  }
}

export default new AWSAdapter();
