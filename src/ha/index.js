/**
 * HA module boot entry point.
 * Call startHA() once at server boot.
 */

import redisConnection       from '../config/redis.js';
import { startElection }     from './LeaderElection.js';
import { startHealthMonitor, registerCheck } from './HealthMonitor.js';
import { registerWorker, startLeaderSweep }  from './WorkerFailover.js';
import { logger }            from '../utils/logger.js';

let _started = false;

export async function startHA() {
  if (_started) return;
  _started = true;

  startHealthMonitor();

  startElection('worker-coordinator', redisConnection, {
    onBecomeLeader: () => {
      logger.info('[HA] This node is the coordinator leader');
      startLeaderSweep(redisConnection, 'ingestion', {
        onWorkerDown: w => logger.warn(`[HA] ingestion worker down: ${w.workerId}`),
      });
      startLeaderSweep(redisConnection, 'summary', {
        onWorkerDown: w => logger.warn(`[HA] summary worker down: ${w.workerId}`),
      });
    },
    onLoseLeadership: () => logger.warn('[HA] This node lost coordinator leadership'),
  });

  registerWorker(redisConnection, 'api-server');

  logger.info('[HA] High Availability subsystem started');
}

export { startElection, isLeader, getAllStatus } from './LeaderElection.js';
export { startHealthMonitor, getHealth, registerCheck, isHealthy } from './HealthMonitor.js';
export { registerWorker, deregisterWorker, listWorkers, getWorkerId } from './WorkerFailover.js';
