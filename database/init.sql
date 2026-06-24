-- FLOW OS // Relational Vector Database Schema Initializer
-- Enables pgvector similarity search, multi-tenant workspace isolation, and high-performance HNSW indexes

-- 1. Initialize Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the Workspace Intel Chunks Table
CREATE TABLE IF NOT EXISTS workspace_intel_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(100) NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    source_platform VARCHAR(50) NOT NULL,
    authority_weight NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    raw_content TEXT NOT NULL,
    embedding VECTOR(768) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Multi-Tenant Isolation Index for Fast Workspace Filtering
CREATE INDEX IF NOT EXISTS idx_workspace_intel_chunks_workspace_id 
ON workspace_intel_chunks (workspace_id);

-- 4. Create High-Performance Vector HNSW Index for Cosine Similarity Searches
CREATE INDEX IF NOT EXISTS idx_workspace_intel_chunks_embedding 
ON workspace_intel_chunks 
USING hnsw (embedding vector_cosine_ops);
