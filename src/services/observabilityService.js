/**
 * FLOW OS — Centralized Observability & Telemetry Service
 * 
 * Tracks ingestion pipeline execution, multi-agent query traces,
 * service health indicators, and rolling metrics.
 */

import { broadcastToWorkspace } from './socketService.js';
import { estimateTokens, calculateCost } from '../observability/tokenCounter.js';

// --- In-Memory Traces & Registries ---
export const ingestionTraces = new Map();
export const queryTraces = [];
export const serviceHealth = new Map();

// --- Rolling System Metrics ---
export const liveMetrics = {
  ingestionsPerSec: 0,
  queriesPerSec: 0,
  totalIngestions: 0,
  totalQueries: 0,
  avgLatencyMs: 0,
  embeddingTimeMs: 0,
  vectorSearchTimeMs: 0,
  llmTimeMs: 0,
  memoryTimeMs: 0,
  totalChunks: 0,
  totalNodes: 0,
  totalDecisions: 0,
  totalIncidents: 0
};

// --- Execution counters for trace ID generation ---
let ingestionCounter = 0;
let queryCounter = 0;

// Rate calculations trackers
let lastSecondIngestions = 0;
let lastSecondQueries = 0;
setInterval(() => {
  liveMetrics.ingestionsPerSec = lastSecondIngestions;
  liveMetrics.queriesPerSec = lastSecondQueries;
  lastSecondIngestions = 0;
  lastSecondQueries = 0;
}, 1000);

/**
 * Generates a unique ingestion trace ID: FLOW-YYYYMMDD-XXXXXX
 */
export function generateTraceId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  ingestionCounter++;
  const padded = String(ingestionCounter).padStart(6, '0');
  return `FLOW-${dateStr}-${padded}`;
}

/**
 * Generates a unique query trace ID: QUERY-YYYYMMDD-XXXXXX
 */
export function generateQueryTraceId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  queryCounter++;
  const padded = String(queryCounter).padStart(6, '0');
  return `QUERY-${dateStr}-${padded}`;
}

// --- Telemetry Lifecycle Helpers ---

/**
 * Initializes a new ingestion pipeline trace.
 */
export function startIngestionTrace(traceId, payload) {
  lastSecondIngestions++;
  liveMetrics.totalIngestions++;
  
  const trace = {
    traceId,
    workspaceId: payload.workspaceId || 'unknown',
    platform: payload.platform || 'unknown',
    sender: payload.sender || 'unknown',
    channel: payload.channel || 'unknown',
    timestamp: new Date().toISOString(),
    status: 'PROCESSING',
    stages: {}
  };
  
  ingestionTraces.set(traceId, trace);
  
  // Broadcast start event to websocket
  broadcastToWorkspace(trace.workspaceId, 'INGESTION_START', { traceId, payload });
  return trace;
}

/**
 * Updates a specific stage in the ingestion pipeline trace.
 * Stages: Parser, Privacy Gate, Importance, Entity Extractor, Graph, Embedding, Vector Store, Memory, Decision Engine, Incident Engine, Summary
 */
export function updateIngestionTrace(traceId, stage, eventType, data = {}) {
  const trace = ingestionTraces.get(traceId);
  if (!trace) return;

  const timestamp = new Date().toISOString();
  
  if (!trace.stages[stage]) {
    trace.stages[stage] = {
      stage,
      status: 'START',
      startedAt: timestamp,
      completedAt: null,
      latencyMs: 0,
      input: null,
      output: null,
      errors: null,
      metadata: {}
    };
  }

  const stageData = trace.stages[stage];
  stageData.status = eventType; // START, PROCESSING, SUCCESS, FAILED

  if (data.input !== undefined) stageData.input = data.input;
  if (data.output !== undefined) stageData.output = data.output;
  if (data.metadata !== undefined) stageData.metadata = { ...stageData.metadata, ...data.metadata };
  if (data.error !== undefined) {
    stageData.errors = data.error;
    stageData.status = 'FAILED';
  }

  if (eventType === 'SUCCESS' || eventType === 'FAILED') {
    stageData.completedAt = timestamp;
    stageData.latencyMs = new Date(timestamp) - new Date(stageData.startedAt);
    
    // Log service metrics automatically
    recordServiceExecution(stage, stageData.latencyMs, eventType === 'SUCCESS', stageData.errors);
  }

  // Update overall trace status
  if (stage === 'Complete') {
    trace.status = eventType;
    // Calculate composite latency
    const startStage = trace.stages['Parser'] || Object.values(trace.stages)[0];
    if (startStage) {
      const duration = new Date(timestamp) - new Date(startStage.startedAt);
      liveMetrics.avgLatencyMs = Math.round((liveMetrics.avgLatencyMs * 9 + duration) / 10);
    }
  }

  // Live broadcast updates
  broadcastToWorkspace(trace.workspaceId, 'TRACE_STAGE_UPDATE', {
    traceId,
    stage,
    eventType,
    stageData
  });
}

/**
 * Initializes a new query context trace.
 */
export function startQueryTrace(queryTraceId, workspaceId, queryText) {
  lastSecondQueries++;
  liveMetrics.totalQueries++;
  
  const trace = {
    queryTraceId,
    workspaceId,
    queryText,
    timestamp: new Date().toISOString(),
    status: 'PROCESSING',
    stages: {},
    finalAnswer: null
  };

  queryTraces.unshift(trace);
  if (queryTraces.length > 100) queryTraces.pop();

  broadcastToWorkspace(workspaceId, 'QUERY_TRACE_START', { queryTraceId, queryText });
  return trace;
}

