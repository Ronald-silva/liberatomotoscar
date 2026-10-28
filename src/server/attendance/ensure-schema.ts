import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';

let ensuredPromise: Promise<void> | null = null;

/**
 * Executa cada DDL em comando individual (o protocolo estendido do postgres.js
 * rejeita múltiplos comandos separados por ponto e vírgula na mesma chamada).
 */
export function ensureAttendanceTables(): Promise<void> {
  if (!ensuredPromise) {
    ensuredPromise = (async () => {
      try {
        const db = getDb();
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "channel_settings" (
            "channel" text PRIMARY KEY NOT NULL,
            "mode" text DEFAULT 'ai' NOT NULL,
            "version" integer DEFAULT 1 NOT NULL,
            "updated_by" text,
            "updated_at" timestamp with time zone DEFAULT now() NOT NULL
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "channel_settings_audit" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "channel" text NOT NULL,
            "actor_user_id" text NOT NULL,
            "before_mode" text NOT NULL,
            "after_mode" text NOT NULL,
            "before_version" integer NOT NULL,
            "after_version" integer NOT NULL,
            "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "conversations" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "channel" text NOT NULL,
            "token_hash" text NOT NULL UNIQUE,
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
            "closed_by" text
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "conversation_messages" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
            "sender" text NOT NULL,
            "body" text NOT NULL,
            "cards" jsonb,
            "author_user_id" text,
            "client_message_id" uuid,
            "created_at" timestamp with time zone DEFAULT now() NOT NULL
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "handoffs" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
            "event" text NOT NULL,
            "reason" text NOT NULL,
            "actor_user_id" text,
            "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "attendance_usage" (
            "channel" text NOT NULL,
            "day_utc" text NOT NULL,
            "ai_requests" integer DEFAULT 0 NOT NULL,
            "input_tokens" integer DEFAULT 0 NOT NULL,
            "output_tokens" integer DEFAULT 0 NOT NULL,
            "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
            PRIMARY KEY ("channel", "day_utc")
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "attendance_rate_limits" (
            "bucket_key" text NOT NULL,
            "window_start" timestamp with time zone NOT NULL,
            "hits" integer DEFAULT 0 NOT NULL,
            PRIMARY KEY ("bucket_key", "window_start")
          )
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "conversation_messages_client_uidx"
            ON "conversation_messages" ("conversation_id", "client_message_id")
            WHERE "client_message_id" IS NOT NULL
        `);
        await db.execute(sql`
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
          )
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_tenants_phone_number_id_uidx"
            ON "whatsapp_tenants" ("whatsapp_phone_number_id")
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS "whatsapp_tenants_tenant_id_idx"
            ON "whatsapp_tenants" ("tenant_id")
        `);
        await db.execute(sql`
          UPDATE "channel_settings"
            SET "mode" = 'ai'
            WHERE "channel" = 'site' AND "updated_by" IS NULL AND "mode" = 'disabled'
        `);
      } catch (error) {
        ensuredPromise = null;
        console.warn('Aviso ao verificar tabelas de atendimento:', error instanceof Error ? error.message : 'erro');
      }
    })();
  }
  return ensuredPromise;
}
