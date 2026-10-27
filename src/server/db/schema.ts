import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Shapes follow @auth/drizzle-adapter 1.11.3 PostgreSQL defaults.
export const usersTable = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});
export const accountsTable = pgTable('account', {
  userId: text('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  type: text('type').$type<'oauth' | 'oidc' | 'email' | 'webauthn'>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })]);
export const sessionsTable = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});
export const verificationTokensTable = pgTable('verificationToken', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (table) => [primaryKey({ columns: [table.identifier, table.token] })]);
export const authenticatorsTable = pgTable('authenticator', {
  credentialID: text('credentialID').notNull().unique(),
  userId: text('userId').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  providerAccountId: text('providerAccountId').notNull(),
  credentialPublicKey: text('credentialPublicKey').notNull(),
  counter: integer('counter').notNull(),
  credentialDeviceType: text('credentialDeviceType').notNull(),
  credentialBackedUp: boolean('credentialBackedUp').notNull(),
  transports: text('transports'),
}, (table) => [primaryKey({ columns: [table.userId, table.credentialID] })]);

export const adminGrants = pgTable('admin_grants', {
  userId: text('user_id').primaryKey().references(() => usersTable.id, { onDelete: 'restrict' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [check('admin_grant_dates', sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.grantedAt}`)]);

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  type: text('type', { enum: ['motorcycle', 'car'] }).notNull(),
  brand: text('brand'),
  model: text('model'),
  version: text('version'),
  year: integer('year'),
  mileageKm: integer('mileage_km'),
  color: text('color'),
  priceCents: integer('price_cents'),
  description: text('description'),
  status: text('status', { enum: ['draft', 'published', 'reserved', 'sold', 'archived', 'discarded'] }).notNull().default('draft'),
  availabilityConfirmedAt: timestamp('availability_confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  versionNumber: integer('version_number').notNull().default(1),
  source: text('source').notNull().default('admin'),
  sourceReference: text('source_reference'),
  sourceData: jsonb('source_data'),
}, (table) => [
  check('vehicle_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${table.slug}) <= 120`),
  check('vehicle_type_valid', sql`${table.type} IN ('motorcycle', 'car')`),
  check('vehicle_status_valid', sql`${table.status} IN ('draft', 'published', 'reserved', 'sold', 'archived', 'discarded')`),
  check('vehicle_year_valid', sql`${table.year} IS NULL OR ${table.year} BETWEEN 1900 AND 2100`),
  check('vehicle_mileage_valid', sql`${table.mileageKm} IS NULL OR ${table.mileageKm} >= 0`),
  check('vehicle_price_valid', sql`${table.priceCents} IS NULL OR ${table.priceCents} BETWEEN 0 AND 2147483647`),
  check('vehicle_version_valid', sql`${table.versionNumber} >= 1`),
  check('vehicle_public_fields', sql`${table.status} NOT IN ('published', 'reserved', 'sold') OR (coalesce(length(trim(${table.brand})), 0) > 0 AND coalesce(length(trim(${table.model})), 0) > 0 AND coalesce(${table.priceCents}, 0) > 0 AND ${table.availabilityConfirmedAt} IS NOT NULL AND ${table.publishedAt} IS NOT NULL)`),
  index('vehicles_status_updated_idx').on(table.status, table.updatedAt),
  uniqueIndex('vehicles_source_reference_uidx').on(table.source, table.sourceReference).where(sql`${table.sourceReference} IS NOT NULL`),
]);

export const vehicleImages = pgTable('vehicle_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'restrict' }),
  storageKey: text('storage_key').notNull().unique(),
  storageProvider: text('storage_provider', { enum: ['r2', 'legacy_public'] }).notNull(),
  position: integer('position').notNull().default(0),
  isCover: boolean('is_cover').notNull().default(false),
  mimeType: text('mime_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('image_position_valid', sql`${table.position} >= 0`),
  check('image_size_valid', sql`${table.sizeBytes} > 0`),
  check('image_storage_key_valid', sql`length(trim(${table.storageKey})) > 0`),
  check('image_mime_valid', sql`${table.mimeType} IN ('image/jpeg', 'image/png', 'image/webp')`),
  check('image_dimensions_valid', sql`(${table.width} IS NULL AND ${table.height} IS NULL) OR (${table.width} IS NOT NULL AND ${table.height} IS NOT NULL AND ${table.width} > 0 AND ${table.height} > 0)`),
  check('image_provider_valid', sql`${table.storageProvider} IN ('r2', 'legacy_public')`),
  index('vehicle_images_vehicle_position_idx').on(table.vehicleId, table.position),
  uniqueIndex('vehicle_images_one_cover_uidx').on(table.vehicleId).where(sql`${table.isCover} = true`),
]);

export const vehicleAudit = pgTable('vehicle_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'restrict' }),
  actorUserId: text('actor_user_id').references(() => usersTable.id, { onDelete: 'restrict' }),
  operation: text('operation').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  result: text('result').notNull().default('success'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('audit_result_valid', sql`${table.result} IN ('success')`),
  check('audit_actor_valid', sql`(${table.operation} = 'legacy_imported' AND ${table.actorUserId} IS NULL) OR (${table.operation} <> 'legacy_imported' AND ${table.actorUserId} IS NOT NULL)`),
  index('vehicle_audit_vehicle_time_idx').on(table.vehicleId, table.occurredAt),
  index('vehicle_audit_actor_time_idx').on(table.actorUserId, table.occurredAt),
]);

// Controle da demonstração restrita: somente contadores, nunca mensagens do comprador.
export const demoAiUsage = pgTable('demo_ai_usage', {
  adminUserId: text('admin_user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  dayUtc: text('day_utc').notNull(),
  requests: integer('requests').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.adminUserId, table.dayUtc] }),
  check('demo_ai_usage_day_format', sql`${table.dayUtc} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
  check('demo_ai_usage_nonnegative', sql`${table.requests} >= 0 AND ${table.inputTokens} >= 0 AND ${table.outputTokens} >= 0`),
]);
