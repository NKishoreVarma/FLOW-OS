-- Phase 11.5 — Predictive Workspace Intelligence
-- Idempotent. Apply with: psql $DATABASE_URL -f scripts/migrate-predictions-v11-5.sql
-- Adds PREDICTION to MemoryRecordType so prediction runs persist to org memory
-- (Prediction History). Run `npx prisma generate` afterwards.

ALTER TYPE "MemoryRecordType" ADD VALUE IF NOT EXISTS 'PREDICTION';
