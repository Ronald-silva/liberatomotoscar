CREATE TABLE "attendance_rate_limits" (
	"bucket_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attendance_rate_limits_bucket_key_window_start_pk" PRIMARY KEY("bucket_key","window_start"),
	CONSTRAINT "attendance_rate_limits_hits_valid" CHECK ("attendance_rate_limits"."hits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attendance_usage" (
	"channel" text NOT NULL,
	"day_utc" text NOT NULL,
	"ai_requests" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_usage_channel_day_utc_pk" PRIMARY KEY("channel","day_utc"),
	CONSTRAINT "attendance_usage_day_format" CHECK ("attendance_usage"."day_utc" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "attendance_usage_nonnegative" CHECK ("attendance_usage"."ai_requests" >= 0 AND "attendance_usage"."input_tokens" >= 0 AND "attendance_usage"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "channel_settings" (
	"channel" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'disabled' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_settings_channel_valid" CHECK ("channel_settings"."channel" IN ('site', 'whatsapp')),
	CONSTRAINT "channel_settings_mode_valid" CHECK ("channel_settings"."mode" IN ('disabled', 'deterministic', 'ai')),
	CONSTRAINT "channel_settings_version_valid" CHECK ("channel_settings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "channel_settings_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"before_mode" text NOT NULL,
	"after_mode" text NOT NULL,
	"before_version" integer NOT NULL,
	"after_version" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_settings_audit_channel_valid" CHECK ("channel_settings_audit"."channel" IN ('site', 'whatsapp')),
	CONSTRAINT "channel_settings_audit_modes_valid" CHECK ("channel_settings_audit"."before_mode" IN ('disabled', 'deterministic', 'ai') AND "channel_settings_audit"."after_mode" IN ('disabled', 'deterministic', 'ai') AND "channel_settings_audit"."before_mode" <> "channel_settings_audit"."after_mode"),
	CONSTRAINT "channel_settings_audit_versions_valid" CHECK ("channel_settings_audit"."before_version" >= 1 AND "channel_settings_audit"."after_version" = "channel_settings_audit"."before_version" + 1)
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"cards" jsonb,
	"author_user_id" text,
	"client_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_messages_sender_valid" CHECK ("conversation_messages"."sender" IN ('visitor', 'bot', 'ai', 'human', 'system')),
	CONSTRAINT "conversation_messages_body_valid" CHECK (length("conversation_messages"."body") BETWEEN 1 AND 2000),
	CONSTRAINT "conversation_messages_author_valid" CHECK (("conversation_messages"."sender" = 'human') = ("conversation_messages"."author_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"token_hash" text NOT NULL,
	"owner" text DEFAULT 'automation' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visitor_turns" integer DEFAULT 0 NOT NULL,
	"turn_locked_until" timestamp with time zone,
	"handoff_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	CONSTRAINT "conversations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "conversations_channel_valid" CHECK ("conversations"."channel" IN ('site', 'whatsapp')),
	CONSTRAINT "conversations_owner_valid" CHECK ("conversations"."owner" IN ('automation', 'human')),
	CONSTRAINT "conversations_status_valid" CHECK ("conversations"."status" IN ('open', 'closed')),
	CONSTRAINT "conversations_closed_consistent" CHECK (("conversations"."status" = 'closed') = ("conversations"."closed_at" IS NOT NULL)),
	CONSTRAINT "conversations_turns_valid" CHECK ("conversations"."visitor_turns" >= 0)
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"event" text NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handoffs_event_valid" CHECK ("handoffs"."event" IN ('requested', 'assumed', 'released', 'closed')),
	CONSTRAINT "handoffs_reason_valid" CHECK ("handoffs"."reason" IN ('visitor_request', 'financing', 'trade_in', 'ai_suggested', 'operator')),
	CONSTRAINT "handoffs_actor_valid" CHECK ("handoffs"."event" = 'requested' OR "handoffs"."actor_user_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "channel_settings" ADD CONSTRAINT "channel_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_settings_audit" ADD CONSTRAINT "channel_settings_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_rate_limits_window_idx" ON "attendance_rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "channel_settings_audit_channel_time_idx" ON "channel_settings_audit" USING btree ("channel","occurred_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_time_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_client_uidx" ON "conversation_messages" USING btree ("conversation_id","client_message_id") WHERE "conversation_messages"."client_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_channel_status_last_idx" ON "conversations" USING btree ("channel","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_expires_idx" ON "conversations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "handoffs_conversation_time_idx" ON "handoffs" USING btree ("conversation_id","occurred_at");