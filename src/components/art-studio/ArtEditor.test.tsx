// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BRAND } from '@/data/brand';
import { ART_DESTINATIONS, DESTINATION_ORDER, type ArtDestination } from './destinations';

/**
 * O contrato da **tela**.
 *
 * Esta é a única tarefa do plano que começou sem rede: `ArtEditor.tsx` nunca teve teste, e é nele
 * que moram seis itens do §7 do spec ("o que não pode regredir") que uma reescrita perde em
 * silêncio — o JPEG 0,92 em `pixelRatio: 1`, a conferência de versão antes de entregar com a
 * revalidação de 120 s, as frases próprias de `NotAllowedError` e de `TypeError`, o
 * `fallback: 'none'` do caminho de compartilhar, a travessa do texto auxiliar confirmado e o
 * bloqueio por `exportProblem`. Os seis estão afirmados aqui, nomeados um por um.
 *
 * O palco do Konva não monta sob happy-dom (não há contexto 2D), então `./ArtCanvas` é dublado — e
 * o duplo é o instrumento de medida da tarefa: ele registra **qual instância** desenhou **qual
 * destino** com **quais opções**, que é como se prova que a pré-renderização usa um palco oculto
 * só, reaproveitado, em sequência, e separado da prévia (§8.2).
 */

const estado = vi.hoisted(() => ({
  proximo: { id: 0 },
  montagens: [] as { id: number; destino: string }[],
  desmontagens: [] as number[],
  desenhos: [] as { id: number; destino: string; opcoes: unknown; pintado: boolean }[],
  foto: { estado: 'loading' as 'loading' | 'ready' | 'error', erro: undefined as string | undefined },
  /** O que o teto de altura obrigou o layout a deixar de fora. '' é o caso normal. */
  descartados: '',
  // O palco oculto busca a foto por conta própria: até ela chegar, exportar sairia sem o veículo.
  fotoOculta: { estado: 'ready' as 'loading' | 'ready' | 'error' },
  // Permite segurar um `toBlob` no meio do caminho, para observar lote em curso e aborto.
  espera: { ativa: false, fila: [] as (() => void)[] },
}));

