-- O runtime também garante esta tabela enquanto bases antigas ainda não migraram.
CREATE TABLE IF NOT EXISTS "visit_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"vehicle_id" uuid,
	"customer_name" text,
	"customer_phone" text,
	"scheduled_for" timestamp with time zone,
	"quote" text NOT NULL,
	"source" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_appointments_source_valid" CHECK ("visit_appointments"."source" IN ('agent', 'manual')),
	CONSTRAINT "visit_appointments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "visit_appointments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "visit_appointments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "visit_appointments_conversation_uidx" ON "visit_appointments" USING btree ("conversation_id") WHERE "visit_appointments"."conversation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_appointments_scheduled_idx" ON "visit_appointments" USING btree ("scheduled_for");
