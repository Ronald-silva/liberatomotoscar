-- Aditiva e repetível: o runtime (`ensureAttendanceTables`) cria esta tabela em bases que ainda
-- não receberam a migração formal, então o CREATE precisa ser IF NOT EXISTS e a chave estrangeira
-- precisa vir dentro dele — `ALTER TABLE ADD CONSTRAINT` não tem IF NOT EXISTS no Postgres e
-- falharia na segunda passada.
CREATE TABLE IF NOT EXISTS "attendance_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"evento" text NOT NULL,
	"motivo" text,
	"registro" text,
	"conversation_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_incidents_channel_valid" CHECK ("attendance_incidents"."channel" IN ('site', 'whatsapp')),
	CONSTRAINT "attendance_incidents_registro_valid" CHECK ("attendance_incidents"."registro" IS NULL OR "attendance_incidents"."registro" IN ('completo', 'parcial', 'nenhum')),
	CONSTRAINT "attendance_incidents_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_incidents_channel_time_idx" ON "attendance_incidents" USING btree ("channel","occurred_at");
