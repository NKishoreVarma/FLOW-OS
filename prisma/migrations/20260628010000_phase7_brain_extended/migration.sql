-- Phase 7.0 Extended: Briefings, BriefingRecommendations, CopilotConversations, CopilotMessages
-- Hand-crafted migration — do NOT use prisma migrate dev (pre-existing governance raw SQL drift)

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'IGNORED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CopilotMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable: briefings
CREATE TABLE "briefings" (
    "id"            TEXT NOT NULL,
    "workspace_id"  TEXT NOT NULL,
    "org_id"        TEXT NOT NULL,
    "user_id"       TEXT,
    "role"          TEXT NOT NULL,
    "ai_narrative"  TEXT,
    "sections"      JSONB NOT NULL DEFAULT '{}',
    "metadata"      JSONB NOT NULL DEFAULT '{}',
    "generated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"    TIMESTAMP(3),

    CONSTRAINT "briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: briefing_recommendations
CREATE TABLE "briefing_recommendations" (
    "id"                     TEXT NOT NULL,
    "briefing_id"            TEXT NOT NULL,
    "workspace_id"           TEXT NOT NULL,
    "org_id"                 TEXT NOT NULL,
    "title"                  TEXT NOT NULL,
    "confidence"             INTEGER NOT NULL,
    "impact"                 TEXT NOT NULL,
    "evidence"               TEXT NOT NULL,
    "business_impact"        TEXT,
    "estimated_improvement"  TEXT,
    "systems"                TEXT[] DEFAULT ARRAY[]::TEXT[],
    "owner"                  TEXT,
    "status"                 "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "user_feedback"          TEXT,
    "feedback_at"            TIMESTAMP(3),
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"             TIMESTAMP(3),

    CONSTRAINT "briefing_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: copilot_conversations
CREATE TABLE "copilot_conversations" (
    "id"            TEXT NOT NULL,
    "workspace_id"  TEXT NOT NULL,
    "org_id"        TEXT NOT NULL,
    "user_id"       TEXT,
    "page_context"  TEXT,
    "entity_id"     TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    "deleted_at"    TIMESTAMP(3),

    CONSTRAINT "copilot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: copilot_messages
CREATE TABLE "copilot_messages" (
    "id"               TEXT NOT NULL,
    "conversation_id"  TEXT NOT NULL,
    "role"             "CopilotMessageRole" NOT NULL,
    "content"          TEXT NOT NULL,
    "evidence"         JSONB NOT NULL DEFAULT '[]',
    "confidence"       INTEGER,
    "suggested_actions" JSONB NOT NULL DEFAULT '[]',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
);

-- Foreign Keys: briefings
ALTER TABLE "briefings"
    ADD CONSTRAINT "briefings_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "briefings"
    ADD CONSTRAINT "briefings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign Keys: briefing_recommendations
ALTER TABLE "briefing_recommendations"
    ADD CONSTRAINT "briefing_recommendations_briefing_id_fkey"
    FOREIGN KEY ("briefing_id") REFERENCES "briefings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "briefing_recommendations"
    ADD CONSTRAINT "briefing_recommendations_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign Keys: copilot_conversations
ALTER TABLE "copilot_conversations"
    ADD CONSTRAINT "copilot_conversations_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "copilot_conversations"
    ADD CONSTRAINT "copilot_conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign Keys: copilot_messages
ALTER TABLE "copilot_messages"
    ADD CONSTRAINT "copilot_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "copilot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes: briefings
CREATE INDEX "briefings_workspace_id_role_generated_at_idx" ON "briefings"("workspace_id", "role", "generated_at");
CREATE INDEX "briefings_org_id_generated_at_idx" ON "briefings"("org_id", "generated_at");
CREATE INDEX "briefings_user_id_idx" ON "briefings"("user_id");

-- Indexes: briefing_recommendations
CREATE INDEX "briefing_recommendations_workspace_id_status_idx" ON "briefing_recommendations"("workspace_id", "status");
CREATE INDEX "briefing_recommendations_workspace_id_impact_idx" ON "briefing_recommendations"("workspace_id", "impact");
CREATE INDEX "briefing_recommendations_briefing_id_idx" ON "briefing_recommendations"("briefing_id");
CREATE INDEX "briefing_recommendations_org_id_idx" ON "briefing_recommendations"("org_id");

-- Indexes: copilot_conversations
CREATE INDEX "copilot_conversations_workspace_id_user_id_created_at_idx" ON "copilot_conversations"("workspace_id", "user_id", "created_at");
CREATE INDEX "copilot_conversations_org_id_created_at_idx" ON "copilot_conversations"("org_id", "created_at");

-- Indexes: copilot_messages
CREATE INDEX "copilot_messages_conversation_id_created_at_idx" ON "copilot_messages"("conversation_id", "created_at");
