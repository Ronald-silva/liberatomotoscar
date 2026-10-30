import { describe, expect, it, vi } from 'vitest';
import { STORE } from '@/data/store';
import {
  buscarVeiculosSchema,
  chamarVendedorSchema,
  createAgentToolFunctions,
  createAgentTools,
  createAgentTurnState,
  registrarLeadSchema,
} from './tools';

/** Mesma forma que `publicFacts` devolve: marca, modelo e preço podem vir nulos do cadastro. */
type LinhaCatalogo = {
  id: string; slug: string; type: 'motorcycle' | 'car';
  brand: string | null; model: string | null; version: string | null;
  year: number | null; mileageKm: number | null; color: string | null;
  priceCents: number | null; versionNumber: number;
};

const motoPublicada: LinhaCatalogo = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'honda-cg-160-2022',
  type: 'motorcycle' as const,
  brand: 'Honda',
  model: 'CG 160 Start',
  version: null,
  year: 2022,
  mileageKm: 18_400,
  color: 'Vermelha',
  priceCents: 1_450_000,
  versionNumber: 1,
};

const carroPublicado: LinhaCatalogo = { ...motoPublicada,
  id: '22222222-2222-4222-8222-222222222222', slug: 'fiat-argo-2021', type: 'car' as const,
  brand: 'Fiat', model: 'Argo Drive', year: 2021, priceCents: 5_890_000 };

const semPreco: LinhaCatalogo = { ...motoPublicada,
  id: '44444444-4444-4444-8444-444444444444', slug: 'yamaha-fazer-sem-preco',
  brand: 'Yamaha', model: 'Fazer 250', priceCents: null };

function toolsComCatalogo(itens: LinhaCatalogo[] = [motoPublicada, carroPublicado]) {
  const state = createAgentTurnState();
  const searchVehicles = vi.fn(async (input: { brand?: string; type?: string; limit?: number }) => ({
    items: itens.filter((item) => (!input.brand || item.brand?.toLowerCase() === input.brand.toLowerCase())
      && (!input.type || item.type === input.type)).slice(0, input.limit ?? 3),
    checkedAt: '2026-10-29T12:00:00.000Z',
  }));
  const readVehicle = vi.fn(async ({ id }: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('uuid inválido');
    return { item: itens.find((item) => item.id === id) ?? null, checkedAt: '2026-10-29T12:00:00.000Z' };
  });
  const fn = createAgentToolFunctions(state, {
    searchVehicles: searchVehicles as never, readVehicle: readVehicle as never,
  });
  return { state, fn, searchVehicles, readVehicle };
}