vi.mock('./ArtCanvas', async () => {
  const { createElement, useEffect, useRef } = await import('react');
  type Props = {
    destination: ArtDestination; showChrome: boolean; title: string;
    stageRef: { current: unknown }; onPhotoLoad: (estado: 'loading' | 'ready' | 'error', erro?: string) => void;
    onDropped?: (descartados: string) => void;
  };
  function ArtCanvasDuplo({ destination, showChrome, title, stageRef, onPhotoLoad, onDropped }: Props) {
    const id = useRef(0);
    if (id.current === 0) id.current = ++estado.proximo.id;
    const meu = id.current;
    // O Konva desenha num quadro de animação, não no comito: props novas só estão **pintadas** no
    // quadro seguinte. Exportar antes disso devolve os pixels do destino anterior — ou nada.
    const pintado = useRef(false);
    pintado.current = false;
    useEffect(() => {
      const quadro = requestAnimationFrame(() => { pintado.current = true; });
      return () => cancelAnimationFrame(quadro);
    });
    stageRef.current = {
      toBlob: async (opcoes: unknown) => {
        estado.desenhos.push({ id: meu, destino: destination, opcoes, pintado: pintado.current });
        if (estado.espera.ativa) await new Promise<void>((solta) => estado.espera.fila.push(solta));
        return new Blob([destination], { type: 'image/jpeg' });
      },
    };
    useEffect(() => {
      estado.montagens.push({ id: meu, destino: destination });
      return () => { estado.desmontagens.push(meu); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // A instância 1 é a da prévia; da 2 em diante é o palco oculto.
    const minhaFoto = meu === 1 ? estado.foto.estado : estado.fotoOculta.estado;
    useEffect(() => { onPhotoLoad(minhaFoto, meu === 1 ? estado.foto.erro : undefined); },
      [onPhotoLoad, destination, minhaFoto, meu]);
    useEffect(() => { onDropped?.(estado.descartados); }, [onDropped, destination]);
    return createElement('div', { 'data-destino': destination, 'data-fantasma': String(showChrome), 'data-titulo': title });
  }
  return { default: ArtCanvasDuplo };
});

// `next/dynamic` resolveria o duplo numa microtarefa e todo teste passaria a esperar por ele.
vi.mock('next/dynamic', async () => {
  const modulo = await import('./ArtCanvas') as { default: unknown };
  return { default: () => modulo.default };
});

const entregas = vi.hoisted(() => ({ chamadas: [] as Record<string, unknown>[] }));
vi.mock('./share-art', async (original) => {
  const real = await original() as Record<string, unknown>;
  const deliverArt = real.deliverArt as (args: Record<string, unknown>) => Promise<unknown>;
  return { ...real, deliverArt: (args: Record<string, unknown>) => { entregas.chamadas.push(args); return deliverArt(args); } };
});

const lotes = vi.hoisted(() => ({ chamadas: [] as Record<string, unknown>[] }));
vi.mock('./art-render', async (original) => {
  const real = await original() as Record<string, unknown>;
  const renderDestinations = real.renderDestinations as (args: Record<string, unknown>) => Promise<void>;
  return { ...real, renderDestinations: (args: Record<string, unknown>) => { lotes.chamadas.push(args); return renderDestinations(args); } };
});

import { ArtEditor } from './ArtEditor';

const fonte = () => readFileSync('src/components/art-studio/ArtEditor.tsx', 'utf8');

const VEICULO = {
  id: 'v1', version: 3, slug: 'honda-cg-160-titan', title: 'Honda CG 160 Titan Start',
  brand: 'Honda', model: 'CG 160 Titan', type: 'motorcycle' as const, year: 2019,
  mileageKm: 42_380, color: 'Preta', price: 'R$ 18.900,00', priceCents: 1_890_000,
  status: 'published', publicUrl: 'https://liberato.example/veiculos/honda-cg-160-titan',
};
const FOTOS = [{ id: 'p1', isCover: true, src: '/api/admin/vehicles/v1/art-photo/p1' },
  { id: 'p2', isCover: false, src: '/api/admin/vehicles/v1/art-photo/p2' }];

function props(extra: Record<string, unknown> = {}) {
  return { vehicle: VEICULO, photos: FOTOS, phone: '(85) 99636-5664', exportProblem: null,
    brand: BRAND, ...extra };
}

/** O duplo com a foto pronta é o que destrava a pré-renderização. */
function comFotoPronta() { estado.foto = { estado: 'ready', erro: undefined }; }

const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome }) as HTMLButtonElement;

let compartilhamentos: ShareData[];
let baixados: string[];
let copiados: string[];
let conferencias: string[];
let respostaDaConferencia: () => Response;

beforeEach(() => {
  estado.proximo.id = 0;
  estado.montagens.length = 0;
  estado.desmontagens.length = 0;
  estado.desenhos.length = 0;
  estado.espera = { ativa: false, fila: [] };
  estado.foto = { estado: 'loading', erro: undefined };
  estado.fotoOculta = { estado: 'ready' };
  estado.descartados = '';
  entregas.chamadas.length = 0;
  lotes.chamadas.length = 0;
  compartilhamentos = [];
  baixados = [];
  copiados = [];
  conferencias = [];
  respostaDaConferencia = () => new Response('{}', { status: 200 });
  window.localStorage.clear();
  if (!('fonts' in document)) {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { conferencias.push(String(url)); return respostaDaConferencia(); }));
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'share', { configurable: true,
    value: async (data: ShareData) => { compartilhamentos.push(data); } });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async (texto: string) => { copiados.push(texto); } } });
  // O download real cria um <a> e clica: aqui só interessa que ele foi (ou não foi) acionado.
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:fake');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    baixados.push(this.download);
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Espera o lote de pré-renderização dos quatro destinos terminar. */
async function loteCompleto() {
  await waitFor(() => expect(estado.desenhos.length).toBe(4), { timeout: 3000 });
  await waitFor(() => expect(screen.queryByText(/Preparando os arquivos/)).toBeNull(), { timeout: 3000 });
}

// ─── A tela (§8.3) ───────────────────────────────────────────────────────────────────────────────

it('não pede escolha de formato nem de plataforma', () => {
  render(<ArtEditor {...props()} />);
  expect(screen.queryByText(/Formato da arte/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /^Instagram$/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Facebook$/ })).toBeNull();
  expect(screen.queryByText(/^1\. /)).toBeNull();
  expect(screen.queryByText(/^4\. /)).toBeNull();
});

it('abre com um botão de publicar nomeado pelo destino', () => {
  render(<ArtEditor {...props()} />);
  expect(botao(/Publicar no/)).toBeTruthy();
  expect(botao(/Publicar no/).textContent).toBe(ART_DESTINATIONS[DESTINATION_ORDER[0]].actionLabel);
});

it('oferece os quatro destinos e trocar de destino troca o rótulo do botão', () => {
  render(<ArtEditor {...props()} />);
  for (const d of DESTINATION_ORDER) expect(botao(ART_DESTINATIONS[d].label)).toBeTruthy();
  fireEvent.click(botao(ART_DESTINATIONS.tiktok.label));
  expect(botao('Publicar no TikTok')).toBeTruthy();
  fireEvent.click(botao(ART_DESTINATIONS.whatsapp.label));
  expect(botao('Publicar no Status')).toBeTruthy();
});

