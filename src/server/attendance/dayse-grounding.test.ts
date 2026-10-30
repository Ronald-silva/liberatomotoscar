import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import {
  answerFromPlatformKnowledge,
  detectMentionedCatalogTerms,
  detectMessageIntents,
  extractTradeInDetails,
  fallbackCatalogFromStatic,
  hasInstitutionalQuestion,
  isKnowledgeOrSpecificCatalogQuery,
  isTradeInClarification,
  isTradeInDataFollowUp,
  mentionsModelName,
  mergeTradeInDetails,
} from './knowledge';
import { buildVehicleTitle } from '@/lib/vehicle-title';
import { finalizeDemoAnswer } from '@/server/ai/demo-agent';
import type { AgentOutput } from '@/server/ai/demo-contracts';
import type { getVehicleDetails, searchAvailableVehicles } from '@/server/vehicles/agent-catalog';

const staticItems = fallbackCatalogFromStatic();

const mockSearchCatalog: typeof searchAvailableVehicles = vi.fn(async (input) => {
  let items = [...staticItems];
  if (input.type) items = items.filter((i) => i.type === input.type);
  items.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
  return {
    items: items.slice(0, input.limit ?? 3).map((i) => ({ ...i, versionNumber: 1 })),
    checkedAt: '2026-10-28T12:00:00.000Z',
  };
});

const baseOutput: AgentOutput = {
  reply: '', question: null, vehicleIds: [], facts: [], stage: 'researching',
  nextAction: 'ask_preference', wantsHuman: false,
};

// Nenhum caso aqui seleciona veículo (vehicleIds vazio), então a leitura de detalhes não é chamada.
const noDetails = vi.fn(async () => ({
  item: null, checkedAt: '2026-10-28T12:00:00.000Z',
})) as unknown as typeof getVehicleDetails;

/**
 * A base de conhecimento responde dados verificados (loja e catálogo). Quando a pergunta é de
 * consultoria, pós-venda ou política, ela precisa devolver matched=false para o modelo conduzir.
 * Antes dessas correções cada caso abaixo era capturado por um regex e respondido com o folder errado.
 */
describe('Dayse — a base não captura turnos que ela não sabe responder', () => {
  it('"posso trocar se eu não gostar" é devolução, não oferta de entrada', async () => {
    const message = 'E se eu nao gostar depois posso trocar?';
    expect(detectMessageIntents(message).asksTradeIn).toBe(false);
    const res = await answerFromPlatformKnowledge(message, mockSearchCatalog);
    expect(res.matched).toBe(false);
    expect(res.handoffReason).toBeNull();
  });

  it('"se eu atrasar uma parcela" é dúvida de pós-venda, não pedido de simulação', async () => {
    const message = 'O que acontece se eu atrasar uma parcela?';
    expect(detectMessageIntents(message).asksFinancing).toBe(false);
    const res = await answerFromPlatformKnowledge(message, mockSearchCatalog);
    expect(res.matched).toBe(false);
  });

  it('pergunta sobre garantia não devolve a reputação da loja no Google', async () => {
    const message = 'Tem algo com 2 anos de garantia?';
    expect(detectMessageIntents(message).asksAboutStoreOrTrust).toBe(false);
    const res = await answerFromPlatformKnowledge(message, mockSearchCatalog);
    expect(res.matched).toBe(false);
  });

  it('mantém a troca quando o cliente aponta um veículo próprio, mesmo falando de arrependimento', () => {
    expect(detectMessageIntents('Tenho uma Fan para dar na troca, e se eu nao gostar?').asksTradeIn).toBe(true);
  });

  it('continua reconhecendo oferta de entrada e pedido de financiamento legítimos', () => {
    expect(detectMessageIntents('Aceitam uma moto que tenho como entrada?').asksTradeIn).toBe(true);
    expect(detectMessageIntents('Vocês fazem financiamento da Saveiro?').asksFinancing).toBe(true);
  });
});

