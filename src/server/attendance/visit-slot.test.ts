import { describe, expect, it } from 'vitest';
import { resolveVisitSlot, storeClock } from './visit-slot';

const now = new Date('2026-11-02T12:00:00-03:00'); // segunda-feira, no relógio da loja

describe('resolveVisitSlot', () => {
  it('resolve dia e hora dentro do horario da loja', () => {
    const r = resolveVisitSlot({ data: '2026-11-07', hora: '14:00', now });
    expect(r.reason).toBe('ok');
    // 14h em Fortaleza são 17h UTC.
    expect(r.scheduledFor?.toISOString()).toBe('2026-11-07T17:00:00.000Z');
    expect(storeClock(r.scheduledFor!)).toMatchObject({ day: 7, hour: 14, minute: 0 });
  });
  it('recusa domingo, porque a loja fecha', () => {
    const r = resolveVisitSlot({ data: '2026-11-08', hora: '10:00', now });
    expect(r).toEqual({ scheduledFor: null, reason: 'fechado' });
  });
  it('recusa fora de 9h as 18h', () => {
    expect(resolveVisitSlot({ data: '2026-11-07', hora: '20:30', now }).reason).toBe('fechado');
    expect(resolveVisitSlot({ data: '2026-11-07', hora: '08:59', now }).reason).toBe('fechado');
    expect(resolveVisitSlot({ data: '2026-11-07', hora: '09:00', now }).reason).toBe('ok');
    expect(resolveVisitSlot({ data: '2026-11-07', hora: '17:59', now }).reason).toBe('ok');
    expect(resolveVisitSlot({ data: '2026-11-07', hora: '18:00', now }).reason).toBe('fechado');
  });
  it('recusa data no passado', () => {
    expect(resolveVisitSlot({ data: '2026-10-30', hora: '10:00', now }).reason).toBe('passado');
  });
  it('hoje mais tarde ainda vale; hoje mais cedo ja passou', () => {
    expect(resolveVisitSlot({ data: '2026-11-02', hora: '15:00', now }).reason).toBe('ok');
    expect(resolveVisitSlot({ data: '2026-11-02', hora: '10:00', now }).reason).toBe('passado');
  });
  it('sem hora devolve agendamento sem horario, nao um palpite', () => {
    const r = resolveVisitSlot({ data: '2026-11-07', now });
    expect(r.scheduledFor).toBeNull();
    expect(r.reason).toBe('sem-hora');
  });
  it('sem data devolve sem-data', () => {
    expect(resolveVisitSlot({ now }).reason).toBe('sem-data');
  });
  it('data impossivel nao estoura', () => {
    expect(resolveVisitSlot({ data: '2026-02-31', hora: '10:00', now }).reason).toBe('invalido');
    expect(resolveVisitSlot({ data: 'sabado', hora: '10:00', now }).reason).toBe('invalido');
    expect(resolveVisitSlot({ data: '2026-11-07', hora: '25:00', now }).reason).toBe('invalido');
    expect(resolveVisitSlot({ data: '2026-11-07', hora: '14h', now }).reason).toBe('invalido');
  });
  it('qualquer recusa devolve scheduledFor nulo', () => {
    for (const input of [{}, { data: '2026-11-08', hora: '10:00' }, { data: '2026-10-30', hora: '10:00' }, { data: '2026-11-07' }]) {
      expect(resolveVisitSlot({ ...input, now }).scheduledFor).toBeNull();
    }
  });
});