// A ficha diz o nome do destino e só ele: a dimensão mora na linha de apoio, fora do botão. Dentro
// do botão ela entraria no nome acessível ("Feed 1080 × 1350") e quem usa leitor de tela ouviria o
// número a cada ficha, antes de saber qual é a rede.
it('a ficha do destino é nomeada só pela rede, e a dimensão aparece fora dela', () => {
  render(<ArtEditor {...props()} />);
  for (const d of DESTINATION_ORDER) {
    expect(botao(ART_DESTINATIONS[d].label).textContent).toBe(ART_DESTINATIONS[d].label);
  }
  fireEvent.click(botao(ART_DESTINATIONS.feed.label));
  expect(screen.getByText(/1080 × 1350/)).toBeTruthy();
  fireEvent.click(botao(ART_DESTINATIONS.tiktok.label));
  expect(screen.getByText(/1080 × 1920/)).toBeTruthy();
});

it('a prévia troca de destino junto com a ficha', () => {
  const { container } = render(<ArtEditor {...props()} />);
  const previa = () => container.querySelector('[data-palco="previa"] [data-destino]')?.getAttribute('data-destino');
  fireEvent.click(botao(ART_DESTINATIONS.tiktok.label));
  expect(previa()).toBe('tiktok');
  fireEvent.click(botao(ART_DESTINATIONS.story.label));
  expect(previa()).toBe('story');
});

it('o fantasma da interface vem ligado e tem interruptor para esconder', () => {
  const { container } = render(<ArtEditor {...props()} />);
  const fantasma = () => container.querySelector('[data-palco="previa"] [data-fantasma]')?.getAttribute('data-fantasma');
  expect(fantasma()).toBe('true');
  fireEvent.click(screen.getByLabelText(/onde o aplicativo escreve/i));
  expect(fantasma()).toBe('false');
});

it('Baixar continua disponível quando não há compartilhamento', () => {
  render(<ArtEditor {...props({ shareSupport: 'unsupported' })} />);
  expect(botao('Baixar')).toBeTruthy();
  expect(screen.getByText(/não abre aplicativos instalados/)).toBeTruthy();
});

it('os botões-âncora de celular saíram', () => {
  render(<ArtEditor {...props()} />);
  expect(screen.queryByText('Ver prévia da arte')).toBeNull();
  expect(screen.queryByText('Alterar opções')).toBeNull();
});

it('o texto auxiliar livre ainda exige confirmação; a legenda não', () => {
  render(<ArtEditor {...props()} />);
  expect(screen.queryByLabelText(/Confirmei/)).toBeNull();
  fireEvent.change(screen.getByLabelText(/Texto auxiliar/), { target: { value: 'Entrada facilitada' } });
  expect(screen.getByLabelText(/Confirmei/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Legenda/), { target: { value: 'Legenda editada à mão' } });
  expect(screen.queryByLabelText(/autorizo a legenda/i)).toBeNull();
});

it('o selo oferece só o que a situação do cadastro permite', () => {
  render(<ArtEditor {...props()} />);
  expect(botao('Recém-chegado')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Vendido' })).toBeNull();
  cleanup();
  render(<ArtEditor {...props({ vehicle: { ...VEICULO, status: 'sold' } })} />);
  expect(botao('Vendido')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Destaque da semana' })).toBeNull();
});

// ─── Memória do aparelho (§8.3) ──────────────────────────────────────────────────────────────────

it('lembra o último destino e o último selo', () => {
  window.localStorage.setItem('liberato:arte:destino', 'tiktok');
  window.localStorage.setItem('liberato:arte:selo', 'highlight');
  render(<ArtEditor {...props()} />);
  expect(botao('Publicar no TikTok')).toBeTruthy();
  expect(botao('Destaque da semana').getAttribute('aria-pressed')).toBe('true');
});

it('grava o destino e o selo tocados', () => {
  render(<ArtEditor {...props()} />);
  fireEvent.click(botao(ART_DESTINATIONS.whatsapp.label));
  expect(window.localStorage.getItem('liberato:arte:destino')).toBe('whatsapp');
  fireEvent.click(botao('Preço em destaque'));
  expect(window.localStorage.getItem('liberato:arte:selo')).toBe('offer');
});

// Um selo lembrado que a situação de hoje não permite é dado vencido: o veículo foi vendido depois
// da última visita. Honrá-lo publicaria "Destaque da semana" num carro já vendido.
it('ignora o selo lembrado que a situação atual não permite', () => {
  window.localStorage.setItem('liberato:arte:selo', 'highlight');
  render(<ArtEditor {...props({ vehicle: { ...VEICULO, status: 'sold' } })} />);
  expect(botao('Vendido').getAttribute('aria-pressed')).toBe('true');
});

it('sobrevive a localStorage indisponível', async () => {
  // Trocar o **objeto** `localStorage`, não espionar `Storage.prototype`: medido, o espião no
  // protótipo não chega a `window.localStorage` quando o arquivo inteiro roda (chega quando o teste
  // roda sozinho), e um teste de sobrevivência que não faz nada lançar passa com o `try/catch`
  // arrancado. É o teste sem dentes que esta tarefa não pode repetir.
  const quebrado = () => { throw new Error('bloqueado'); };
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true,
    value: { getItem: quebrado, setItem: quebrado, removeItem: quebrado, clear: quebrado, key: quebrado, length: 0 } });
  // O erro de dentro do manipulador de clique não sobe pelo `fireEvent`: ele vira `reportError` ou
  // evento `error` da janela. As duas redes ficam armadas.
  const erros: unknown[] = [];
  const ouvinte = (evento: ErrorEvent) => { erros.push(evento.error ?? evento.message); evento.preventDefault(); };
  window.addEventListener('error', ouvinte);
  Object.defineProperty(window, 'reportError', { configurable: true, value: (erro: unknown) => { erros.push(erro); } });
  try {
    expect(() => render(<ArtEditor {...props()} />)).not.toThrow();
    fireEvent.click(botao(ART_DESTINATIONS.tiktok.label));
    expect(botao('Publicar no TikTok')).toBeTruthy();
    fireEvent.click(botao('Preço em destaque'));
    expect(botao('Preço em destaque').getAttribute('aria-pressed')).toBe('true');
  } finally {
    await new Promise((pronto) => setTimeout(pronto, 50));
    window.removeEventListener('error', ouvinte);
    Reflect.deleteProperty(window, 'reportError');
    if (original) Object.defineProperty(window, 'localStorage', original);
  }
  expect(erros).toEqual([]);
});