describe('Dayse — endereço é reconhecido em qualquer ordem e no plural', () => {
  it.each([
    'Vocês ficam onde?',
    'Onde vocês ficam?',
    'Qual o endereço de voces?',
    'Onde fica a loja?',
  ])('responde o endereço para %j', async (message) => {
    expect(detectMessageIntents(message).asksAddressOrLocation).toBe(true);
    const res = await answerFromPlatformKnowledge(message, mockSearchCatalog);
    expect(res.matched).toBe(true);
    expect(res.text).toContain('R. Elcias Lopes, 334, loja A');
  });
});

/**
 * Numa loja de seminovos quase toda frase útil cita o ano do veículo. O filtro antigo
 * descartava a resposta natural inteira ao ver quatro dígitos, trocando-a pelo texto padrão.
 */
describe('Dayse — a fala natural do modelo sobrevive ao filtro de segurança', () => {
  it('preserva a resposta que cita o ano do modelo', async () => {
    const reply = 'A Fan 2015 é mais econômica e a Titan tem mais torque no dia a dia.';
    const res = await finalizeDemoAnswer({ ...baseOutput, reply }, new Set(), ['Qual a diferença entre a Fan e a Titan?'],
      [], '2026-10-28T12:00:00.000Z', noDetails);
    expect(res.answer).toContain(reply);
  });

  it('continua descartando valor em reais e promessa de aprovação', async () => {
    for (const reply of ['Essa sai por R$ 10.990 à vista.', 'Seu financiamento está aprovado.']) {
      const res = await finalizeDemoAnswer({ ...baseOutput, reply }, new Set(), ['quanto custa?'],
        [], '2026-10-28T12:00:00.000Z', noDetails);
      expect(res.answer).not.toContain(reply);
    }
  });

  it('mantém a fala do modelo junto da nota institucional, em vez de descartá-la', async () => {
    const reply = 'Claro, pode trazer seu mecânico para olhar com calma.';
    const res = await finalizeDemoAnswer({ ...baseOutput, reply }, new Set(),
      ['Posso levar meu mecanico? Vocês ficam onde?'], [], '2026-10-28T12:00:00.000Z', noDetails);
    expect(res.answer).toContain(reply);
    expect(res.answer).toContain('R. Elcias Lopes, 334');
  });
});

/**
 * "Fazer" é o modelo da Yamaha e também o verbo mais comum do português. Antes da guarda de
 * ambiguidade, "quero fazer um financiamento" era respondido com a ficha da Yamaha Fazer.
 */
describe('Dayse — nome de modelo que é palavra comum exige pista de veículo', () => {
  it.each([
    'quero fazer um financiamento',
    'posso fazer uma proposta?',
    'o que você pode fazer por mim?',
    'é a primeira moto da minha vida, tenho medo de fazer uma má escolha',
    'sou fan de moto antiga',
    'quero algo pop, simples',
  ])('não confunde %j com um anúncio do catálogo', (message) => {
    expect(detectMentionedCatalogTerms(message).model).toBeUndefined();
  });

  it.each([
    ['a Fan serve pra garupa?', 'Fan'],
    ['quanto custa a Fazer 250?', 'Fazer'],
    ['gostei da Pop branca', 'Pop'],
    ['tenho interesse na Honda Titan', 'Titan'],
  ])('continua reconhecendo %j como o modelo %s', (message, model) => {
    expect(detectMentionedCatalogTerms(message).model).toBe(model);
  });

  it('exige marca, artigo, cor ou cilindrada junto do nome ambíguo', () => {
    expect(mentionsModelName('Fazer', 'vou fazer uma visita', 'Yamaha')).toBe(false);
    expect(mentionsModelName('Fazer', 'me fala da Fazer', 'Yamaha')).toBe(true);
    expect(mentionsModelName('Fazer', 'Yamaha Fazer 2014', 'Yamaha')).toBe(true);
    // Modelo sem colisão não precisa de pista nenhuma.
    expect(mentionsModelName('Saveiro', 'queria uma Saveiro', 'Volkswagen')).toBe(true);
  });

  it('a mensagem emocional de primeira compra passa a ser conduzida pelo modelo', () => {
    const message = 'é a primeira moto da minha vida, tenho medo de fazer uma má escolha';
    // Em produção o turno só vai para a base se um destes for verdadeiro (ver generateReply).
    expect(hasInstitutionalQuestion(message)).toBe(false);
    expect(isKnowledgeOrSpecificCatalogQuery(message)).toBe(false);
  });
});

