import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// Prefer REDIS_URL (matches the BullMQ queue configs and 12-factor deploys);
// fall back to host/port for local dev.
const REDIS_URL = process.env.REDIS_URL
  || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${parseInt(process.env.REDIS_PORT || '6379', 10)}`;

const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
  // Reconnect backoff, capped at 5s — survives transient Redis outages.
  retryStrategy: (times) => Math.min(times * 200, 5000),
  // Reconnect (and re-issue the command) on a failover READONLY error.
  reconnectOnError: (err) => /READONLY/.test(err.message),
  enableReadyCheck: true,
});

let reconnects = 0;
redisConnection.on('connect', () => console.log('📥 Redis connection established.'));
redisConnection.on('ready', () => console.log('📥 Redis ready.'));
redisConnection.on('reconnecting', (ms) => console.warn(`⚠️  Redis reconnecting in ${ms}ms (attempt ${++reconnects})…`));
redisConnection.on('error', (err) => console.error('❌ Redis error:', err.message));

export function redisHealth() {
  return { status: redisConnection.status, reconnects };
}

export default redisConnection;