// ─── Pré-renderização dos quatro destinos (§8.2) ─────────────────────────────────────────────────

it('pré-renderiza os quatro destinos num palco oculto só, fora da prévia', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  expect(estado.desenhos.map((d) => d.destino)).toEqual([...DESTINATION_ORDER]);
  // Um palco só, reaproveitado: os quatro desenhos saem da mesma instância...
  const desenharam = new Set(estado.desenhos.map((d) => d.id));
  expect(desenharam.size).toBe(1);
  // ...e não é a da prévia, que é a primeira a montar.
  expect(desenharam.has(estado.montagens[0].id)).toBe(false);
  expect(estado.montagens.length).toBe(2);
});

it('desenha os quatro em sequência: o segundo só começa quando o primeiro termina', async () => {
  estado.espera.ativa = true;
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await waitFor(() => expect(estado.desenhos.length).toBe(1));
  await new Promise((pronto) => setTimeout(pronto, 60));
  expect(estado.desenhos.length).toBe(1);
  estado.espera.fila.shift()!();
  await waitFor(() => expect(estado.desenhos.length).toBe(2));
  expect(estado.desenhos.length).toBe(2);
});

// Sem esperar o quadro, o `toBlob` sai com os pixels do destino anterior: o arquivo do Stories
// sairia com a área segura do Feed, e nada na tela acusaria.
it('não exporta antes de o palco oculto pintar o destino', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  expect(estado.desenhos.map((d) => d.pintado)).toEqual([true, true, true, true]);
});

it('exporta JPEG 0,92 em pixelRatio 1 nos quatro', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  for (const desenho of estado.desenhos) {
    expect(desenho.opcoes).toEqual({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio: 1 });
  }
});

// A prévia já está em 1080×N e só é reduzida por `transform: scale()` no CSS, então `pixelRatio: 1`
// exporta 1080 de verdade. Subir o pixelRatio multiplicaria a memória no celular sem mudar o
// arquivo — e é o §7 do spec que crava o 1.
it('nenhuma chamada de toBlob no arquivo foge do JPEG 0,92 em pixelRatio 1', () => {
  const chamadas = fonte().match(/toBlob\([^)]*\)/g) ?? [];
  expect(chamadas.length).toBeGreaterThan(0);
  for (const chamada of chamadas) {
    expect(chamada).toMatch(/mimeType: 'image\/jpeg'/);
    expect(chamada).toMatch(/quality: 0\.92/);
    expect(chamada).toMatch(/pixelRatio: 1\b/);
  }
});

it('libera o palco oculto quando o lote termina', async () => {
  comFotoPronta();
  const { container } = render(<ArtEditor {...props()} />);
  await loteCompleto();
  const oculto = estado.desenhos[0].id;
  await waitFor(() => expect(estado.desmontagens).toContain(oculto));
  expect(container.querySelector('[data-palco="oculto"]')).toBeNull();
});

it('passa o signal ao lote e aborta quando o cadastro da peça muda', async () => {
  estado.espera.ativa = true;
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await waitFor(() => expect(lotes.chamadas.length).toBe(1));
  const signal = lotes.chamadas[0].signal as AbortSignal;
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal.aborted).toBe(false);
  fireEvent.change(screen.getByLabelText(/Texto auxiliar/), { target: { value: 'Entrada facilitada' } });
  expect(signal.aborted).toBe(true);
});

