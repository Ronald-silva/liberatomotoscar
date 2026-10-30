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

// Outbox para exclusões R2: a pendência nasce na mesma transação que remove a
// referência da foto. Repetir DeleteObject é seguro quando a resposta se perde.
export const storageCleanupJobs = pgTable('storage_cleanup_jobs', {
  bucket: text('bucket').notNull(),
  storageKey: text('storage_key').notNull(),
  reason: text('reason', { enum: ['upload_rollback', 'photo_removed', 'draft_discarded', 'orphan_scan'] }).notNull(),
  status: text('status', { enum: ['pending', 'done'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastErrorCode: text('last_error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.bucket, table.storageKey] }),
  check('storage_cleanup_status_valid', sql`${table.status} IN ('pending', 'done')`),
  check('storage_cleanup_reason_valid', sql`${table.reason} IN ('upload_rollback', 'photo_removed', 'draft_discarded', 'orphan_scan')`),
  check('storage_cleanup_attempts_valid', sql`${table.attempts} >= 0`),
  index('storage_cleanup_status_created_idx').on(table.status, table.createdAt),
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

// P3: configuração do atendimento. WhatsApp fica reservado no esquema até P4.
export const channelSettings = pgTable('channel_settings', {
  channel: text('channel', { enum: ['site', 'whatsapp'] }).primaryKey(),
  mode: text('mode', { enum: ['disabled', 'deterministic', 'ai'] }).notNull().default('disabled'),
  version: integer('version').notNull().default(1),
  updatedBy: text('updated_by').references(() => usersTable.id, { onDelete: 'restrict' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('channel_settings_channel_valid', sql`${table.channel} IN ('site', 'whatsapp')`),
  check('channel_settings_mode_valid', sql`${table.mode} IN ('disabled', 'deterministic', 'ai')`),
  check('channel_settings_version_valid', sql`${table.version} >= 1`),
]);

export const channelSettingsAudit = pgTable('channel_settings_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: text('channel', { enum: ['site', 'whatsapp'] }).notNull(),
  actorUserId: text('actor_user_id').notNull().references(() => usersTable.id, { onDelete: 'restrict' }),
  beforeMode: text('before_mode', { enum: ['disabled', 'deterministic', 'ai'] }).notNull(),
  afterMode: text('after_mode', { enum: ['disabled', 'deterministic', 'ai'] }).notNull(),
  beforeVersion: integer('before_version').notNull(),
  afterVersion: integer('after_version').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('channel_settings_audit_channel_valid', sql`${table.channel} IN ('site', 'whatsapp')`),
  check('channel_settings_audit_modes_valid', sql`${table.beforeMode} IN ('disabled', 'deterministic', 'ai') AND ${table.afterMode} IN ('disabled', 'deterministic', 'ai') AND ${table.beforeMode} <> ${table.afterMode}`),
  check('channel_settings_audit_versions_valid', sql`${table.beforeVersion} >= 1 AND ${table.afterVersion} = ${table.beforeVersion} + 1`),
  index('channel_settings_audit_channel_time_idx').on(table.channel, table.occurredAt),
]);

// P3: conversas persistidas. O visitante só tem um token opaco; o banco guarda o hash.
// `owner` decide quem responde: `human` tem precedência sobre o modo do canal.
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: text('channel', { enum: ['site', 'whatsapp'] }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  owner: text('owner', { enum: ['automation', 'human'] }).notNull().default('automation'),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
  assignedTo: text('assigned_to').references(() => usersTable.id, { onDelete: 'restrict' }),
  // Interesses citados literalmente pelo comprador (lead_interests do plano), sem inferência.
  facts: jsonb('facts').$type<{ field: string; quote: string }[]>().notNull().default([]),
  visitorTurns: integer('visitor_turns').notNull().default(0),
  // Reserva de turno (compare-and-swap): impede duas respostas automáticas simultâneas.
  turnLockedUntil: timestamp('turn_locked_until', { withTimezone: true }),
  handoffRequestedAt: timestamp('handoff_requested_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: text('closed_by').references(() => usersTable.id, { onDelete: 'restrict' }),
}, (table) => [
  check('conversations_channel_valid', sql`${table.channel} IN ('site', 'whatsapp')`),
  check('conversations_owner_valid', sql`${table.owner} IN ('automation', 'human')`),
  check('conversations_status_valid', sql`${table.status} IN ('open', 'closed')`),
  check('conversations_closed_consistent', sql`(${table.status} = 'closed') = (${table.closedAt} IS NOT NULL)`),
  check('conversations_turns_valid', sql`${table.visitorTurns} >= 0`),
  index('conversations_channel_status_last_idx').on(table.channel, table.status, table.lastMessageAt),
  index('conversations_expires_idx').on(table.expiresAt),
]);

export const conversationMessages = pgTable('conversation_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  sender: text('sender', { enum: ['visitor', 'bot', 'ai', 'human', 'system'] }).notNull(),
  body: text('body').notNull(),
  // Cartões de veículos já verificados no banco no momento da resposta.
  cards: jsonb('cards').$type<{ id: string; title: string; year: number | null; priceCents: number; href: string }[]>(),
  authorUserId: text('author_user_id').references(() => usersTable.id, { onDelete: 'restrict' }),
  // Idempotência: o mesmo envio do navegador (repetido por rede) gera uma única mensagem.
  clientMessageId: uuid('client_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('conversation_messages_sender_valid', sql`${table.sender} IN ('visitor', 'bot', 'ai', 'human', 'system')`),
  check('conversation_messages_body_valid', sql`length(${table.body}) BETWEEN 1 AND 2000`),
  check('conversation_messages_author_valid', sql`(${table.sender} = 'human') = (${table.authorUserId} IS NOT NULL)`),
  index('conversation_messages_conversation_time_idx').on(table.conversationId, table.createdAt),
  uniqueIndex('conversation_messages_client_uidx').on(table.conversationId, table.clientMessageId)
    .where(sql`${table.clientMessageId} IS NOT NULL`),
]);

export const handoffs = pgTable('handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  event: text('event', { enum: ['requested', 'assumed', 'released', 'closed'] }).notNull(),
  reason: text('reason', { enum: ['visitor_request', 'financing', 'trade_in', 'ai_suggested', 'operator'] }).notNull(),
  actorUserId: text('actor_user_id').references(() => usersTable.id, { onDelete: 'restrict' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('handoffs_event_valid', sql`${table.event} IN ('requested', 'assumed', 'released', 'closed')`),
  check('handoffs_reason_valid', sql`${table.reason} IN ('visitor_request', 'financing', 'trade_in', 'ai_suggested', 'operator')`),
  check('handoffs_actor_valid', sql`${table.event} = 'requested' OR ${table.actorUserId} IS NOT NULL`),
  index('handoffs_conversation_time_idx').on(table.conversationId, table.occurredAt),
]);

// Contadores do atendimento público: somente números, nunca texto do comprador.
export const attendanceUsage = pgTable('attendance_usage', {
  channel: text('channel', { enum: ['site', 'whatsapp'] }).notNull(),
  dayUtc: text('day_utc').notNull(),
  aiRequests: integer('ai_requests').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  /** Métrica 6.5: respostas que uma guarda de saída reprovou e não foram ao cliente. */
  guardRejections: integer('guard_rejections').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.channel, table.dayUtc] }),
  check('attendance_usage_day_format', sql`${table.dayUtc} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
  check('attendance_usage_nonnegative', sql`${table.aiRequests} >= 0 AND ${table.inputTokens} >= 0 AND ${table.outputTokens} >= 0 AND ${table.guardRejections} >= 0`),
]);

// Limite distribuído por janela fixa. A chave é um HMAC do IP: o endereço não é guardado.
export const attendanceRateLimits = pgTable('attendance_rate_limits', {
  bucketKey: text('bucket_key').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  hits: integer('hits').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.bucketKey, table.windowStart] }),
  check('attendance_rate_limits_hits_valid', sql`${table.hits} >= 0`),
  index('attendance_rate_limits_window_idx').on(table.windowStart),
]);

// Clientes (tenants) conectados ao Tech Provider Meta via Embedded Signup (WhatsApp Cloud API).
export const whatsappTenants = pgTable('whatsapp_tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  tenantName: text('tenant_name').notNull(),
  wabaId: text('waba_id').notNull(),
  whatsappPhoneNumberId: text('whatsapp_phone_number_id').notNull(),
  displayPhoneNumber: text('display_phone_number'),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  coexistenceEnabled: boolean('coexistence_enabled').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('whatsapp_tenants_phone_number_id_uidx').on(table.whatsappPhoneNumberId),
  index('whatsapp_tenants_tenant_id_idx').on(table.tenantId),
]);