describe('Dayse — cortesia e encerramento respondem sem custo de modelo', () => {
  it.each(['obrigado, vou pensar', 'ok', 'valeu!', 'kkkk', 'beleza'])(
    'responde %j pela base, sem empurrar estoque',
    async (message) => {
      expect(detectMessageIntents(message).asksCourtesyClosing).toBe(true);
      expect(hasInstitutionalQuestion(message)).toBe(true);
      const res = await answerFromPlatformKnowledge(message, mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.cards).toHaveLength(0);
      expect(res.handoffRequested).toBe(false);
      expect(res.text).toContain('à disposição');
    },
  );

  it('não captura o turno quando a cortesia vem junto de um pedido real', async () => {
    const res = await answerFromPlatformKnowledge('valeu! e qual o endereço de vocês?', mockSearchCatalog);
    expect(res.text).toContain('R. Elcias Lopes, 334, loja A');
  });
});

/**
 * O cadastro real repete marca e modelo no campo de versão, o que produzia
 * "Yamaha Lander 250 Yamaha xtz Lander 250" na vitrine e na fala da Dayse.
 */
describe('Título do veículo não repete palavra do cadastro', () => {
  it.each([
    [['Yamaha', 'Lander 250', 'Yamaha xtz Lander 250'], 'Yamaha Lander 250 xtz'],
    [['Volkswagen', 'Saveiro', 'Robust'], 'Volkswagen Saveiro Robust'],
    [['Yamaha', 'Lander 250', null], 'Yamaha Lander 250'],
    [['Honda', 'Titan', null], 'Honda Titan'],
  ])('monta %j como %j', (parts, expected) => {
    const [brand, model, version] = parts as [string, string, string | null];
    expect(buildVehicleTitle(brand, model, version)).toBe(expected);
  });

  it('ignora diferença de acento e caixa ao deduplicar', () => {
    expect(buildVehicleTitle('Citroën', 'C3', 'citroen c3 live')).toBe('Citroën C3 live');
  });
});

describe('Pedido de indicação chega ao modelo com estoque em mão', () => {
  it.each([
    'o que você sugere?',
    'qual você indica pra mim?',
    'é a primeira moto da minha vida',
    'to na duvida entre duas',
    'me ajuda a escolher',
  ])('reconhece %j como pedido de indicação', (message) => {
    expect(detectMessageIntents(message).asksRecommendation).toBe(true);
  });

  it('não confunde conversa comum com pedido de indicação', () => {
    expect(detectMessageIntents('qual o endereço de vocês?').asksRecommendation).toBe(false);
    expect(detectMessageIntents('obrigado').asksRecommendation).toBe(false);
  });
});

/**
 * `**texto **Nome** texto**` quebra o negrito do site e chega ao WhatsApp como
 * `*texto *Nome* texto*`, com asteriscos sobrando na tela do cliente.
 */
describe('Dayse — nenhuma resposta aninha negrito dentro de negrito', () => {
  const comNome = { customerName: 'Ronald' };
  it.each([
    'Aceitam uma moto que tenho como entrada?',
    'Vocês fazem financiamento?',
    '[MIDIA_WHATSAPP:AUDIO]',
    '[MIDIA_WHATSAPP:VISUAL] fotos do meu carro para troca',
    'Boa tarde',
    'obrigado, vou pensar',
  ])('mantém o negrito equilibrado em %j', async (message) => {
    const res = await answerFromPlatformKnowledge(message, mockSearchCatalog, comNome);
    const marcadores = res.text.match(/\*\*/g)?.length ?? 0;
    expect(marcadores % 2).toBe(0);
    // Um par de ** nunca deve abrir outro antes de fechar.
    expect(res.text).not.toMatch(/\*\*[^*\n]*\*\*[^*\n]*\*\*[^*\n]*!\*\*/);
  });
});