// O dado da peça mudou e o arquivo antigo ainda está na mão: entregá-lo é publicar o preço (ou o
// selo, ou a observação) anterior. Enquanto o arquivo novo não sai, a tela desenha na hora.
it('a arte preparada com o dado anterior nunca é entregue', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  // O lote seguinte fica preso antes de terminar o primeiro destino.
  estado.espera.ativa = true;
  fireEvent.change(screen.getByLabelText(/Texto auxiliar/), { target: { value: 'Entrada facilitada' } });
  fireEvent.click(screen.getByLabelText(/Confirmei/));
  fireEvent.click(botao(/Publicar no/));
  expect(entregas.chamadas).toEqual([]);
  estado.espera.ativa = false;
  for (const solta of estado.espera.fila.splice(0)) solta();
  await waitFor(() => expect(entregas.chamadas.length).toBe(1));
  expect(estado.desenhos.length).toBeGreaterThan(4);
});

it('trocar de destino não refaz os quatro arquivos', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao(ART_DESTINATIONS.tiktok.label));
  await new Promise((pronto) => setTimeout(pronto, 400));
  expect(estado.desenhos.length).toBe(4);
  expect(lotes.chamadas.length).toBe(1);
});

// ─── §7: o que não pode regredir ─────────────────────────────────────────────────────────────────

it('§7 confere a versão do anúncio antes de preparar a entrega', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  expect(conferencias.some((url) => url.includes('/api/admin/vehicles/v1/art-check?version=3'))).toBe(true);
});

it('§7 anúncio mudado: nada é desenhado e a tela diz o motivo', async () => {
  comFotoPronta();
  respostaDaConferencia = () => new Response(JSON.stringify({ error: 'O anúncio mudou. Recarregue a página.' }), { status: 409 });
  render(<ArtEditor {...props()} />);
  await waitFor(() => expect(screen.getByText('O anúncio mudou. Recarregue a página.')).toBeTruthy());
  expect(estado.desenhos).toEqual([]);
});

it('§7 revalida o anúncio com a tela aberta e descarta a arte vencida', async () => {
  vi.useFakeTimers();
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await vi.waitFor(() => expect(estado.desenhos.length).toBe(4));
  const antes = conferencias.length;
  respostaDaConferencia = () => new Response(JSON.stringify({ error: 'O anúncio mudou. Recarregue a página.' }), { status: 409 });
  await vi.advanceTimersByTimeAsync(120_000);
  expect(conferencias.length).toBeGreaterThan(antes);
  await vi.waitFor(() => expect(screen.getByText('O anúncio mudou. Recarregue a página.')).toBeTruthy());
  vi.useRealTimers();
});

it('§7 NotAllowedError tem frase própria', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {
    const erro = new Error('bloqueado'); erro.name = 'NotAllowedError'; throw erro;
  } });
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(screen.getByText(/bloqueou o envio/)).toBeTruthy());
});

it('§7 TypeError tem frase própria', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  Object.defineProperty(navigator, 'share', { configurable: true,
    value: async () => { throw new TypeError('sem suporte a arquivo'); } });
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(screen.getByText(/não aceita compartilhar a imagem/)).toBeTruthy());
});

it('§7 fechar a folha do sistema não é falha', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {
    const erro = new Error('cancelado'); erro.name = 'AbortError'; throw erro;
  } });
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(screen.getByText(/cancelado/i)).toBeTruthy());
  expect(screen.queryByText(/bloqueou o envio/)).toBeNull();
  expect(baixados).toEqual([]);
});

// `fallback: 'none'` é o que impede "Publicar" de baixar o arquivo em silêncio quando o menu
// nativo não abre: a pessoa toca em publicar, nada aparece, e o arquivo vai para Downloads sem
// ninguém dizer. O recuo para download é do botão Baixar, que é explícito.
it('§7 publicar não abre a janela de salvar sem avisar', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  Object.defineProperty(navigator, 'share', { configurable: true,
    value: async () => { throw new TypeError('sem suporte a arquivo'); } });
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(screen.getByText(/não aceita compartilhar a imagem/)).toBeTruthy());
  expect(baixados).toEqual([]);
  expect(entregas.chamadas[0].fallback).toBe('none');
});

it('§7 o texto auxiliar não confirmado barra a entrega', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.change(screen.getByLabelText(/Texto auxiliar/), { target: { value: 'Entrada facilitada' } });
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(screen.getByText(/confirme o texto auxiliar/i)).toBeTruthy());
  expect(entregas.chamadas).toEqual([]);
  expect(compartilhamentos).toEqual([]);
});

