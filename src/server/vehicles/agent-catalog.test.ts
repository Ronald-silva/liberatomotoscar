import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/server/db/schema';
import { buildAvailableVehicleQuery } from './agent-catalog';

const db = drizzle.mock({ schema });

describe('consulta segura do estoque para o agente', () => {
  it('restringe a anúncios publicados e aplica categoria e teto de preço em centavos', () => {
    const query = buildAvailableVehicleQuery(db, { type: 'motorcycle', maxPriceCents: 1_800_000, limit: 3 }).toSQL();
    expect(query.sql).toContain('"vehicles"."status" = $1');
    expect(query.sql).toContain('"vehicles"."price_cents" > $2');
    expect(query.sql).toContain('"vehicles"."type" = $3');
    expect(query.sql).toContain('"vehicles"."price_cents" <= $4');
    expect(query.sql).toContain('limit $5');
    expect(query.params).toEqual(['published', 0, 'motorcycle', 1_800_000, 3]);
    expect(query.sql).not.toContain('source_data');
  });

  it('trata caracteres de busca como texto comum, nunca como SQL ou wildcard', () => {
    const attack = "%_'; DROP TABLE vehicles;--";
    const query = buildAvailableVehicleQuery(db, { model: attack }).toSQL();
    expect(query.sql).toContain('strpos(');
    expect(query.sql).not.toContain('DROP TABLE');
    expect(query.params).toContain(attack.toLocaleLowerCase('pt-BR'));
    expect(query.params).toContain('published');
  });

  it('recusa filtro desconhecido, preço inválido e limite excessivo antes de consultar', () => {
    expect(() => buildAvailableVehicleQuery(db, { type: 'truck' as 'car' })).toThrow();
    expect(() => buildAvailableVehicleQuery(db, { maxPriceCents: -1 })).toThrow();
    expect(() => buildAvailableVehicleQuery(db, { limit: 100 })).toThrow();
    expect(() => buildAvailableVehicleQuery(db, { status: 'sold' } as never)).toThrow();
  });
});
