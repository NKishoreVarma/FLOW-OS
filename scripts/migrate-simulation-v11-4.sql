-- Phase 11.4 — What-If Simulation Engine
-- Idempotent. Apply with: psql $DATABASE_URL -f scripts/migrate-simulation-v11-4.sql
-- Adds the SIMULATION value to MemoryRecordType so completed simulations persist
-- to org memory (reused as analogues). Run `npx prisma generate` afterwards.

ALTER TYPE "MemoryRecordType" ADD VALUE IF NOT EXISTS 'SIMULATION';
