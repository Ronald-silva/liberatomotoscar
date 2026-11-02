import { beforeEach, describe, expect, it, vi } from 'vitest';

// Um banco de mentira com a única tabela que importa aqui. Ele não avalia as condições do
// `where`: a corrida de gravação fica a cargo do Postgres; o que se prova é a regra do serviço.
const db = vi.hoisted(() => ({
  row: null as null | { channel: string; mode: string; version: number; updatedBy: string | null; updatedAt: Date },
  audit: [] as Record<string, unknown>[],
  denied: false,
}));

vi.mock('@/server/authz', () => ({
  requireAdmin: async () => {
    if (db.denied) throw new Error('Acesso negado');
    return { userId: 'admin-1' };
  },
}));
vi.mock('./ensure-schema', () => ({ ensureAttendanceTables: async () => undefined }));
vi.mock('@/server/db/client', async () => {
  const schema = await import('@/server/db/schema');
  const reading = () => {
    const chain = { from: () => chain, where: () => chain, for: () => chain,
      limit: async () => (db.row ? [db.row] : []) };
    return chain;
  };
  const tx = {
    select: reading,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === schema.channelSettingsAudit) { db.audit.push(values); return Promise.resolve(); }
        return { onConflictDoNothing: async () => {
          db.row ??= { channel: String(values.channel), mode: String(values.mode), version: Number(values.version),
            updatedBy: null, updatedAt: new Date() };
        } };
      },
    }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
      if (!db.row) return [];
      db.row = { ...db.row, mode: String(values.mode), updatedBy: String(values.updatedBy), version: db.row.version + 1 };
      return [db.row];
    } }) }) }),
  };
  return { getDb: () => ({ ...tx, transaction: async (run: (t: typeof tx) => unknown) => run(tx) }) };
});

import { StaleAttendanceSettingError, readAdminWhatsappSetting, readWhatsappSetting, setWhatsappMode } from './settings';

beforeEach(() => { db.row = null; db.audit = []; db.denied = false; });

describe('controle do modo do WhatsApp', () => {
  it('cria a linha whatsapp quando ela nao existe e aplica o modo', async () => {
    expect(db.row).toBeNull();
    const saved = await setWhatsappMode('disabled', 1);
    expect(saved).toMatchObject({ channel: 'whatsapp', mode: 'disabled', version: 2, updatedBy: 'admin-1' });
    expect(db.row).toMatchObject({ channel: 'whatsapp', mode: 'disabled' });
  });

  it('recusa versao obsoleta com StaleAttendanceSettingError', async () => {
    await setWhatsappMode('disabled', 1); // a linha agora está na versão 2
    await expect(setWhatsappMode('deterministic', 1)).rejects.toBeInstanceOf(StaleAttendanceSettingError);
    expect(db.row?.mode).toBe('disabled');
    expect(db.audit).toHaveLength(1);
  });

  it('recusa versao invalida e modo desconhecido sem tocar no banco', async () => {
    await expect(setWhatsappMode('ai', 0)).rejects.toBeInstanceOf(StaleAttendanceSettingError);
    await expect(setWhatsappMode('desligado', 1)).rejects.toThrow();
    expect(db.row).toBeNull();
  });

  it('registra a mudanca em channel_settings_audit com o canal whatsapp', async () => {
    await setWhatsappMode('deterministic', 1);
    expect(db.audit).toEqual([{ channel: 'whatsapp', actorUserId: 'admin-1', beforeMode: 'ai',
      afterMode: 'deterministic', beforeVersion: 1, afterVersion: 2 }]);
  });

  it('nao audita nem avanca a versao quando o modo pedido ja e o atual', async () => {
    const saved = await setWhatsappMode('ai', 1); // o padrão sem linha já é 'ai'
    expect(saved.version).toBe(1);
    expect(db.audit).toEqual([]);
  });

  it('a Dayse respeita o modo disabled', async () => {
    expect(await readWhatsappSetting()).toMatchObject({ mode: 'ai', updatedBy: null });
    await setWhatsappMode('disabled', 1);
    expect(await readWhatsappSetting()).toMatchObject({ channel: 'whatsapp', mode: 'disabled', version: 2 });
  });

  it('exige administrador antes de qualquer gravacao', async () => {
    db.denied = true;
    await expect(setWhatsappMode('disabled', 1)).rejects.toThrow('Acesso negado');
    expect(db.row).toBeNull();
  });
});

describe('leitura do painel', () => {
  it('exige admin, ao contrario da leitura do runtime da Dayse', async () => {
    db.denied = true;
    await expect(readAdminWhatsappSetting()).rejects.toThrow('Acesso negado');
    await expect(readWhatsappSetting()).resolves.toMatchObject({ mode: 'ai' });
    db.denied = false;
    await expect(readAdminWhatsappSetting()).resolves.toMatchObject({ mode: 'ai', version: 1 });
  });
});
