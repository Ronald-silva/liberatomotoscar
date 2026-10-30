import { tool } from 'ai';
import { z } from 'zod';
import { GOOGLE_PROFILE, MAP_URL, STORE, STORE_ADDRESS_LINE } from '@/data/store';
import { resumoDaPolitica } from '@/data/store-policy';
import { buildVehicleTitle } from '@/lib/vehicle-title';
import type { HandoffReason, LeadFact } from '@/server/attendance/conversation-repository';
import { getVehicleDetails, searchAvailableVehicles } from '@/server/vehicles/agent-catalog';

export function semAcento(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

/** Teto do schema de `vehicleSearchInput`; pedir mais que isso faz o parse falhar. */
const MAX_RESULTADOS = 5;
/**
 * Marca, modelo, versão e cor são texto livre digitado no painel e viajam até o contexto do
 * modelo com cara de dado oficial do catálogo. O corte não impede uma instrução curta de
 * chegar lá — para isso serve a regra do prompt de tratar resultado de ferramenta como dado —
 * mas impede que um campo colado com um texto inteiro domine o contexto do turno.
 */
const MAX_TEXTO_DE_CADASTRO = 60;

function cortar(valor: string | null): string | null {
  if (valor === null) return null;
  const limpo = valor.replace(/\s+/g, ' ').trim();
  return limpo.length > MAX_TEXTO_DE_CADASTRO ? limpo.slice(0, MAX_TEXTO_DE_CADASTRO) : limpo;
}

/**
 * Campos que a caixa de entrada sabe rotular (`factLabels` em `atendimento/page.tsx`).
 * Um campo fora desta lista apareceria no painel como chave crua.
 */
export const leadFieldSchema = z.enum([
  'category', 'model', 'budget', 'payment', 'trade_in', 'timeline', 'visit', 'negotiation', 'purpose',
]);

/**
 * Motivos que o CHECK `handoffs_reason_valid` aceita de uma resposta automática.
 * `operator` existe no banco mas é só do vendedor: o agente não age em nome dele.
 */
export const handoffReasonSchema = z.enum(['visitor_request', 'financing', 'trade_in', 'ai_suggested']);

export const buscarVeiculosSchema = z.object({
  tipo: z.enum(['motorcycle', 'car']).optional().describe('moto ou carro, só quando o cliente deixou claro'),
  marca: z.string().trim().min(1).max(80).optional().describe('marca exata, ex: Honda'),
  modelo: z.string().trim().min(1).max(80).optional().describe('parte do nome do modelo, ex: CG'),
  precoMax: z.number().int().positive().max(20_000_000).optional()
    .describe('teto em REAIS informado pelo cliente, não em centavos'),
  limite: z.number().int().min(1).max(MAX_RESULTADOS).optional().describe('quantos trazer, no máximo 5'),
});

export const detalharVeiculoSchema = z.object({
  id: z.string().describe('id exato vindo de buscar_veiculos'),
});

export const registrarLeadSchema = z.object({
  campo: leadFieldSchema,
  // O limite baliza, não decide: a pergunta que poluiu a ficha em produção tinha 44 caracteres.
  // Quem distingue dado de frase é a instrução no prompt e na descrição da ferramenta.
  valor: z.string().trim().min(1).max(60)
    .describe('o dado em si, curto — "Saveiro Robust", "até 90 mil", "sábado 14h"'),
});

export const chamarVendedorSchema = z.object({ motivo: handoffReasonSchema });

export type VerifiedVehicle = {
  id: string;
  titulo: string;
  marca: string;
  modelo: string;
  tipo: 'motorcycle' | 'car';
  ano: number | null;
  quilometragem: number | null;
  cor: string | null;
  precoCentavos: number;
  slug: string;
};

/**
 * Estado do turno. As ferramentas escrevem aqui e nada vai ao banco durante a geração:
 * `commitAutomatedReply` é o único escritor seguro — ele confere sob `FOR UPDATE` se um
 * vendedor assumiu no meio do caminho e, se assumiu, descarta a resposta inteira. Uma
 * ferramenta gravando direto deixaria fato e handoff de uma resposta que foi jogada fora.
 */
export type AgentTurnState = {
  /** Só um veículo que passou por uma ferramenta pode ser citado na resposta (guarda 3.3). */
  allowedVehicles: Map<string, VerifiedVehicle>;
  /**
   * Termos que o modelo pediu ao estoque, em minúsculas e sem acento. Uma busca que não achou
   * nada autoriza a resposta honesta ("não encontrei nenhuma Yamaha publicada"). Marca e modelo
   * são separados porque o modelo pode buscar por um sem o outro, e a guarda precisa saber de
   * qual termo a frase honesta pode falar.
   */
  searchedBrands: Set<string>;
  searchedModels: Set<string>;
  /**
   * Alguma busca deste turno devolveu veículo. Enquanto for false, falar de uma marca buscada
   * só pode ser para dizer que não tem — e é por isso que `searchedBrands` não vira passe livre
   * para afirmar estoque.
   */
  searchFoundResults: boolean;
  /**
   * Veículos que entraram pela releitura dos turnos anteriores, não por uma busca deste turno.
   * Se a busca trouxer o mesmo modelo, o relido cede o lugar: eram esses dois que produziam
   * dois preços da mesma moto na mesma mensagem.
   */
  reconferredIds: Set<string>;
  facts: LeadFact[];
  handoffReason: HandoffReason | null;
};

export function createAgentTurnState(): AgentTurnState {
  return {
    allowedVehicles: new Map(), searchedBrands: new Set(), searchedModels: new Set(),
    searchFoundResults: false, reconferredIds: new Set(), facts: [], handoffReason: null,
  };
}

/**
 * Veículos que a resposta pode citar. Um anúncio relido de um turno anterior é descartado
 * quando a busca deste turno trouxe outro anúncio do mesmo modelo: o dado fresco manda, e sem
 * isso o preço antigo continuava citável ao lado do novo.
 */
export function veiculosCitaveis(state: AgentTurnState): VerifiedVehicle[] {
  const todos = [...state.allowedVehicles.values()];
  const modelosFrescos = new Set(
    todos.filter((v) => !state.reconferredIds.has(v.id)).map((v) => semAcento(v.modelo)),
  );
  return todos.filter((v) => !state.reconferredIds.has(v.id) || !modelosFrescos.has(semAcento(v.modelo)));
}

export type AgentToolDeps = {
  searchVehicles?: typeof searchAvailableVehicles;
  readVehicle?: typeof getVehicleDetails;
};

type CatalogRow = Awaited<ReturnType<typeof searchAvailableVehicles>>['items'][number];

/**
 * Marca, modelo e preço são nullable no cadastro. Um anúncio sem eles não pode ser oferecido:
 * sem preço o cliente recebe uma indicação que ninguém pode honrar, e sem marca a frase sai
 * sobre "um veículo". Linha incompleta é descartada aqui e nunca chega ao modelo.
 */
function toVerified(row: CatalogRow): VerifiedVehicle | null {
  if (!row.brand || !row.model || !row.priceCents || row.priceCents <= 0) return null;
  const marca = cortar(row.brand)!;
  const modelo = cortar(row.model)!;
  return {
    id: row.id,
    titulo: buildVehicleTitle(marca, modelo, cortar(row.version)),
    marca,
    modelo,
    tipo: row.type,
    ano: row.year,
    quilometragem: row.mileageKm,
    cor: cortar(row.color),
    precoCentavos: row.priceCents,
    slug: row.slug,
  };
}

export function createAgentToolFunctions(state: AgentTurnState, deps: AgentToolDeps = {}) {
  const searchVehicles = deps.searchVehicles ?? searchAvailableVehicles;
  const readVehicle = deps.readVehicle ?? getVehicleDetails;

  function remember(veiculos: VerifiedVehicle[]) {
    for (const veiculo of veiculos) state.allowedVehicles.set(veiculo.id, veiculo);
  }

  return {
    async buscarVeiculos({ tipo, marca, modelo, precoMax, limite }: z.infer<typeof buscarVeiculosSchema>) {
      if (marca) state.searchedBrands.add(semAcento(marca));
      if (modelo) state.searchedModels.add(semAcento(modelo));
      const { items, checkedAt } = await searchVehicles({
        type: tipo, brand: marca, model: modelo,
        maxPriceCents: precoMax ? precoMax * 100 : undefined,
        limit: Math.min(limite ?? 3, MAX_RESULTADOS),
      });
      const veiculos = items.map(toVerified).filter((item): item is VerifiedVehicle => item !== null);
      if (veiculos.length) state.searchFoundResults = true;
      remember(veiculos);
      return { veiculos, total: veiculos.length, consultadoEm: checkedAt };
    },

    async detalharVeiculo({ id }: z.infer<typeof detalharVeiculoSchema>) {
      // Id inventado ou malformado é erro do modelo, não falha do servidor: o turno
      // continua e o modelo recebe a recusa como resultado da ferramenta.
      try {
        const { item, checkedAt } = await readVehicle({ id });
        const veiculo = item ? toVerified(item) : null;
        if (!veiculo) {
          return { encontrado: false as const, erro: 'Este veículo não está publicado no estoque.' };
        }
        remember([veiculo]);
        return { encontrado: true as const, veiculo, consultadoEm: checkedAt };
      } catch {
        return { encontrado: false as const, erro: 'Id inválido: use um id exato devolvido por buscar_veiculos.' };
      }
    },

    dadosDaLoja() {
      const politica = resumoDaPolitica();
      return {
        nome: STORE.name,
        endereco: STORE_ADDRESS_LINE,
        cep: STORE.postalCode,
        telefone: STORE.phoneDisplay,
        mapa: MAP_URL,
        avaliacaoGoogle: `${GOOGLE_PROFILE.rating} (${GOOGLE_PROFILE.reviewCount} avaliações)`,
        // A separação é o ponto: o que está em `podeAfirmar` o agente responde sozinho; só o
        // que está em `precisaConfirmarComAloja` vai ao vendedor. Sem ela o agente encaminhava
        // até "aceitam cartão?", e cliente nenhum espera vendedor para isso.
        podeAfirmar: politica.confirmado,
        precisaConfirmarComAloja: politica.naoConfirmado,
      };
    },

    registrarLead({ campo, valor }: z.infer<typeof registrarLeadSchema>) {
      state.facts = [...state.facts.filter((fato) => fato.field !== campo), { field: campo, quote: valor }];
      return { anotado: true as const, campo };
    },

    chamarVendedor({ motivo }: z.infer<typeof chamarVendedorSchema>) {
      state.handoffReason = motivo;
      return { encaminhado: true as const, motivo };
    },
  };
}

export type AgentToolFunctions = ReturnType<typeof createAgentToolFunctions>;

/** As ferramentas como o modelo as vê. A validação de entrada é o `inputSchema`: o SDK
 *  recusa a chamada com `InvalidToolInputError` antes de executar. */
export function createAgentTools(state: AgentTurnState, deps: AgentToolDeps = {}) {
  const fn = createAgentToolFunctions(state, deps);
  return {
    buscar_veiculos: tool({
      description: 'Consulta o estoque publicado da loja. Use sempre que o cliente perguntar o que tem, '
        + 'pedir indicação, citar marca, modelo ou valor. É a única fonte de veículo, preço e disponibilidade.',
      inputSchema: buscarVeiculosSchema,
      execute: fn.buscarVeiculos,
    }),
    detalhar_veiculo: tool({
      description: 'Lê a ficha completa de um veículo pelo id devolvido por buscar_veiculos. '
        + 'Use antes de falar de quilometragem, cor ou ano de um veículo específico.',
      inputSchema: detalharVeiculoSchema,
      execute: fn.detalharVeiculo,
    }),
    dados_da_loja: tool({
      description: 'Tudo sobre a LOJA: endereço, telefone, mapa, avaliação, formas de pagamento '
        + 'aceitas, serviços e o que ainda não foi confirmado. Chame SEMPRE que perguntarem sobre '
        + 'pagamento, cartão, Pix, financiamento, troca, horário, garantia, onde ficam ou como chegar.',
      inputSchema: z.object({}),
      execute: async () => fn.dadosDaLoja(),
    }),
    registrar_lead: tool({
      description: 'Anota um dado que o cliente informou, para o vendedor ver na caixa de entrada. '
        + 'Grave o DADO, curto, não a frase inteira: para o campo model grave "Saveiro Robust", '
        + 'não "o que precisa pra fechar negócio na Saveiro?". Para visit, grave o dia e a hora '
        + 'combinados. O vendedor lê isso de relance antes de ligar.',
      inputSchema: registrarLeadSchema,
      execute: async (input) => fn.registrarLead(input),
    }),
    chamar_vendedor: tool({
      description: 'Encaminha a conversa a um vendedor humano. Use quando o cliente pedir pessoa, '
        + 'falar de troca ou financiamento, ou quando a pergunta depender de confirmação da loja.',
      inputSchema: chamarVendedorSchema,
      execute: async (input) => fn.chamarVendedor(input),
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
