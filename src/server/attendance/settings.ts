import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { channelSettings, channelSettingsAudit } from '@/server/db/schema';
import { ensureAttendanceTables } from './ensure-schema';

export const attendanceModeSchema = z.enum(['disabled', 'deterministic', 'ai']);
export type AttendanceMode = z.infer<typeof attendanceModeSchema>;
export type ChannelSettingRow = typeof channelSettings.$inferSelect;

export class StaleAttendanceSettingError extends Error {
  constructor() { super('O modo de atendimento mudou. Atualize a página antes de tentar novamente.'); }
}

/** Sem linha no banco, a Dayse roda no padrão 'ai'; `setWhatsappMode` cria a linha na primeira troca. */
export async function readWhatsappSetting() {
  await ensureAttendanceTables();
  const [row] = await getDb().select().from(channelSettings)
    .where(eq(channelSettings.channel, 'whatsapp')).limit(1);
  return row ?? { channel: 'whatsapp' as const, mode: 'ai' as const, version: 1,
    updatedBy: null, updatedAt: null };
}

/** Leitura do painel: o runtime da Dayse usa `readWhatsappSetting` sem sessão; a tela de Ajustes exige admin. */
export async function readAdminWhatsappSetting() {
  await requireAdmin();
  return readWhatsappSetting();
}

/**
 * Troca o modo da Dayse no WhatsApp. A linha do canal pode não existir (a Dayse roda no padrão
 * 'ai' até alguém mexer), então a primeira troca a cria. `expectedVersion` é a versão que a
 * pessoa viu na tela: se a linha andou desde então, outra pessoa mudou o modo e a troca é
 * recusada, em vez de sobrescrever em silêncio.
 */
export async function setWhatsappMode(requestedMode: unknown, expectedVersion: number): Promise<ChannelSettingRow> {
  const actor = await requireAdmin();
  const mode = attendanceModeSchema.parse(requestedMode);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new StaleAttendanceSettingError();
  await ensureAttendanceTables();

  return getDb().transaction(async (tx) => {
    // Corridas de criação convergem na chave primária; o bloqueio da linha decide um único vencedor.
    await tx.insert(channelSettings).values({ channel: 'whatsapp', mode: 'ai', version: 1 })
      .onConflictDoNothing();
    const [before] = await tx.select().from(channelSettings)
      .where(eq(channelSettings.channel, 'whatsapp')).for('update').limit(1);
    if (!before || before.version !== expectedVersion) throw new StaleAttendanceSettingError();
    // Mesmo modo: nada a gravar (e a auditoria exige que antes e depois difiram).
    if (before.mode === mode) return before;

    const [after] = await tx.update(channelSettings).set({ mode, updatedBy: actor.userId,
      updatedAt: new Date(), version: sql`${channelSettings.version} + 1` })
      .where(and(eq(channelSettings.channel, 'whatsapp'), eq(channelSettings.version, before.version)))
      .returning();
    if (!after) throw new StaleAttendanceSettingError();
    await tx.insert(channelSettingsAudit).values({ channel: 'whatsapp', actorUserId: actor.userId,
      beforeMode: before.mode, afterMode: mode,
      beforeVersion: before.version, afterVersion: after.version });
    return after;
  });
}