/**
 * O contexto da troca atravessa os turnos pelo fato `trade_in`, em forma canônica. Sem isso,
 * "é uma Honda Pop" virava busca no catálogo e "????" repetia a pergunta do ano.
 */
describe('Dayse — dados da troca acumulam entre turnos', () => {
  it('identifica o veículo do cliente sem consultar o estoque', async () => {
    const res = await answerFromPlatformKnowledge('é uma Honda Pop', mockSearchCatalog, {
      recentTradeIn: 'Aceitam uma moto que tenho como entrada?', customerName: 'Ronald',
    });
    expect(res.matched).toBe(true);
    expect(res.cards).toHaveLength(0);
    expect(res.text).toContain('Honda Pop');
    expect(res.text).not.toContain('Honda Titan');
    expect(res.facts.find((f) => f.field === 'trade_in')?.quote).toContain('Honda Pop');
  });

  it('acrescenta ano e quilometragem ao que já estava anotado', async () => {
    const comModelo = await answerFromPlatformKnowledge('2019', mockSearchCatalog, {
      recentTradeIn: 'Honda Pop',
    });
    expect(comModelo.facts.find((f) => f.field === 'trade_in')?.quote).toBe('Honda Pop; ano 2019');

    const comKm = await answerFromPlatformKnowledge('tem 18.000 km', mockSearchCatalog, {
      recentTradeIn: 'Honda Pop; ano 2019',
    });
    const quote = comKm.facts.find((f) => f.field === 'trade_in')?.quote;
    expect(quote).toContain('Honda Pop');
    expect(quote).toContain('ano 2019');
    expect(quote).toContain('18000 km');
    expect(comKm.cards).toHaveLength(0);
  });

  it('responde "????" com o que já sabe, sem repetir a pergunta do ano', async () => {
    const res = await answerFromPlatformKnowledge('????', mockSearchCatalog, {
      recentTradeIn: 'Honda Pop; ano 2019; 18000 km', customerName: 'Ronald',
    });
    expect(res.text).toContain('aceitamos Honda Pop como entrada');
    expect(res.text).toContain('18.000 km');
    expect(res.text).not.toMatch(/me diz o \*\*ano\*\*/);
  });

  it('a quilometragem da troca não é respondida com a do estoque', async () => {
    const res = await answerFromPlatformKnowledge('tem 18.000 km', mockSearchCatalog, {
      recentTradeIn: 'Honda Pop', recentModelOrTitle: 'Honda Titan',
    });
    expect(res.text).not.toContain('70.760');
    expect(res.text).toContain('18.000 km');
  });

  it('o veículo que o cliente quer comprar não substitui o da troca', () => {
    // "trocar na Fazer" é o alvo da compra; a usada continua sendo a Pop.
    const detalhes = extractTradeInDetails('quero trocar na Fazer, dando 3 mil de entrada');
    expect(detalhes.vehicle).toBeNull();
    const merged = mergeTradeInDetails(
      extractTradeInDetails('Honda Pop; ano 2019'),
      detalhes,
    );
    expect(merged.vehicle).toBe('Honda Pop');
    expect(merged.year).toBe(2019);
  });

  it('reconhece entrega de dado da troca e descarta pedido de compra', () => {
    expect(isTradeInDataFollowUp('é uma Honda Pop', 'tenho uma moto')).toBe(true);
    expect(isTradeInDataFollowUp('2019', 'Honda Pop')).toBe(true);
    expect(isTradeInDataFollowUp('tem 18.000 km', 'Honda Pop')).toBe(true);
    expect(isTradeInDataFollowUp('quero comprar a Fazer', 'Honda Pop')).toBe(false);
    expect(isTradeInDataFollowUp('2019', null)).toBe(false);
  });

  it('cobrança curta sobre a proposta é tratada como retomada da troca', () => {
    expect(isTradeInClarification('aceita?', 'bicicleta elétrica; 2 mil')).toBe(true);
    expect(isTradeInClarification('e aí?', 'Honda Pop')).toBe(true);
    expect(isTradeInClarification('aceita?', null)).toBe(false);
  });
});

