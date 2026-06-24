import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => {
  console.log('🔄 FLOW OS Database Pool connected successfully.');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
  process.exit(-1);
});

export const query = (text, params) => pool.query(text, params);
export { pool };
export default { query, pool };
