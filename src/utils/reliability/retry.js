/**
 * FLOW OS — Reliability, Retry, Circuit Breaker, & Fallback Utilities
 */

/**
 * Calculates exponential backoff delay with optional jitter.
 *
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} initialDelayMs - Base delay in milliseconds
 * @param {number} factor - Exponential scaling factor
 * @param {boolean} jitter - Whether to apply random jitter
 * @returns {number} calculated delay in ms
 */
export function getBackoffDelay(attempt, initialDelayMs = 500, factor = 2, jitter = true) {
  const base = initialDelayMs * Math.pow(factor, attempt);
  if (!jitter) return base;
  // Apply random jitter between 0 and base delay
  return Math.random() * base;
}

/**
 * Delay execution for a given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes a promise-returning function with a timeout limit.
 *
 * @param {() => Promise<any>} fn - Async function to run
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<any>}
 */
export function withTimeout(fn, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * High-order decorator to run async operations with configurable retry parameters.
 *
 * @param {() => Promise<any>} fn - The operation to perform
 * @param {Object} options
 * @param {number} options.maxAttempts - Maximum run executions
 * @param {number} options.initialDelayMs - Initial delay before first retry
 * @param {number} options.factor - Backoff factor
 * @param {number} options.timeoutMs - Timeout per single attempt (optional)
 * @param {(err: Error) => boolean} options.shouldRetry - Evaluator to filter retriable errors
 * @returns {Promise<any>}
 */
export async function runWithRetry(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const initialDelayMs = options.initialDelayMs || 500;
  const factor = options.factor || 2;
  const timeoutMs = options.timeoutMs || 0;
  const shouldRetry = options.shouldRetry || (() => true);

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (timeoutMs > 0) {
        return await withTimeout(fn, timeoutMs);
      } else {
        return await fn();
      }
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1 && shouldRetry(err)) {
        const sleepTime = getBackoffDelay(attempt, initialDelayMs, factor);
        console.warn(`[Retry] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${Math.round(sleepTime)}ms...`);
        await delay(sleepTime);
      }
    }
  }

  throw new Error(`All retry attempts failed. Last error: ${lastError.message}`);
}

/**
 * Circuit Breaker Pattern implementation to prevent cascading failures.
 */
export class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} options.failureThreshold - Number of consecutive errors to trigger OPEN state
   * @param {number} options.cooldownPeriodMs - Time to wait in OPEN state before trying again (HALF-OPEN)
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.cooldownPeriodMs = options.cooldownPeriodMs || 10000;

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastStateChange = Date.now();
  }

  /**
   * Runs the operation, checking and updating the circuit state.
   *
   * @param {() => Promise<any>} fn - Async operation
   * @returns {Promise<any>}
   */
  async execute(fn) {
    this.checkState();

    if (this.state === 'OPEN') {
      throw new Error('Circuit Breaker is OPEN. Execution blocked.');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  checkState() {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastStateChange;
      if (elapsed > this.cooldownPeriodMs) {
        console.warn(`[CircuitBreaker] Cooldown elapsed. Transitioning from OPEN to HALF-OPEN.`);
        this.state = 'HALF_OPEN';
        this.lastStateChange = Date.now();
      }
    }
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      console.log(`[CircuitBreaker] Success in HALF-OPEN. Resetting circuit to CLOSED.`);
    }
    this.state = 'CLOSED';
    this.failureCount = 0;
  }

  onFailure(err) {
    this.failureCount++;
    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      console.error(`[CircuitBreaker] Failure threshold met (${this.failureCount}). Tripping circuit to OPEN!`);
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
    } else if (this.state === 'HALF_OPEN') {
      console.error(`[CircuitBreaker] Failure in HALF-OPEN state. Tripping back to OPEN.`);
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
    }
  }
}

/**
 * Executes a primary operation and falls back to an alternative on failure.
 *
 * @param {() => Promise<any>} primaryFn
 * @param {() => Promise<any>} fallbackFn
 * @returns {Promise<any>}
 */
export async function withModelFallback(primaryFn, fallbackFn) {
  try {
    return await primaryFn();
  } catch (err) {
    console.warn(`[Fallback] Primary action failed: ${err.message}. Invoking fallback execution...`);
    return await fallbackFn();
  }
}

export default {
  getBackoffDelay,
  delay,
  withTimeout,
  runWithRetry,
  CircuitBreaker,
  withModelFallback
};