// Review Focus 5 do plano, nas três partes: a prévia aparece, nada é pré-renderizado e nenhum
// botão promete publicação.
it('§7 com exportProblem a prévia aparece, nada é pré-renderizado e nenhum botão promete publicação', async () => {
  comFotoPronta();
  const { container } = render(<ArtEditor {...props({ exportProblem: 'Publique o anúncio antes de baixar uma arte comercial.' })} />);
  expect(screen.getByText(/Publique o anúncio antes/)).toBeTruthy();
  expect(container.querySelector('[data-palco="previa"] [data-destino]')).not.toBeNull();
  expect(botao(/Publicar no/).disabled).toBe(true);
  expect(botao('Baixar').disabled).toBe(true);
  await new Promise((pronto) => setTimeout(pronto, 400));
  expect(estado.desenhos).toEqual([]);
  expect(lotes.chamadas).toEqual([]);
  expect(conferencias).toEqual([]);
});

// ─── Entrega num toque (§8.2 e a Global Constraint da área de transferência) ──────────────────────

it('o arquivo pronto é entregue no mesmo toque, sem nenhum await no caminho', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao(/Publicar no/));
  // Nada de `await` aqui: se houvesse um no caminho do toque até a entrega, a ativação do usuário
  // já estaria consumida e o menu nativo não abriria no WebKit.
  expect(entregas.chamadas.length).toBe(1);
  expect(entregas.chamadas[0].filename).toBe('liberato-honda-cg-160-titan-feed.jpg');
  await waitFor(() => expect(compartilhamentos.length).toBe(1));
  expect(compartilhamentos[0].files?.[0].name).toBe('liberato-honda-cg-160-titan-feed.jpg');
});

it('cada destino entrega o seu arquivo, com o sufixo do destino', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao(ART_DESTINATIONS.whatsapp.label));
  fireEvent.click(botao('Publicar no Status'));
  await waitFor(() => expect(compartilhamentos.length).toBe(1));
  expect(compartilhamentos[0].files?.[0].name).toBe('liberato-honda-cg-160-titan-status.jpg');
  // O arquivo entregue é o que foi desenhado para aquele destino, não o da prévia.
  expect(await compartilhamentos[0].files![0].text()).toBe('whatsapp');
});

it('a legenda e a cópia chegam ao deliverArt', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao(/Publicar no/));
  const entrega = entregas.chamadas[0];
  expect(typeof entrega.caption).toBe('string');
  expect(entrega.caption as string).toContain('Honda CG 160 Titan Start');
  expect(typeof entrega.copyText).toBe('function');
  await waitFor(() => expect(copiados.length).toBe(1));
  expect(copiados[0]).toBe(entrega.caption);
  expect(compartilhamentos[0].text).toBe(entrega.caption);
});

it('a cópia não é esperada: o compartilhamento acontece com a cópia pendurada', async () => {
  comFotoPronta();
  Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: () => new Promise<void>(() => {}) } });
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(compartilhamentos.length).toBe(1));
});

it('a legenda editada à mão é a que vai embora', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.change(screen.getByLabelText(/Legenda/), { target: { value: 'Texto que o vendedor escreveu' } });
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(copiados[0]).toBe('Texto que o vendedor escreveu'));
  expect(compartilhamentos[0].text).toBe('Texto que o vendedor escreveu');
});

it('a legenda é a do destino selecionado', () => {
  render(<ArtEditor {...props()} />);
  const legenda = () => (screen.getByLabelText(/Legenda/) as HTMLTextAreaElement).value;
  expect(legenda()).toContain('Anúncio: https://liberato.example/veiculos/honda-cg-160-titan');
  fireEvent.click(botao(ART_DESTINATIONS.whatsapp.label));
  expect(legenda()).not.toContain('Anúncio:');
  expect(legenda()).not.toContain('#');
  fireEvent.click(botao(ART_DESTINATIONS.tiktok.label));
  expect(legenda()).toContain('#MotosCE');
});

it('Baixar gera o arquivo, confere a versão e copia a legenda', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  const conferenciasAntes = conferencias.length;
  fireEvent.click(botao('Baixar'));
  await waitFor(() => expect(baixados).toEqual(['liberato-honda-cg-160-titan-feed.jpg']));
  expect(conferencias.length).toBeGreaterThan(conferenciasAntes);
  expect(copiados.length).toBe(1);
  expect(compartilhamentos).toEqual([]);
});

// §8.2: "se o toque chegar antes do arquivo daquele destino, ele é renderizado na hora; se a
// ativação do usuário se perder nesse caminho, a tela pede um segundo toque em vez de falhar em
// silêncio."
it('toque antes do arquivo pronto renderiza na hora e pede um segundo toque se a ativação se perdeu', async () => {
  estado.espera.ativa = true;
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await waitFor(() => expect(estado.desenhos.length).toBe(1));
  Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {
    const erro = new Error('ativação perdida'); erro.name = 'NotAllowedError'; throw erro;
  } });
  fireEvent.click(botao(ART_DESTINATIONS.tiktok.label));
  fireEvent.click(botao('Publicar no TikTok'));
  estado.espera.ativa = false;
  for (const solta of estado.espera.fila.splice(0)) solta();
  await waitFor(() => expect(screen.getByText(/Toque em Publicar no TikTok novamente/)).toBeTruthy());
  expect(estado.desenhos.some((d) => d.destino === 'tiktok')).toBe(true);
});