/**
 * A Dayse pede "a marca, o modelo e o estado do item" e o cliente responde. Tratar essa
 * resposta como pedido de compra ("bicicleta não temos por aqui") é não entender a própria
 * pergunta — foi o que aconteceu no teste real pelo WhatsApp.
 */
describe('Proposta de item fora do nicho continua aberta enquanto o cliente fala dele', () => {
  const proposta = 'tenho uma bicicleta elétrica avaliada em 2 mil reais. aceitam de entrada para aquisição de uma bros?';

  it('entende a descrição do item como resposta à pergunta, não como pedido de compra', async () => {
    const res = await answerFromPlatformKnowledge(
      'Bicicleta Elétrica Honeywhale S150 Para Adultos, Com Aro 29 e Bateria Removível de 22.5Ah',
      mockSearchCatalog,
      { recentTradeIn: 'bicicleta elétrica; 2 mil reais; entrada na Bros', customerName: 'Ronald' },
    );
    expect(res.text).not.toContain('não temos por aqui');
    expect(res.text).toContain('Honeywhale');
    expect(res.handoffReason).toBe('trade_in');
    // Não pode prometer aceite nem valor: a avaliação é presencial.
    expect(res.text).not.toMatch(/\baceitamos\b/);
    expect(res.text).toMatch(/avaliação|loja/i);
  });

  it('não ecoa a cobrança de resposta como se fosse a descrição do item', async () => {
    const res = await answerFromPlatformKnowledge('Aceitam ela?', mockSearchCatalog,
      { recentTradeIn: proposta, customerName: 'Ronald' });
    expect(res.text).toContain('precisa ser confirmado');
    expect(res.text).not.toContain('**Aceitam ela?**');
  });

  it('preserva o item e o valor estimado no fato entregue ao vendedor', async () => {
    const res = await answerFromPlatformKnowledge('Bicicleta Honeywhale S150, aro 29', mockSearchCatalog,
      { recentTradeIn: 'bicicleta elétrica; 2 mil reais; entrada na Bros', customerName: 'Ronald' });
    const quote = res.facts.find((f) => f.field === 'trade_in')?.quote ?? '';
    expect(quote).toContain('2 mil reais');
    expect(quote).toContain('Honeywhale');
  });

  it('solta a proposta quando o cliente volta a procurar veículo', async () => {
    const res = await answerFromPlatformKnowledge('quero ver uma moto do estoque', mockSearchCatalog,
      { recentTradeIn: 'bicicleta elétrica; 2 mil reais', customerName: 'Ronald' });
    expect(res.text).not.toContain('Honeywhale');
    expect(res.cards.length).toBeGreaterThan(0);
  });
});

/**
 * Casos achados varrendo dezenas de mensagens reais de uma vez, em vez de uma por conversa
 * do cliente. São os que mais constrangem numa demonstração.
 */
