-- CreateTable
CREATE TABLE IF NOT EXISTS "import_records" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "org_id" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "schema_version" TEXT,
    "engine_version" TEXT NOT NULL DEFAULT '2.0',
    "statistics" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "graph_metrics" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "import_records_import_id_key" ON "import_records"("import_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "import_records_workspace_id_idx" ON "import_records"("workspace_id");
