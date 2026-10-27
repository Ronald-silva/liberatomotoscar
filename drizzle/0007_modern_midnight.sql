CREATE TABLE "storage_cleanup_jobs" (
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "storage_cleanup_jobs_bucket_storage_key_pk" PRIMARY KEY("bucket","storage_key"),
	CONSTRAINT "storage_cleanup_status_valid" CHECK ("storage_cleanup_jobs"."status" IN ('pending', 'done')),
	CONSTRAINT "storage_cleanup_reason_valid" CHECK ("storage_cleanup_jobs"."reason" IN ('upload_rollback', 'photo_removed', 'draft_discarded', 'orphan_scan')),
	CONSTRAINT "storage_cleanup_attempts_valid" CHECK ("storage_cleanup_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "storage_cleanup_status_created_idx" ON "storage_cleanup_jobs" USING btree ("status","created_at");