describe('Varredura — falsos positivos que envergonham', () => {
  it('"tem ar condicionado?" pergunta por item do carro, não por eletrodoméstico', async () => {
    expect(detectMessageIntents('tem ar condicionado?').asksOutOfScopeProduct).toBeNull();
    const res = await answerFromPlatformKnowledge('a saveiro tem ar condicionado?', mockSearchCatalog,
      { customerName: 'Ronald' });
    expect(res.text).not.toContain('não temos por aqui');
    expect(res.text).toContain('Saveiro');
  });

  it.each(['direcao hidraulica', 'vidro eletrico', 'airbag', 'abs'])(
    '"%s" conta como ficha do veículo', (item) => {
      expect(detectMessageIntents(`a strada tem ${item}?`).asksSpecificAttribute.engineOrSpecs).toBe(true);
    },
  );

  it('"vocês vendem celular?" não devolve o telefone da loja', () => {
    expect(detectMessageIntents('voces vendem celular?').asksPhoneOrWhatsapp).toBe(false);
    // Pedir o contato continua funcionando.
    expect(detectMessageIntents('qual o telefone de voces?').asksPhoneOrWhatsapp).toBe(true);
    expect(detectMessageIntents('qual o numero do whatsapp?').asksPhoneOrWhatsapp).toBe(true);
  });

  it('modelo conhecido mas sem anúncio publicado recebe resposta honesta, não a vitrine inteira', async () => {
    // Em produção a Fan está no catálogo estático mas não entre os anúncios publicados.
    const semFan: typeof searchAvailableVehicles = vi.fn(async (input) => {
      const base = await mockSearchCatalog(input);
      return { ...base, items: base.items.filter((i) => !/fan/i.test(i.model ?? '')) };
    });
    const res = await answerFromPlatformKnowledge('qual o preco da fan', semFan, { customerName: 'Ronald' });
    expect(res.text).toMatch(/não temos/i);
    expect(res.text).toMatch(/fan/i);
    // Continua oferecendo alternativas reais em vez de encerrar a conversa.
    expect(res.cards.length).toBeGreaterThan(0);
  });

  it('"qual o valor da entrada?" é financiamento, não pedido de vitrine', async () => {
    const res = await answerFromPlatformKnowledge('qual o valor da entrada?', mockSearchCatalog,
      { customerName: 'Ronald' });
    expect(res.text).toContain('análise de crédito');
    expect(res.cards).toHaveLength(0);
  });

  it('itens realmente fora do nicho continuam bloqueados', async () => {
    for (const item of ['tem cama box?', 'tem bicicleta?']) {
      const res = await answerFromPlatformKnowledge(item, mockSearchCatalog, { customerName: 'Ronald' });
      expect(res.text).toContain('não temos por aqui');
    }
  });
});

describe('Varredura — objeções, histórico e acompanhamento', () => {
  it('pergunta sobre o passado do veículo não vira oferta de vitrine', () => {
    const historico = detectMessageIntents('ja foi de aplicativo?');
    expect(historico.asksWorkOrAppUseCase).toBe(false);
    expect(detectMessageIntents('o motor ja foi retificado?').asksSpecificAttribute.engineOrSpecs).toBe(false);
    expect(detectMessageIntents('essa moto ja bateu?').asksSpecificAttribute.engineOrSpecs).toBe(false);
  });

  it('objeção de preço comparando com concorrente não pede o mais barato do estoque', () => {
    expect(detectMessageIntents('vi mais barato em outra loja').asksCheapest).toBe(false);
    expect(detectMessageIntents('achei mais barato em outro lugar').asksCheapest).toBe(false);
    // Pedido legítimo pelo mais barato continua valendo.
    expect(detectMessageIntents('qual a moto mais barata?').asksCheapest).toBe(true);
  });

  it('"e o ano?" é acompanhamento tão válido quanto "quantos km?"', () => {
    for (const m of ['e o ano?', 'qual ano?', 'ano?', 'qual o ano dela?']) {
      expect(detectMessageIntents(m).asksSpecificAttribute.year).toBe(true);
    }
  });

  it('resolve km, cor e ano em sequência sobre o veículo em foco', async () => {
    const contexto = { recentModelOrTitle: 'Honda Titan', customerName: 'Ronald' };
    const km = await answerFromPlatformKnowledge('quantos km?', mockSearchCatalog, contexto);
    const cor = await answerFromPlatformKnowledge('qual a cor?', mockSearchCatalog, contexto);
    const ano = await answerFromPlatformKnowledge('e o ano?', mockSearchCatalog, contexto);
    expect(km.text).toContain('Honda Titan');
    expect(cor.text).toContain('Honda Titan');
    expect(ano.text).toContain('Honda Titan');
    expect(ano.text).toMatch(/20\d{2}/);
  });
});

