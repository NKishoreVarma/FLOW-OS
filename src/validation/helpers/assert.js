/**
 * Assertion helpers for the validation suite.
 * Throw descriptive errors on failure — caught by ValidationRunner.
 */

export function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDefined(value, label) {
  if (value == null) throw new Error(`${label}: expected defined value, got ${value}`);
}

export function assertString(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label}: expected non-empty string, got ${JSON.stringify(value)}`);
}

export function assertUrl(value, label) {
  try {
    new URL(value);
  } catch {
    throw new Error(`${label}: not a valid URL: ${value}`);
  }
}

export function assertIncludes(url, param, label) {
  if (!url.includes(param)) throw new Error(`${label}: expected ${url} to include "${param}"`);
}

export function assertGreaterThan(actual, threshold, label) {
  if (actual <= threshold) throw new Error(`${label}: expected ${actual} > ${threshold}`);
}

export function assertLessThan(actual, threshold, label) {
  if (actual >= threshold) throw new Error(`${label}: expected ${actual} < ${threshold}`);
}

export function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}: expected array, got ${typeof value}`);
}

export function assertObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected object, got ${typeof value}`);
  }
}

/**
 * Time an async operation and assert it completes under the given threshold.
 */
export async function assertUnder(ms, label, fn) {
  const start = Date.now();
  await fn();
  const elapsed = Date.now() - start;
  if (elapsed >= ms) {
    throw new Error(`${label}: took ${elapsed}ms, expected < ${ms}ms`);
  }
  return elapsed;
}

/**
 * Assert a function throws an error matching the predicate.
 */
export async function assertThrows(fn, predicate, label) {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    if (predicate && !predicate(err)) {
      throw new Error(`${label}: error did not match predicate — got: ${err.message}`);
    }
  }
  if (!threw) throw new Error(`${label}: expected function to throw but it did not`);
}
