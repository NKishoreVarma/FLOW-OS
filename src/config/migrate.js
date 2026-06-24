import { pool } from './db.js';

const createTablesSQL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    workspace_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'employee',
    accessible_channels TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS integrations (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    platform_name VARCHAR(50) NOT NULL,
    refresh_token TEXT NOT NULL,
    sync_status VARCHAR(50) DEFAULT 'active',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS communication_threads (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    thread_title TEXT,
    stitched_content TEXT NOT NULL,
    allowed_roles VARCHAR(50)[] DEFAULT '{employee, admin}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

async function runMigration() {
  console.log('🚀 Running database migrations for FLOW OS...');
  try {
    await pool.query(createTablesSQL);
    console.log('✅ Success! All core tables generated perfectly.');
  } catch (error) {
    console.error('❌ Migration error occurred:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigration();