/**
 * Updates a specific stage in a query reasoning trace.
 */
export function updateQueryTrace(queryTraceId, stage, eventType, data = {}) {
  const trace = queryTraces.find(t => t.queryTraceId === queryTraceId);
  if (!trace) return;

  const timestamp = new Date().toISOString();

  if (!trace.stages[stage]) {
    trace.stages[stage] = {
      stage,
      status: 'START',
      startedAt: timestamp,
      completedAt: null,
      latencyMs: 0,
      input: null,
      output: null,
      errors: null,
      metadata: {}
    };
  }

  const stageData = trace.stages[stage];
  stageData.status = eventType;

  if (data.input !== undefined) stageData.input = data.input;
  if (data.output !== undefined) stageData.output = data.output;
  if (data.metadata !== undefined) stageData.metadata = { ...stageData.metadata, ...data.metadata };
  if (data.error !== undefined) {
    stageData.errors = data.error;
    stageData.status = 'FAILED';
  }

  if (eventType === 'SUCCESS' || eventType === 'FAILED') {
    stageData.completedAt = timestamp;
    stageData.latencyMs = new Date(timestamp) - new Date(stageData.startedAt);
    
    // Accumulate metrics timing
    if (stage === 'Embedding Query') liveMetrics.embeddingTimeMs = stageData.latencyMs;
    if (stage === 'Vector Search') liveMetrics.vectorSearchTimeMs = stageData.latencyMs;
    if (stage === 'Executive Synthesis') liveMetrics.llmTimeMs = stageData.latencyMs;
    if (stage === 'Memory Boost') liveMetrics.memoryTimeMs = stageData.latencyMs;

    recordServiceExecution(stage, stageData.latencyMs, eventType === 'SUCCESS', stageData.errors);

    // Calculate prompt/completion tokens and estimated cost for LLM synthesis
    if (stage === 'Executive Synthesis' && eventType === 'SUCCESS') {
      const prompt = String(data.input || '');
      const completion = typeof data.output === 'string' ? data.output : JSON.stringify(data.output || '');
      const inputTokens = estimateTokens(prompt);
      const outputTokens = estimateTokens(completion);
      const cost = calculateCost(inputTokens, outputTokens, 'gemini-2.5-flash');
      stageData.metadata.inputTokens = inputTokens;
      stageData.metadata.outputTokens = outputTokens;
      stageData.metadata.costUSD = cost;
      console.log(`\x1b[35m[Accounting]\x1b[0m Gemini Prompt Tokens: ${inputTokens} | Completion Tokens: ${outputTokens} | Estimated Cost: $${cost.toFixed(6)}`);
    }
  }

  if (stage === 'Final Answer') {
    trace.status = eventType;
    trace.finalAnswer = data.output;
  }

  broadcastToWorkspace(trace.workspaceId, 'QUERY_STAGE_UPDATE', {
    queryTraceId,
    stage,
    eventType,
    stageData
  });
}

/**
 * Records execution statistics for health dashboard metrics.
 */
export function recordServiceExecution(serviceName, latencyMs, success, error = null) {
  if (!serviceHealth.has(serviceName)) {
    serviceHealth.set(serviceName, {
      name: serviceName,
      status: 'healthy', // healthy, degraded, offline
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      avgLatencyMs: 0,
      lastExecution: null,
      lastError: null
    });
  }

  const stat = serviceHealth.get(serviceName);
  stat.totalExecutions++;
  if (success) {
    stat.successCount++;
  } else {
    stat.failureCount++;
    stat.lastError = error;
  }

  stat.lastExecution = new Date().toISOString();
  stat.avgLatencyMs = Math.round((stat.avgLatencyMs * 9 + latencyMs) / 10);

  // Status mapping logic
  const failureRate = stat.failureCount / stat.totalExecutions;
  if (stat.totalExecutions > 3 && failureRate > 0.3) {
    stat.status = 'offline';
  } else if (stat.totalExecutions > 3 && (failureRate > 0.05 || stat.avgLatencyMs > 2500)) {
    stat.status = 'degraded';
  } else {
    stat.status = 'healthy';
  }

  // Print ANSI-colored telemetry console logs
  const statusColor = success ? '\x1b[32mPASS\x1b[0m' : `\x1b[31mFAIL (${error ? (error.message || error) : 'unknown'})\x1b[0m`;
  console.log(`\x1b[36m[Telemetry]\x1b[0m ${serviceName} executed in ${latencyMs}ms -> ${statusColor}`);
}

/**
 * Getter for system health report
 */
export function getHealthReport() {
  const report = {};
  const standardServices = [
    'Parser', 'Privacy Gate', 'Importance', 'Entity Extractor', 
    'Knowledge Graph', 'Embedding Query', 'Vector Search', 'Vector Store', 
    'Memory', 'Decision Engine', 'Incident Engine', 'Summary', 'Executive Synthesis'
  ];

  for (const s of standardServices) {
    if (serviceHealth.has(s)) {
      report[s] = serviceHealth.get(s);
    } else {
      report[s] = {
        name: s,
        status: 'healthy', // assume healthy until execution
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        lastExecution: null,
        lastError: null
      };
    }
  }
  return report;
}

export default {
  ingestionTraces,
  queryTraces,
  serviceHealth,
  liveMetrics,
  generateTraceId,
  generateQueryTraceId,
  startIngestionTrace,
  updateIngestionTrace,
  startQueryTrace,
  updateQueryTrace,
  recordServiceExecution,
  getHealthReport
};
