import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { channelSettings, channelSettingsAudit } from '@/server/db/schema';

export const attendanceModeSchema = z.enum(['disabled', 'deterministic', 'ai']);
export type AttendanceMode = z.infer<typeof attendanceModeSchema>;

export class StaleAttendanceSettingError extends Error {
  constructor() { super('O modo de atendimento mudou. Atualize a página antes de tentar novamente.'); }
}

// Sem linha no banco, o canal inicia no modo determinístico (Chatbot) até o admin alterar.
export async function readSiteSetting() {
  const [row] = await getDb().select().from(channelSettings)
    .where(eq(channelSettings.channel, 'site')).limit(1);
  return row ?? { channel: 'site' as const, mode: 'deterministic' as const, version: 1,
    updatedBy: null, updatedAt: null };
}

export async function readAdminSiteSetting() {
  await requireAdmin();
  return readSiteSetting();
}

export async function listAdminSiteModeChanges() {
  await requireAdmin();
  return getDb().select().from(channelSettingsAudit)
    .where(eq(channelSettingsAudit.channel, 'site'))
    .orderBy(desc(channelSettingsAudit.occurredAt)).limit(10);
}

export async function setSiteMode(requestedMode: unknown, expectedVersion: number) {
  const actor = await requireAdmin();
  const mode = attendanceModeSchema.parse(requestedMode);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new StaleAttendanceSettingError();

  return getDb().transaction(async (tx) => {
    // A primeira mudança cria a linha desativada. Corridas de criação convergem
    // na chave primária; depois a comparação de versão decide um único vencedor.
    await tx.insert(channelSettings).values({ channel: 'site', mode: 'deterministic', version: 1 })
      .onConflictDoNothing();
    const [before] = await tx.select().from(channelSettings)
      .where(eq(channelSettings.channel, 'site')).for('update').limit(1);
    if (!before || before.version !== expectedVersion) throw new StaleAttendanceSettingError();
    if (before.mode === mode) return before;

    const [after] = await tx.update(channelSettings).set({ mode, updatedBy: actor.userId,
      updatedAt: new Date(), version: sql`${channelSettings.version} + 1` })
      .where(and(eq(channelSettings.channel, 'site'), eq(channelSettings.version, expectedVersion)))
      .returning();
    if (!after) throw new StaleAttendanceSettingError();
    await tx.insert(channelSettingsAudit).values({ channel: 'site', actorUserId: actor.userId,
      beforeMode: before.mode, afterMode: mode,
      beforeVersion: before.version, afterVersion: after.version });
    return after;
  });
}
