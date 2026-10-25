CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "admin_grants" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_grant_dates" CHECK ("admin_grants"."revoked_at" IS NULL OR "admin_grants"."revoked_at" >= "admin_grants"."granted_at")
);
--> statement-breakpoint
CREATE TABLE "authenticator" (
	"credentialID" text NOT NULL,
	"userId" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"credentialPublicKey" text NOT NULL,
	"counter" integer NOT NULL,
	"credentialDeviceType" text NOT NULL,
	"credentialBackedUp" boolean NOT NULL,
	"transports" text,
	CONSTRAINT "authenticator_userId_credentialID_pk" PRIMARY KEY("userId","credentialID"),
	CONSTRAINT "authenticator_credentialID_unique" UNIQUE("credentialID")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicle_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"actor_user_id" text,
	"operation" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"result" text DEFAULT 'success' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_result_valid" CHECK ("vehicle_audit"."result" IN ('success'))
);
--> statement-breakpoint
CREATE TABLE "vehicle_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"storage_provider" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_images_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "image_position_valid" CHECK ("vehicle_images"."position" >= 0),
	CONSTRAINT "image_size_valid" CHECK ("vehicle_images"."size_bytes" > 0),
	CONSTRAINT "image_dimensions_valid" CHECK (("vehicle_images"."width" IS NULL AND "vehicle_images"."height" IS NULL) OR ("vehicle_images"."width" > 0 AND "vehicle_images"."height" > 0)),
	CONSTRAINT "image_provider_valid" CHECK ("vehicle_images"."storage_provider" IN ('r2', 'legacy_public'))
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"brand" text,
	"model" text,
	"version" text,
	"year" integer,
	"mileage_km" integer,
	"color" text,
	"price_cents" integer,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"availability_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"version_number" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"source_reference" text,
	CONSTRAINT "vehicles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "vehicle_slug_format" CHECK ("vehicles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("vehicles"."slug") <= 120),
	CONSTRAINT "vehicle_type_valid" CHECK ("vehicles"."type" IN ('motorcycle', 'car')),
	CONSTRAINT "vehicle_status_valid" CHECK ("vehicles"."status" IN ('draft', 'published', 'reserved', 'sold', 'archived')),
	CONSTRAINT "vehicle_year_valid" CHECK ("vehicles"."year" IS NULL OR "vehicles"."year" BETWEEN 1900 AND 2100),
	CONSTRAINT "vehicle_mileage_valid" CHECK ("vehicles"."mileage_km" IS NULL OR "vehicles"."mileage_km" >= 0),
	CONSTRAINT "vehicle_price_valid" CHECK ("vehicles"."price_cents" IS NULL OR "vehicles"."price_cents" BETWEEN 0 AND 2147483647),
	CONSTRAINT "vehicle_version_valid" CHECK ("vehicles"."version_number" >= 1),
	CONSTRAINT "vehicle_public_fields" CHECK ("vehicles"."status" NOT IN ('published', 'reserved', 'sold') OR (nullif(trim("vehicles"."brand"), '') IS NOT NULL AND nullif(trim("vehicles"."model"), '') IS NOT NULL AND "vehicles"."price_cents" > 0 AND "vehicles"."availability_confirmed_at" IS NOT NULL AND "vehicles"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authenticator" ADD CONSTRAINT "authenticator_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_audit" ADD CONSTRAINT "vehicle_audit_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_audit" ADD CONSTRAINT "vehicle_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_audit_vehicle_time_idx" ON "vehicle_audit" USING btree ("vehicle_id","occurred_at");--> statement-breakpoint
CREATE INDEX "vehicle_audit_actor_time_idx" ON "vehicle_audit" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "vehicle_images_vehicle_position_idx" ON "vehicle_images" USING btree ("vehicle_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_images_one_cover_uidx" ON "vehicle_images" USING btree ("vehicle_id") WHERE "vehicle_images"."is_cover" = true;--> statement-breakpoint
CREATE INDEX "vehicles_status_updated_idx" ON "vehicles" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_source_reference_uidx" ON "vehicles" USING btree ("source","source_reference") WHERE "vehicles"."source_reference" IS NOT NULL;