// A peça diz **marca e modelo**, e a versão não entra: `ArtContent.title` documenta isso em letra
// ("arte de rede se lê em meio segundo"), o §4.2 do spec desenha "Honda CG 160 Titan" e o §13
// registra que a arte escapa do dado sujo justamente por usar só marca + modelo. Medido: com a
// versão de uma picape de concessionária (99 caracteres) o título vai a 4 linhas, o bloco de texto
// sobe a 54,8% do teto de 55% e a foto visível cai de 39% para 31% da peça. O nome completo do
// anúncio continua viajando no mesmo toque — na legenda.
it('a arte diz marca e modelo; a versão fica na legenda e no cabeçalho', () => {
  const { container } = render(<ArtEditor {...props()} />);
  expect(container.querySelector('[data-palco="previa"] [data-titulo]')?.getAttribute('data-titulo'))
    .toBe('Honda CG 160 Titan');
  expect((screen.getByLabelText(/Legenda/) as HTMLTextAreaElement).value).toContain('Honda CG 160 Titan Start');
  expect(screen.getByText(/Honda CG 160 Titan Start · R\$ 18\.900,00/)).toBeTruthy();
});

it('a arte não fica com o maior corpo da peça vazio quando o cadastro não dá marca nem modelo', () => {
  const semNome = render(<ArtEditor {...props({ vehicle: { ...VEICULO, brand: null, model: null,
    title: 'Veículo sem título' } })} />);
  expect(semNome.container.querySelector('[data-palco="previa"] [data-titulo]')?.getAttribute('data-titulo'))
    .toBe('Veículo sem título');
  cleanup();
  // Marca e modelo em branco, mas a página compôs um nome pela versão: é esse nome que a arte usa,
  // não o texto de reserva.
  const pelaVersao = render(<ArtEditor {...props({ vehicle: { ...VEICULO, brand: null, model: null,
    title: 'Saveiro Robust' } })} />);
  expect(pelaVersao.container.querySelector('[data-palco="previa"] [data-titulo]')?.getAttribute('data-titulo'))
    .toBe('Saveiro Robust');
});

// §8.2: "Abrir a tela no último destino usado e tocar o botão primário é um toque." Começar o lote
// sempre pelo Feed deixaria o destino lembrado — o único que a pessoa vai tocar — como o último a
// ficar pronto, e o toque cairia no caminho de desenhar na hora, que pede um segundo toque.
it('o lote começa pelo destino lembrado, que é o que a pessoa vai tocar', async () => {
  window.localStorage.setItem('liberato:arte:destino', 'tiktok');
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  expect(estado.desenhos.map((d) => d.destino)).toEqual(['tiktok', 'feed', 'story', 'whatsapp']);
});

it('e o toque no destino lembrado entrega sem pedir segundo toque', async () => {
  window.localStorage.setItem('liberato:arte:destino', 'whatsapp');
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await waitFor(() => expect(estado.desenhos.length).toBeGreaterThanOrEqual(1));
  fireEvent.click(botao('Publicar no Status'));
  expect(entregas.chamadas.length).toBe(1);
  expect(entregas.chamadas[0].filename).toBe('liberato-honda-cg-160-titan-status.jpg');
});

// §3.3.13: "O resultado na tela diz que a legenda foi copiada: sobrescrever a área de transferência
// é efeito visível, não silencioso." Quem tinha outra coisa copiada precisa saber que perdeu.
it('a tela diz que a legenda foi copiada, no caminho de publicar', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  expect(screen.queryByText(/legenda foi copiada/i)).toBeNull();
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(screen.getByText(/legenda foi copiada/i)).toBeTruthy());
});

it('e também no caminho de Baixar, onde a cópia também acontece', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao('Baixar'));
  await waitFor(() => expect(screen.getByText(/legenda foi copiada/i)).toBeTruthy());
});

// A área de transferência só é anunciada quando o aparelho de fato aceitou o texto: um WebView que
// recusa a cópia não pode deixar a tela dizendo que a legenda está lá.
it('não anuncia cópia que o aparelho recusou', async () => {
  comFotoPronta();
  Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async () => { throw new Error('sem permissão'); } } });
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao(/Publicar no/));
  await waitFor(() => expect(compartilhamentos.length).toBe(1));
  expect(screen.queryByText(/legenda foi copiada/i)).toBeNull();
});

it('o botão manual de copiar a legenda confere o anúncio antes de copiar', async () => {
  render(<ArtEditor {...props()} />);
  fireEvent.click(botao('Copiar legenda'));
  await waitFor(() => expect(screen.getByText(/Legenda copiada/)).toBeTruthy());
  expect(conferencias.some((url) => url.includes('art-check?version=3'))).toBe(true);
  expect(copiados.length).toBe(1);
});