describe('ferramentas do agente sobre o catálogo', () => {
  it('buscar_veiculos filtra por marca e devolve só aquela marca', async () => {
    const { fn } = toolsComCatalogo();
    const saida = await fn.buscarVeiculos({ marca: 'Honda' });
    expect(saida.veiculos).toHaveLength(1);
    expect(saida.veiculos[0].marca).toBe('Honda');
  });

  it('buscar_veiculos registra os ids devolvidos como citáveis no turno', async () => {
    const { fn, state } = toolsComCatalogo();
    await fn.buscarVeiculos({});
    expect([...state.allowedVehicles.keys()]).toEqual([motoPublicada.id, carroPublicado.id]);
  });

  it('buscar_veiculos converte teto em reais para centavos', async () => {
    const { fn, searchVehicles } = toolsComCatalogo();
    await fn.buscarVeiculos({ precoMax: 15_000 });
    expect(searchVehicles.mock.calls[0][0]).toMatchObject({ maxPriceCents: 1_500_000 });
  });

  it('buscar_veiculos nunca pede ao banco mais de 5 itens', async () => {
    const { fn, searchVehicles } = toolsComCatalogo();
    await fn.buscarVeiculos({ limite: 5 });
    expect(searchVehicles.mock.calls[0][0].limit).toBeLessThanOrEqual(5);
    expect(buscarVeiculosSchema.safeParse({ limite: 99 }).success).toBe(false);
  });

  it('descarta anúncio sem preço: não dá para oferecer o que ninguém pode honrar', async () => {
    const { fn, state } = toolsComCatalogo([motoPublicada, semPreco]);
    const saida = await fn.buscarVeiculos({});
    expect(saida.veiculos.map((v) => v.id)).toEqual([motoPublicada.id]);
    expect(state.allowedVehicles.has(semPreco.id)).toBe(false);
  });

  it('detalhar_veiculo com id inexistente devolve erro tratado, não exceção', async () => {
    const { fn } = toolsComCatalogo();
    const saida = await fn.detalharVeiculo({ id: '33333333-3333-4333-8333-333333333333' });
    expect(saida.encontrado).toBe(false);
    expect(saida).toHaveProperty('erro');
  });

  it('detalhar_veiculo com id malformado devolve erro tratado, não exceção', async () => {
    const { fn } = toolsComCatalogo();
    const saida = await fn.detalharVeiculo({ id: 'a-moto-vermelha' });
    expect(saida.encontrado).toBe(false);
  });

  it('dados_da_loja devolve o endereço e o telefone reais da loja', () => {
    const { fn } = toolsComCatalogo();
    const saida = fn.dadosDaLoja();
    expect(saida.endereco).toContain(STORE.street);
    expect(saida.telefone).toBe(STORE.phoneDisplay);
    expect(saida.mapa).toContain('google.com/maps');
  });

  it('registrar_lead acumula o fato no estado do turno, sem gravar no banco', () => {
    const { fn, state } = toolsComCatalogo();
    fn.registrarLead({ campo: 'budget', valor: 'até 15 mil' });
    expect(state.facts).toEqual([{ field: 'budget', quote: 'até 15 mil' }]);
  });

  it('registrar_lead sobrescreve o mesmo campo em vez de duplicar', () => {
    const { fn, state } = toolsComCatalogo();
    fn.registrarLead({ campo: 'budget', valor: 'até 15 mil' });
    fn.registrarLead({ campo: 'budget', valor: 'na verdade até 20 mil' });
    expect(state.facts).toEqual([{ field: 'budget', quote: 'na verdade até 20 mil' }]);
  });

  // O SDK valida a entrada contra o inputSchema antes de chamar execute (InvalidToolInputError),
  // então é o schema que protege o banco — não uma checagem dentro do execute.
  it('registrar_lead recusa campo fora dos nove que a caixa de entrada rotula', () => {
    expect(registrarLeadSchema.safeParse({ campo: 'cor_favorita', valor: 'azul' }).success).toBe(false);
    expect(registrarLeadSchema.safeParse({ campo: 'budget', valor: 'até 15 mil' }).success).toBe(true);
  });

  it('chamar_vendedor marca o motivo aceito pelo banco', () => {
    const { fn, state } = toolsComCatalogo();
    fn.chamarVendedor({ motivo: 'trade_in' });
    expect(state.handoffReason).toBe('trade_in');
  });

  it('chamar_vendedor recusa motivo que o CHECK do banco rejeitaria', () => {
    // 'operator' existe no CHECK mas é só do vendedor; 'duvida' não existe e violaria o CHECK.
    expect(chamarVendedorSchema.safeParse({ motivo: 'operator' }).success).toBe(false);
    expect(chamarVendedorSchema.safeParse({ motivo: 'duvida' }).success).toBe(false);
    expect(chamarVendedorSchema.safeParse({ motivo: 'financing' }).success).toBe(true);
  });

  it('expõe as cinco ferramentas com os nomes que o prompt cita', () => {
    const tools = createAgentTools(createAgentTurnState());
    expect(Object.keys(tools)).toEqual([
      'buscar_veiculos', 'detalhar_veiculo', 'dados_da_loja', 'registrar_lead', 'chamar_vendedor',
    ]);
  });
});
