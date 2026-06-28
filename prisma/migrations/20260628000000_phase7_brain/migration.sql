-- Phase 7.0 — Autonomous Operational Brain: Durable stores for memory, graph, goals, and automation
-- Run after the governance migration (scripts/migrate-governance-5-3-b.sql)
-- Replaces in-memory decisionDatabase[], incidentDatabase[], and knowledgeGraph Maps (TD-01)

-- CreateEnum
CREATE TYPE "MemoryRecordType" AS ENUM ('DECISION', 'INCIDENT', 'PROJECT_EVENT', 'CUSTOMER_EVENT', 'KNOWLEDGE_UPDATE');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BLOCKED', 'COMPLETE', 'CANCELLED');

-- CreateTable: org_memory_records
CREATE TABLE "org_memory_records" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" "MemoryRecordType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_memory_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_memory_records_workspace_id_type_created_at_idx" ON "org_memory_records"("workspace_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "org_memory_records_org_id_created_at_idx" ON "org_memory_records"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "org_memory_records" ADD CONSTRAINT "org_memory_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: graph_nodes
CREATE TABLE "graph_nodes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "graph_nodes_workspace_id_type_idx" ON "graph_nodes"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "graph_nodes_org_id_idx" ON "graph_nodes"("org_id");

-- AddForeignKey
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: graph_edges
CREATE TABLE "graph_edges" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "graph_edges_workspace_id_idx" ON "graph_edges"("workspace_id");

-- CreateIndex
CREATE INDEX "graph_edges_source_id_idx" ON "graph_edges"("source_id");

-- CreateIndex
CREATE INDEX "graph_edges_target_id_idx" ON "graph_edges"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "graph_edges_source_id_target_id_relationship_type_key" ON "graph_edges"("source_id", "target_id", "relationship_type");

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: goals
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ON_TRACK',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target_date" TIMESTAMP(3),
    "owner" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_workspace_id_status_idx" ON "goals"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "goals_org_id_idx" ON "goals"("org_id");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: goal_milestones
CREATE TABLE "goal_milestones" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goal_milestones_goal_id_idx" ON "goal_milestones"("goal_id");

-- AddForeignKey
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: automation_rules
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rules_workspace_id_enabled_idx" ON "automation_rules"("workspace_id", "enabled");

-- CreateIndex
CREATE INDEX "automation_rules_trigger_idx" ON "automation_rules"("trigger");

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: automation_runs
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trigger_payload" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_runs_workspace_id_idx" ON "automation_runs"("workspace_id");

-- CreateIndex
CREATE INDEX "automation_runs_rule_id_idx" ON "automation_runs"("rule_id");

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