describe('Varredura — contexto não pode ser contaminado', () => {
  it('frase solta do cliente não vira "modelo do veículo" no contexto', () => {
    // O modelo chegou a devolver a mensagem inteira como se fosse o modelo procurado.
    expect(detectMentionedCatalogTerms('posso levar meu mecanico?').mentionsAnyModel).toBe(false);
    expect(detectMentionedCatalogTerms('to procurando minha primeira moto').mentionsAnyModel).toBe(false);
    // Um modelo de verdade continua valendo como contexto.
    expect(detectMentionedCatalogTerms('gostei da Titan').mentionsAnyModel).toBe(true);
  });
});

/**
 * Varredura adversarial: cada mensagem usa, de propósito, uma palavra-gatilho no sentido que
 * NÃO é intenção de compra. Foi a família por trás de quase todo defeito encontrado — "troca
 * de óleo" virando troca de veículo, "banco rasgado" virando banco financiador.
 */
describe('Varredura adversarial — palavra-gatilho em outro sentido', () => {
  it.each([
    ['troca de óleo não é troca de veículo', 'voces fazem troca de oleo?', 'asksTradeIn'],
    ['trocar pneu não é troca de veículo', 'precisa trocar o pneu?', 'asksTradeIn'],
    ['banco rasgado não é banco financiador', 'o banco da moto ta rasgado?', 'asksFinancing'],
    ['cartão do veículo não é cartão de crédito', 'tem o cartao do veiculo?', 'asksFinancing'],
    ['entrada da loja não é entrada de pagamento', 'a entrada da loja e pela frente?', 'asksFinancing'],
    ['entregar em casa não é perfil de entregador', 'voces entregam a moto em casa?', 'asksWorkOrAppUseCase'],
    ['app do banco não é moto de aplicativo', 'posso pagar pelo app do banco?', 'asksWorkOrAppUseCase'],
    ['peça em estoque não é vitrine', 'tem peca em estoque?', 'asksAllInventory'],
    ['visita técnica não é visita à loja', 'voces fazem visita tecnica?', 'asksHoursOrVisit'],
  ])('%s', (_motivo, mensagem, campo) => {
    const intents = detectMessageIntents(mensagem) as unknown as Record<string, boolean>;
    expect(intents[campo]).toBe(false);
  });

  it.each([
    'qual o numero do chassi?',
    'me passa o numero da placa',
  ])('número de documento não devolve o telefone da loja: %j', (mensagem) => {
    expect(detectMessageIntents(mensagem).asksPhoneOrWhatsapp).toBe(false);
  });

  it('cidade e rua citadas como origem do cliente não pedem o endereço da loja', () => {
    expect(detectMessageIntents('moro na rua sao joao, voces vao ate la?').asksAddressOrLocation).toBe(false);
    expect(detectMessageIntents('aqui em fortaleza tem muita moto').asksAddressOrLocation).toBe(false);
    // Pedido real do endereço continua valendo.
    expect(detectMessageIntents('qual o endereco de voces?').asksAddressOrLocation).toBe(true);
    expect(detectMessageIntents('em que bairro fica a loja?').asksAddressOrLocation).toBe(true);
  });

  it('os pedidos legítimos continuam sendo atendidos pela base', () => {
    expect(detectMessageIntents('aceitam troca?').asksTradeIn).toBe(true);
    expect(detectMessageIntents('da pra parcelar no cartao de credito?').asksFinancing).toBe(true);
    expect(detectMessageIntents('quero moto pra trabalhar com entregas').asksWorkOrAppUseCase).toBe(true);
    expect(detectMessageIntents('quais veiculos voces tem?').asksAllInventory).toBe(true);
    expect(detectMessageIntents('qual o horario de funcionamento?').asksHoursOrVisit).toBe(true);
    expect(detectMessageIntents('qual o numero do whatsapp?').asksPhoneOrWhatsapp).toBe(true);
  });
});
