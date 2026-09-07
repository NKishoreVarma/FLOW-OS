/**
 * FLOW OS — Resilient HTTP fetch for connector adapters.
 * Provides: AbortController timeout, exponential-backoff retry on transient errors,
 * rate-limit header awareness, and structured error codes.
 */

import { logger } from '../utils/logger.js';
import { AppError } from '../core/errors/index.js';

export const CONNECTOR_TIMEOUT_MS = parseInt(process.env.CONNECTOR_TIMEOUT_MS || '15000', 10);
const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 500;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/**
 * Exponential backoff with full jitter. Capped at 30 s.
 */
function jitteredDelay(attempt) {
  const cap = 30_000;
  const base = Math.min(cap, BASE_DELAY_MS * Math.pow(2, attempt));
  return Math.random() * base;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch with timeout + structured retry for connector adapters.
 *
 * @param {string} url
 * @param {RequestInit} options   — standard fetch options
 * @param {object}  fetchOpts
 * @param {number}  [fetchOpts.timeoutMs]   — per-request timeout (default CONNECTOR_TIMEOUT_MS)
 * @param {number}  [fetchOpts.maxRetries]  — max retries (default MAX_RETRIES)
 * @param {string}  [fetchOpts.connector]   — for logging
 * @returns {Promise<Response>}             — the raw Response (caller handles JSON parse + status check)
 */
export async function resilientFetch(url, options = {}, { timeoutMs = CONNECTOR_TIMEOUT_MS, maxRetries = MAX_RETRIES, connector = 'connector' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);

      // Success — return immediately
      if (res.ok) return res;

      // Auth expired — do NOT retry
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(
          new AppError(body.message || 'Connector authentication expired. Reconnect required.', 401, 'CONNECTOR_AUTH_EXPIRED'),
          { retryable: false }
        );
      }

      // Rate limit — respect retry-after header
      if (res.status === 429) {
        const retryAfterSec = parseFloat(res.headers.get('retry-after') || '0');
        const resetAt = res.headers.get('x-ratelimit-reset');
        const waitMs = retryAfterSec > 0
          ? retryAfterSec * 1000
          : resetAt ? Math.max(0, parseInt(resetAt, 10) * 1000 - Date.now()) + 500
          : jitteredDelay(attempt);
        if (attempt < maxRetries) {
          logger.warn(`[${connector}] Rate limited (429). Waiting ${Math.round(waitMs)}ms before retry ${attempt + 1}/${maxRetries}.`);
          await sleep(waitMs);
          continue;
        }
        const body = await res.json().catch(() => ({}));
        throw Object.assign(
          new AppError(body.message || `${connector} API rate limit exceeded.`, 429, 'CONNECTOR_RATE_LIMITED'),
          { retryable: false }
        );
      }

      // Transient server error — retry
      if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
        const waitMs = jitteredDelay(attempt);
        logger.warn(`[${connector}] Transient error ${res.status}. Retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs)}ms.`);
        await sleep(waitMs);
        continue;
      }

      // Non-retryable error — return raw response so caller handles body + status
      return res;

    } catch (err) {
      clearTimeout(timer);
      if (err.retryable === false) throw err; // auth-expired / rate-limited already classified
      if (err.name === 'AbortError') {
        lastErr = Object.assign(
          new AppError(`${connector} API request timed out after ${timeoutMs}ms.`, 504, 'CONNECTOR_TIMEOUT'),
          { retryable: true }
        );
      } else {
        lastErr = err;
      }
      if (attempt < maxRetries) {
        const waitMs = jitteredDelay(attempt);
        logger.warn(`[${connector}] Network error: ${lastErr.message}. Retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs)}ms.`);
        await sleep(waitMs);
      }
    }
  }
  throw lastErr ?? new AppError(`${connector} request failed after ${maxRetries} retries.`, 502, 'CONNECTOR_UNAVAILABLE');
}
