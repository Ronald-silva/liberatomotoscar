import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sem banco: o que se prova aqui é o que `updateAppointment` MANDA gravar. É o que protege a
// correção feita à mão da próxima mensagem do cliente (Task 12), e precisa rodar em toda suíte.
const db = vi.hoisted(() => ({ existing: [] as unknown[], sets: [] as Record<string, unknown>[], updated: [] as unknown[] }));
vi.mock('@/server/authz', () => ({ requireAdmin: async () => ({ userId: 'admin-1' }) }));
vi.mock('./ensure-schema', () => ({ ensureAttendanceTables: async () => undefined }));
vi.mock('@/server/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => db.existing }) }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        db.sets.push(values);
        return { where: () => ({ returning: async () => db.updated }) };
      },
    }),
  }),
}));

import { updateAppointment, type AppointmentRow } from './appointments';

const at = (iso: string) => new Date(iso);
const now = at('2026-11-02T12:00:00-03:00'); // segunda, 12h na loja
const stored = (scheduledFor: Date | null, vehicleId: string | null = 'car1'): AppointmentRow => ({
  id: 'a1', conversationId: 'c1', vehicleId, customerName: 'Ana', customerPhone: '85999990000',
  scheduledFor, quote: 'sabado', source: 'agent', createdBy: null,
  createdAt: at('2026-11-01T00:00:00Z'), updatedAt: at('2026-11-01T00:00:00Z'),
});

beforeEach(() => { db.sets = []; db.existing = []; db.updated = []; });

describe('updateAppointment sem banco', () => {
  it('toda correcao grava a origem como manual', async () => {
    const row = stored(at('2026-11-07T14:00:00-03:00'));
    db.existing = [row]; db.updated = [{ ...row, source: 'manual' }];
    await updateAppointment('a1', { data: '2026-11-06', hora: '10:30', vehicleId: 'car1' }, now);
    expect(db.sets).toHaveLength(1);
    expect(db.sets[0].source).toBe('manual');
  });

  it('vehicleId ausente nao apaga o vinculo; "sem veiculo" explicito apaga', async () => {
    const row = stored(at('2026-11-07T14:00:00-03:00'));
    db.existing = [row]; db.updated = [row];
    await updateAppointment('a1', { data: '2026-11-06', hora: '10:30' }, now);
    expect('vehicleId' in db.sets[0]).toBe(false);
    await updateAppointment('a1', { data: '2026-11-06', hora: '10:30', vehicleId: null }, now);
    expect(db.sets[1].vehicleId).toBeNull();
    await updateAppointment('a1', { data: '2026-11-06', hora: '10:30', vehicleId: 'car2' }, now);
    expect(db.sets[2].vehicleId).toBe('car2');
  });

  it('visita que ja passou: corrigir sem mudar o horario funciona; mudar para o passado recusa', async () => {
    const passada = stored(at('2026-11-02T10:00:00-03:00')); // hoje 10h, antes do "agora"
    db.existing = [passada]; db.updated = [passada];
    await updateAppointment('a1', { data: '2026-11-02', hora: '10:00', vehicleId: 'car2' }, now);
    expect(db.sets[0].scheduledFor).toEqual(passada.scheduledFor);
    expect(db.sets[0].vehicleId).toBe('car2');
    await expect(updateAppointment('a1', { data: '2026-11-02', hora: '09:00', vehicleId: 'car2' }, now))
      .rejects.toThrow(/já passou/i);
    expect(db.sets).toHaveLength(1);
  });

  it('corrigir para fora do funcionamento recusa com a regra da Dayse', async () => {
    const row = stored(at('2026-11-07T14:00:00-03:00'));
    db.existing = [row]; db.updated = [row];
    await expect(updateAppointment('a1', { data: '2026-11-08', hora: '10:00' }, now)).rejects.toThrow(/funcionamento/i);
    expect(db.sets).toEqual([]);
  });

  it('id inexistente avisa antes de gravar', async () => {
    await expect(updateAppointment('nao', { data: '2026-11-06', hora: '10:30' }, now)).rejects.toThrow(/não encontrada/i);
    expect(db.sets).toEqual([]);
  });
});
