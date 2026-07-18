/**
 * gracefulShutdown — drains the process cleanly on SIGTERM/SIGINT so in-flight
 * requests finish, BullMQ workers stop pulling jobs, and the PG/Redis connections
 * close before exit. A hard timeout guarantees the process still exits if a
 * resource hangs. Also installs last-resort process error handlers.
 *
 * Readiness flips to "shutting down" first, so a load balancer stops routing new
 * traffic while existing work drains.
 */

import db from '../../config/db.js';
import redis from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

let shuttingDown = false;
export const isShuttingDown = () => shuttingDown;

// Worker modules are already loaded (side-effect imports at boot); re-importing
// returns the cached module so we can close each exported Worker/Queue.
const WORKER_MODULES = [
  '../../workers/ingestionWorker.js', '../../workers/summaryWorker.js', '../../workers/syncWorker.js',
  '../../workers/webhookWorker.js', '../../workers/eventRetentionWorker.js', '../../workers/predictionWorker.js',
];

async function closeWorkers() {
  for (const m of WORKER_MODULES) {
    const mod = await import(m).catch(() => ({}));
    for (const v of Object.values(mod)) {
      if (v && typeof v.close === 'function') await Promise.resolve(v.close()).catch(() => {});
    }
  }
}

export function registerGracefulShutdown(httpServer, { timeoutMs = 15_000 } = {}) {
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n🛑 ${signal} received — graceful shutdown starting (readiness now failing)…`);
    const hard = setTimeout(() => { console.error('⛔ Shutdown timed out — forcing exit.'); process.exit(1); }, timeoutMs);
    hard.unref();
    try {
      await new Promise((resolve) => httpServer.close(resolve)); // stop new HTTP
      await closeWorkers();                                       // drain workers
      await db.pool.end().catch(() => {});                        // close PG pool
      await redis.quit().catch(() => {});                         // close Redis
      clearTimeout(hard);
      console.log('✅ Graceful shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('Shutdown error:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Last-resort handlers: log loudly. Rejections are non-fatal; an uncaught
  // exception leaves state suspect, so we drain and exit.
  process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { reason: String(reason?.stack || reason) }));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });
}
