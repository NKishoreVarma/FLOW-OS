import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
};

const redisConnection = new Redis(redisConfig);

redisConnection.on('connect', () => {
  console.log('📥 Redis Connection initialized successfully for Queues.');
});

redisConnection.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err);
});

export default redisConnection;