it('a tela sem foto carregada não promete arquivo nenhum', () => {
  estado.foto = { estado: 'error', erro: 'A foto não está disponível no armazenamento. Tente recarregar.' };
  render(<ArtEditor {...props()} />);
  expect(screen.getByText('A foto não está disponível no armazenamento. Tente recarregar.')).toBeTruthy();
  expect(botao('Baixar').disabled).toBe(true);
  expect(estado.desenhos).toEqual([]);
});

it('não desenha antes de a foto chegar ao palco oculto: a peça sairia sem o veículo', async () => {
  estado.fotoOculta = { estado: 'loading' };
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await waitFor(() => expect(lotes.chamadas.length).toBe(1));
  await new Promise((pronto) => setTimeout(pronto, 120));
  expect(estado.desenhos).toEqual([]);
  estado.fotoOculta = { estado: 'ready' };
  // A foto chega: o mesmo palco segue adiante e os quatro saem.
  fireEvent.click(screen.getByLabelText(/onde o aplicativo escreve/i));
  await loteCompleto();
  expect(estado.desenhos.map((d) => d.destino)).toEqual([...DESTINATION_ORDER]);
});

it('trocar o selo refaz os quatro arquivos', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  fireEvent.click(botao('Destaque da semana'));
  await waitFor(() => expect(lotes.chamadas.length).toBe(2));
  await waitFor(() => expect(estado.desenhos.length).toBe(8));
});

// `art-layout.ts` escreve a razão de `dropped` existir: "descartar a observação de uma peça é
// decisão visível: quem monta precisa poder saber que a linha que digitou não entrou, e a tela só
// pode dizer isso se o layout contar". O layout contava e a tela não dizia — então a pessoa
// digitava a frase, marcava "Confirmei que o texto auxiliar está correto" e publicava uma peça sem
// ela.
it('a tela avisa quando o texto auxiliar não cabe na peça', () => {
  estado.descartados = 'note';
  render(<ArtEditor {...props()} />);
  expect(screen.getByText(/texto auxiliar não cabe nesta peça/i)).toBeTruthy();
  expect(screen.queryByText(/ano, quilometragem e cor/i)).toBeNull();
});

it('e quando a linha de ano, quilometragem e cor também não cabe', () => {
  estado.descartados = 'note,meta';
  render(<ArtEditor {...props()} />);
  expect(screen.getByText(/texto auxiliar não cabe nesta peça/i)).toBeTruthy();
  expect(screen.getByText(/ano, quilometragem e cor/i)).toBeTruthy();
});

it('e não avisa nada no caso normal, que é o do estoque de hoje', () => {
  render(<ArtEditor {...props()} />);
  expect(screen.queryByText(/não cabe nesta peça/i)).toBeNull();
});

// A revisão final achou este mutante vivo: `items: { ...atual.items, [art.destination]: art }`, sem
// conferir a chave, deixa as peças de dois `artKey` diferentes convivendo no mapa sob a chave nova.
// Efeito: muda o preço, o lote novo entrega só o Feed, a pessoa toca em "Publicar no Stories" e
// recebe o arquivo com o **preço anterior** — o pior resultado que este produto pode dar. A guarda
// de leitura (`arts.key === artKey`) não pega isto, porque a chave do mapa já é a nova.
it('a peça de um destino não sobrevive à troca de dado só porque outro destino ficou pronto', async () => {
  comFotoPronta();
  render(<ArtEditor {...props()} />);
  await loteCompleto();
  expect(estado.desenhos.length).toBe(4);

  estado.espera.ativa = true;
  fireEvent.change(screen.getByLabelText(/Texto auxiliar/), { target: { value: 'Entrada facilitada' } });
  fireEvent.click(screen.getByLabelText(/Confirmei/));
  // O lote novo começa pelo destino na tela (Feed) e fica preso no `toBlob` dele.
  await waitFor(() => expect(estado.desenhos.length).toBe(5));
  // Só o Feed novo é liberado: os outros três do dado novo não existem ainda.
  estado.espera.fila.shift()!();
  await waitFor(() => expect(entregas.chamadas.length + estado.desenhos.length).toBeGreaterThan(5));

  fireEvent.click(botao(ART_DESTINATIONS.story.label));
  fireEvent.click(botao('Publicar no Stories'));
  // Nada é entregue de imediato: o arquivo do Stories com o dado novo ainda não existe, e o antigo
  // não serve. A tela desenha na hora.
  expect(entregas.chamadas).toEqual([]);
  const desenhosAntes = estado.desenhos.length;
  estado.espera.ativa = false;
  for (const solta of estado.espera.fila.splice(0)) solta();
  await waitFor(() => expect(entregas.chamadas.length).toBe(1));
  expect(estado.desenhos.length).toBeGreaterThan(desenhosAntes);
  expect(await (entregas.chamadas[0].blob as Blob).text()).toBe('story');
});
