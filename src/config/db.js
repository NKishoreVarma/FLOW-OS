import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE || 'flow_os_production',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    };

// Pool tuning — a larger max lets high-concurrency bursts (e.g. the event
// platform fan-out) queue on the pool and drain quickly instead of serializing
// behind a tiny default of 10. connectionTimeoutMillis stays 0 (unbounded wait)
// so a burst degrades to higher latency, never to acquisition errors.
poolConfig.max               = Number(process.env.DB_POOL_MAX ?? 20);
poolConfig.idleTimeoutMillis = Number(process.env.DB_POOL_IDLE_MS ?? 30_000);

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('🔄 FLOW OS Database Pool connected successfully.');
});

// Do NOT crash the process on a transient idle-client error — log and let the
// pool recover; a genuinely dead pool surfaces via the readiness probe.
pool.on('error', (err) => {
  console.error('❌ Database pool error (recoverable):', err.message);
});

const SLOW_MS = Number(process.env.SLOW_QUERY_MS ?? 500);
let queryCount = 0, slowCount = 0, errorCount = 0;

// Timed query wrapper: logs any statement slower than SLOW_QUERY_MS and tracks
// simple counters for the /health and monitoring surfaces.
export const query = async (text, params) => {
  const start = Date.now();
  queryCount++;
  try {
    return await pool.query(text, params);
  } catch (err) {
    errorCount++;
    throw err;
  } finally {
    const ms = Date.now() - start;
    if (ms >= SLOW_MS) {
      slowCount++;
      console.warn(`🐢 Slow query ${ms}ms: ${String(text).replace(/\s+/g, ' ').trim().slice(0, 140)}`);
    }
  }
};

export function poolStats() {
  return {
    max: poolConfig.max,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    queries: queryCount,
    slowQueries: slowCount,
    errors: errorCount,
    slowQueryThresholdMs: SLOW_MS,
  };
}

export { pool };
export default { query, pool, poolStats };
