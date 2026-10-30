-- whatsapp_tenants e os índices usam IF NOT EXISTS porque `attendance/ensure-schema.ts` já
-- cria essa tabela em runtime: o snapshot do drizzle nunca a tinha, e a migração sem a guarda
-- quebraria em qualquer banco que já rodou o atendimento. Mesma razão para o DROP CONSTRAINT
-- IF EXISTS: o ensure-schema cria a tabela sem os CHECKs.

CREATE TABLE IF NOT EXISTS "whatsapp_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_name" text NOT NULL,
	"waba_id" text NOT NULL,
	"whatsapp_phone_number_id" text NOT NULL,
	"display_phone_number" text,
	"encrypted_access_token" text NOT NULL,
	"coexistence_enabled" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_usage" DROP CONSTRAINT IF EXISTS "attendance_usage_nonnegative";--> statement-breakpoint
ALTER TABLE "attendance_usage" ADD COLUMN IF NOT EXISTS "guard_rejections" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_tenants_phone_number_id_uidx" ON "whatsapp_tenants" USING btree ("whatsapp_phone_number_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_tenants_tenant_id_idx" ON "whatsapp_tenants" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "attendance_usage" ADD CONSTRAINT "attendance_usage_nonnegative" CHECK ("attendance_usage"."ai_requests" >= 0 AND "attendance_usage"."input_tokens" >= 0 AND "attendance_usage"."output_tokens" >= 0 AND "attendance_usage"."guard_rejections" >= 0);