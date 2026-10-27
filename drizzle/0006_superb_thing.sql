CREATE TABLE "demo_ai_usage" (
	"admin_user_id" text NOT NULL,
	"day_utc" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_ai_usage_admin_user_id_day_utc_pk" PRIMARY KEY("admin_user_id","day_utc"),
	CONSTRAINT "demo_ai_usage_day_format" CHECK ("demo_ai_usage"."day_utc" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "demo_ai_usage_nonnegative" CHECK ("demo_ai_usage"."requests" >= 0 AND "demo_ai_usage"."input_tokens" >= 0 AND "demo_ai_usage"."output_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "demo_ai_usage" ADD CONSTRAINT "demo_ai_usage_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
