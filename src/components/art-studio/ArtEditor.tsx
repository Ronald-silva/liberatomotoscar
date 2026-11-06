'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type Konva from 'konva';
import styles from '@/app/admin/admin.module.css';
import artStyles from './art-studio.module.css';
import type { BrandKit } from '@/data/brand';
import { buildMetaLine } from './art-layout';
import { renderDestinations, type RenderedArt } from './art-render';
import { composeVehicleTitle, FALLBACK_TITLE } from './art-title';
import { createCaption, type CaptionVehicle } from './caption';
import { ART_DESTINATIONS, DESTINATION_ORDER, type ArtDestination } from './destinations';
import { checkVersion, deliverArt, runArtDelivery } from './share-art';
import { badgesForStatus, type ArtBadge } from './templates';

/**
 * A tela do estúdio: abre pronta, e publicar é um toque.
 *
 * O fluxo antigo pedia seis interações — formato, foto, modelo, abrir a legenda, escolher a rede
 * outra vez, copiar, compartilhar — e tinha dois botões-âncora que existiam porque a tela não cabia
 * no celular. O eixo agora é um só: o **destino** (§8.3 do spec). Escolher "Stories" já escolhe
 * dimensão, área segura, fantasma, legenda, rótulo do botão e nome do arquivo.
 *
 * Três coisas governam o desenho deste arquivo:
 *
 * - **O arquivo é preparado antes do toque.** Safari e outros encerram a ativação do usuário se o
 *   `navigator.share` esperar por canvas ou rede (§7). Os quatro destinos são desenhados em segundo
 *   plano, em sequência, num **palco oculto** reaproveitado e separado da prévia — e do toque até
 *   `deliverArt` não há um único `await`.
 * - **Nada de arte vencida.** A versão do anúncio é conferida antes de desenhar e revalidada a cada
 *   120 s com a tela aberta; a troca de qualquer dado da peça aborta o lote em curso, porque uma
 *   peça desenhada com o preço anterior é anúncio vencido publicado.
 * - **A legenda vai junto.** `deliverArt` recebe a legenda do destino e a função de copiar, e a
 *   cópia não é esperada: é o `await` entre ela e o `share` que consome a ativação do usuário.
 */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ArtCanvas = dynamic(() => import('./ArtCanvas'), { ssr: false,
  loading: () => <p role="status">Preparando a prévia da arte…</p> });

type ArtVehicle = CaptionVehicle & { id: string; version: number; slug: string };

export type ShareSupport = 'checking' | 'available' | 'insecure' | 'unsupported';
const subscribeShareSupport = () => () => {};
function readShareSupport(): ShareSupport {
  if (!window.isSecureContext) return 'insecure';
  return typeof navigator.share === 'function' ? 'available' : 'unsupported';
}

/** O que o aparelho lembra entre sessões (§8.3). Leitura e escrita sempre protegidas. */
const LEMBRADO = { destino: 'liberato:arte:destino', selo: 'liberato:arte:selo' };
function lembrar(chave: string, valor: string) {
  // Navegação privada e armazenamento bloqueado **lançam** aqui, não devolvem nulo. A tela funciona
  // sem memória nenhuma; o que ela não pode é deixar de abrir por causa disso.
  try { window.localStorage.setItem(chave, valor); } catch { /* sem memória neste aparelho */ }
}
function lembrado(chave: string): string | null {
  try { return window.localStorage.getItem(chave); } catch { return null; }
}
/**
 * A memória é lida como **fonte externa**, não num efeito que chama `setState`.
 *
 * Ela precisa de dois valores diferentes: no servidor não existe `localStorage`, e usar o valor do
 * cliente já na primeira renderização faria a hidratação divergir — a tela voltaria a montar
 * inteira no navegador, com erro no console. `useSyncExternalStore` é exatamente o mecanismo que
 * resolve isso: a instantânea do servidor vale durante a hidratação e a do cliente passa a valer
 * depois dela, sem divergência. Ninguém mais muda o `localStorage` enquanto a tela está aberta, por
 * isso a assinatura não notifica nada.
 */
const semNotificacao = () => () => {};
const nadaLembrado = () => null;

export function ArtEditor({ vehicle, photos, phone, exportProblem, brand, shareSupport: shareSupportProp }: {
  vehicle: ArtVehicle; photos: { id: string; isCover: boolean; src: string }[]; phone: string;
  exportProblem: string | null; brand: BrandKit;
  /**
   * Injetada só em teste. Os três caminhos de indisponibilidade — sem HTTPS, sem `navigator.share`
   * e "ainda conferindo" — são impossíveis de alcançar com o cálculo interno, e são justamente os
   * que decidem se "Baixar" é a única saída no aparelho da loja.
   */
  shareSupport?: ShareSupport;
}) {
  const seloOferecido = badgesForStatus(vehicle.status);
  const destinoLembrado = useSyncExternalStore(semNotificacao, () => lembrado(LEMBRADO.destino), nadaLembrado);
  const seloLembrado = useSyncExternalStore(semNotificacao, () => lembrado(LEMBRADO.selo), nadaLembrado);
  const [destinoEscolhido, setDestinoEscolhido] = useState<ArtDestination | null>(null);
  const [seloEscolhido, setSeloEscolhido] = useState<ArtBadge | null>(null);
  const destination = destinoEscolhido
    ?? (DESTINATION_ORDER.find((alvo) => alvo === destinoLembrado) ?? DESTINATION_ORDER[0]);
  // Um selo lembrado que a situação de hoje não permite é dado vencido — o veículo foi vendido
  // depois da última visita. Honrá-lo anunciaria "Destaque da semana" num carro já vendido.
  const badge = seloEscolhido
    ?? (seloOferecido.find((item) => item.id === seloLembrado)?.id ?? seloOferecido[0].id);
  const detectado = useSyncExternalStore(subscribeShareSupport, readShareSupport, () => 'checking' as ShareSupport);
  const shareSupport = shareSupportProp ?? detectado;
  const [showChrome, setShowChrome] = useState(true);
  const [photoId, setPhotoId] = useState(photos.find((photo) => photo.isCover)?.id ?? photos[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [noteApproved, setNoteApproved] = useState(false);
  const [photoState, setPhotoState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoRetry, setPhotoRetry] = useState(0);
  const [captionEdits, setCaptionEdits] = useState<Partial<Record<ArtDestination, string>>>({});
  const [arts, setArts] = useState<{ key: string; items: Partial<Record<ArtDestination, RenderedArt>> }>({ key: '', items: {} });
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareRetry, setPrepareRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [captionMessage, setCaptionMessage] = useState<string | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  // Só vira verdade quando o aparelho **aceitou** o texto: um WebView que recusa a cópia não pode
  // deixar a tela dizendo que a legenda está na área de transferência.
  const [captionCopied, setCaptionCopied] = useState(false);
  // O pedido ao palco oculto: qual destino desenhar. O `id` muda a cada pedido para que pedir o
  // mesmo destino duas vezes ainda seja um pedido novo.
  const [pedido, setPedido] = useState<{ destination: ArtDestination; id: number } | null>(null);
  const [offstageReady, setOffstageReady] = useState(false);
  // O que o teto de altura deixou de fora da peça, para a tela poder dizer. '' é o caso normal.
  const [descartados, setDescartados] = useState('');
  const previewStage = useRef<Konva.Stage | null>(null);
  const offstageStage = useRef<Konva.Stage | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const pedidoAtual = useRef<ArtDestination | null>(null);
  const contador = useRef(0);
  const liberar = useRef<(() => void) | null>(null);
  const lote = useRef<AbortController | null>(null);
  // O destino do momento, para o lote começar por ele sem entrar nas dependências do efeito: nas
  // dependências, cada troca de ficha refaria os quatro arquivos.
  const destinoAtual = useRef<ArtDestination>(DESTINATION_ORDER[0]);

  const onPhotoLoad = useCallback((state: 'loading' | 'ready' | 'error', error?: string) => {
    setPhotoState(state);
    setPhotoError(error ?? null);
  }, []);
  const onOffstagePhotoLoad = useCallback((state: 'loading' | 'ready' | 'error') => {
    setOffstageReady(state === 'ready');
  }, []);

  const photoUrl = photos.find((photo) => photo.id === photoId)?.src ?? null;
  /**
   * O nome **na peça** é marca e modelo; a versão não entra.
   *
   * `ArtContent.title` documenta isso em letra ("arte de rede se lê em meio segundo"), o §4.2 do
   * spec desenha "Honda CG 160 Titan" e o §13 registra que a arte escapa do dado sujo do cadastro
   * justamente por usar só marca + modelo. A versão de uma picape de concessionária tem 99
   * caracteres: medida, ela põe o título em 4 linhas, leva o bloco de texto a 54,8% do teto de 55%
   * e derruba a foto visível de 39% para 31% da peça — a parede de texto que esta composição existe
   * para desfazer. O nome completo do anúncio não se perde: ele viaja na legenda, no mesmo toque, e
   * é o que o cabeçalho da tela mostra.
   *
   * A deduplicação é a mesma de `composeVehicleTitle` (um dono só), com `version: null`. Quando
   * marca e modelo não dão nome nenhum, vale o que a página compôs — e só depois o texto de reserva.
   */
  const nomeCurto = composeVehicleTitle({ brand: vehicle.brand, model: vehicle.model, version: null });
  const artTitle = nomeCurto !== FALLBACK_TITLE ? nomeCurto : (vehicle.title.trim() || FALLBACK_TITLE);
  const artMeta = buildMetaLine(vehicle.year, vehicle.mileageKm, vehicle.color);
  const defaultNote = vehicle.status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    vehicle.status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições';
  const spec = ART_DESTINATIONS[destination];
  // A legenda leva o nome **completo** do anúncio, com a versão: ela é o detalhe, a peça é o relance.
  const generatedCaption = createCaption(vehicle, destination, phone);
  const caption = captionEdits[destination] ?? generatedCaption;
  const verifyVehicle = useCallback(() => checkVersion(() => fetch(
    `/api/admin/vehicles/${vehicle.id}/art-check?version=${vehicle.version}`, { cache: 'no-store' })),
    [vehicle.id, vehicle.version]);
  const fileNameFor = useCallback((alvo: ArtDestination) =>
    `liberato-${vehicle.slug}-${ART_DESTINATIONS[alvo].fileSuffix}.jpg`, [vehicle.slug]);
  // Tudo que muda a peça. O destino **não** entra: os quatro saem do mesmo dado, e trocar de ficha
  // não pode refazer arquivo nenhum.
  const artKey = JSON.stringify([vehicle.version, artTitle, vehicle.year, vehicle.price, vehicle.status,
    phone, photoId, photoRetry, badge, artMeta, note]);

  useEffect(() => { destinoAtual.current = destination; }, [destination]);

  function escolherDestino(alvo: ArtDestination) {
    setDestinoEscolhido(alvo);
    setMessage(null);
    setCaptionCopied(false);
    setCaptionMessage(null);
    lembrar(LEMBRADO.destino, alvo);
  }
  function escolherSelo(alvo: ArtBadge) {
    setSeloEscolhido(alvo);
    lembrar(LEMBRADO.selo, alvo);
  }

  // O palco oculto comitou o destino pedido; falta a **pintura**. `fonts.ready` antes do quadro
  // porque o Konva quebra o texto uma vez e não refaz quando a fonte chega (§7).
  useEffect(() => {
    if (!pedido || !offstageReady) return;
    const solta = liberar.current;
    if (!solta) return;
    let vivo = true;
    void (async () => {
      await document.fonts.ready;
      await new Promise<void>((pronto) => requestAnimationFrame(() => pronto()));
      if (!vivo) return;
      liberar.current = null;
      solta();
    })();
    return () => { vivo = false; };
  }, [pedido, offstageReady]);

  const renderOne = useCallback(async (alvo: ArtDestination): Promise<Blob | null> => {
    await new Promise<void>((solta) => {
      liberar.current = solta;
      pedidoAtual.current = alvo;
      setPedido({ destination: alvo, id: ++contador.current });
    });
    // O palco é um só. Se outro pedido assumiu enquanto este esperava, o que está desenhado agora
    // não é este destino: devolver `null` é o que o laço da renderização trata pulando o destino,
    // em vez de entregar um arquivo com o conteúdo de outro.
    if (pedidoAtual.current !== alvo) return null;
    const blob = await offstageStage.current?.toBlob({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio: 1 });
    return blob instanceof Blob ? blob : null;
  }, []);

  // O lote: os quatro arquivos prontos antes do toque. Não começa com `exportProblem` — rascunho e
  // cadastro incompleto não geram peça comercial (§7), e desenhar quatro JPEGs que nenhum botão
  // pode entregar é gastar a bateria do aparelho da loja por nada.
  useEffect(() => {
    if (photoState !== 'ready' || exportProblem) return;
    const controller = new AbortController();
    lote.current = controller;
    const chave = artKey;
    let vivo = true;
    const timer = window.setTimeout(() => {
      setPreparing(true);
      setPrepareError(null);
      void (async () => {
        try {
          // A conferência de versão vem **antes** do desenho: se o anúncio mudou, não se desenha
          // nada. A revalidação de 120 s mantém a garantia com a tela aberta.
          const conferido = await verifyVehicle();
          if (controller.signal.aborted) return;
          if (!conferido.ok) throw new Error(conferido.error);
          // Começa pelo destino que está na tela: é o único que a pessoa pode tocar agora, e o
          // §8.2 promete que abrir no último destino usado e tocar é **um** toque. Começar sempre
          // pelo Feed deixaria o destino lembrado por último em três casos de quatro, e o toque
          // cairia no caminho de desenhar na hora, que pede um segundo toque.
          const alvo = destinoAtual.current;
          await renderDestinations({
            order: [alvo, ...DESTINATION_ORDER.filter((outro) => outro !== alvo)],
            renderOne,
            filename: fileNameFor,
            signal: controller.signal,
            onReady: (art) => {
              if (controller.signal.aborted) return;
              setArts((atual) => ({ key: chave,
                items: { ...(atual.key === chave ? atual.items : {}), [art.destination]: art } }));
            },
          });
        } catch (erro) {
          if (vivo) setPrepareError(erro instanceof Error ? erro.message : 'Não foi possível preparar os arquivos.');
        } finally {
          // Abortado: o palco oculto **não** é liberado aqui. Quem abortou foi um toque que está
          // usando o palco agora, ou a troca de dado que já disparou o lote seguinte.
          if (vivo && !controller.signal.aborted) { setPreparing(false); setPedido(null); }
        }
      })();
    }, 250);
    // A troca de qualquer dado da peça aborta o lote em curso. Sem isto, o destino abortado seria
    // entregue com o dado anterior — anúncio vencido publicado.
    return () => { vivo = false; controller.abort(); window.clearTimeout(timer); };
  }, [artKey, photoState, exportProblem, verifyVehicle, renderOne, fileNameFor, prepareRetry]);

  // O cadastro pode mudar com a tela aberta. A arte pronta é descartada sem refazer o JPEG.
  useEffect(() => {
    if (arts.key !== artKey || Object.keys(arts.items).length === 0) return;
    const timer = window.setInterval(() => {
      void verifyVehicle().then((conferido) => {
        if (conferido.ok) return;
        setArts({ key: '', items: {} });
        setPrepareError(conferido.error);
      });
    }, 120000);
    return () => window.clearInterval(timer);
  }, [arts, artKey, verifyVehicle]);

  const pronta = arts.key === artKey ? arts.items[destination] : undefined;
  // Quando a peça deixa de poder ser preparada — a foto caiu, ou o cadastro virou rascunho com a
  // tela aberta — o palco oculto sai da árvore e a tela para de dizer que prepara algo. É condição
  // de renderização, e não um efeito que chama `setState`: o lote abortado não volta para apagar o
  // que escreveu.
  const podePreparar = photoState === 'ready' && !exportProblem;

  function impedimento(mode: 'share' | 'download'): string | null {
    if (exportProblem) return exportProblem;
    if (mode === 'share' && shareSupport !== 'available') return shareSupport === 'insecure'
      ? 'O envio direto exige HTTPS. Abra o endereço publicado no Chrome do celular.'
      : 'Este navegador não oferece o menu de aplicativos. Abra esta página diretamente no Chrome.';
    if (note.trim() && !noteApproved) return 'Revise e confirme o texto auxiliar antes de enviar.';
    if (photoState !== 'ready') return photoError || 'A foto ainda não carregou. Aguarde ou escolha outra foto.';
    return null;
  }

  /**
   * A cópia que viaja com a entrega. **Não é esperada por ninguém** — quem a chama é o `deliverArt`,
   * com `void`, porque é o `await` entre ela e o `share` que consome a ativação do usuário. O
   * `then` daqui corre depois, só para a tela poder dizer que a área de transferência foi
   * sobrescrita (§3.3.13): efeito visível, não silencioso.
   */
  const copiarLegendaNaEntrega = useCallback((texto: string) =>
    navigator.clipboard.writeText(texto).then(() => setCaptionCopied(true)), []);

  // A entrega. Do toque até aqui não há `await` quando o arquivo já está pronto, e daqui até o
  // `navigator.share` quem garante o mesmo é o `deliverArt`.
  async function entregar(art: RenderedArt, naHora: boolean) {
    let falha: string | null = null;
    const resultado = await deliverArt({
      blob: art.blob, filename: art.filename, download: downloadBlob,
      // Sem recuo para download: tocar em publicar e ver o arquivo cair em Downloads sem aviso é a
      // pessoa achando que publicou. Quem quer o arquivo toca em Baixar, que é explícito.
      fallback: 'none',
      caption,
      copyText: copiarLegendaNaEntrega,
      share: typeof navigator.share === 'function' ? (data) => navigator.share(data) : undefined,
      canShare: (data) => typeof navigator.canShare === 'function' ? navigator.canShare(data) : true,
      onShareError: (error) => {
        const name = error instanceof Error ? error.name : '';
        falha = name === 'NotAllowedError'
          ? (naHora
            // A ativação do usuário se perdeu no caminho do desenho: o arquivo existe e o segundo
            // toque abre o menu. Pedir o segundo toque é o que o §8.2 manda fazer em vez de falhar
            // em silêncio.
            ? `A arte ficou pronta. Toque em ${spec.actionLabel} novamente para abrir os aplicativos.`
            : 'O navegador bloqueou o envio. Abra esta página diretamente no Chrome e tente novamente.')
          : name === 'TypeError'
            ? 'Este navegador não aceita compartilhar a imagem. Abra esta página diretamente no Chrome.'
            : 'Não foi possível abrir o menu de aplicativos. Tente novamente ou use Baixar.';
      },
    });
    setMessage(resultado === 'shared' ? 'Arte entregue ao menu do aparelho. Conclua a publicação no aplicativo.'
      : resultado === 'cancelled' ? 'Compartilhamento cancelado. Se nenhum aplicativo apareceu, abra esta página no Chrome.'
        : resultado === 'unavailable' ? falha || 'Este navegador não oferece o envio de imagens. Abra esta página no Chrome ou use Baixar.'
          : null);
  }

  async function publicar() {
    if (busy) return;
    setMessage(null);
    setCaptionCopied(false);
    const problema = impedimento('share');
    if (problema) { setMessage(problema); return; }
    if (pronta) {
      setBusy(true);
      try { await entregar(pronta, false); } finally { setBusy(false); }
      return;
    }
    // O toque chegou antes do arquivo deste destino. O lote em curso é abortado — o palco é um só e
    // quem está esperando é a pessoa — e o destino pedido é desenhado na hora. Sem o aborto, o lote
    // assumiria o palco no meio deste desenho e o arquivo entregue seria de outro destino.
    lote.current?.abort();
    setBusy(true);
    try {
      const blob = await renderOne(destination);
      if (!blob) { setMessage('Não foi possível gerar a arte neste aparelho. Tente outra foto.'); return; }
      await entregar({ destination, blob, filename: fileNameFor(destination) }, true);
    } catch {
      setMessage('Não foi possível gerar a arte. Tente de novo.');
    } finally {
      setBusy(false);
      // Os outros três seguem valendo a pena: o lote é refeito depois da entrega.
      setPrepareRetry((valor) => valor + 1);
    }
  }

  async function baixar() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setCaptionCopied(false);
    try {
      const problema = impedimento('download');
      if (problema) throw new Error(problema);
      const resultado = await runArtDelivery({
        mode: 'download',
        render: async () => pronta?.blob ?? await renderOne(destination),
        check: verifyVehicle,
        deliver: (blob) => deliverArt({ blob, filename: fileNameFor(destination), download: downloadBlob,
          caption, copyText: copiarLegendaNaEntrega }),
      });
      setMessage(resultado);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a arte. Tente de novo.');
    } finally { setBusy(false); }
  }

  // A rede de segurança da legenda: botão explícito, e este **pode** esperar a conferência do
  // anúncio, porque não é seguido de `share` e não gasta ativação de usuário nenhuma.
  async function copiarLegenda() {
    if (copyBusy) return;
    setCopyBusy(true);
    setCaptionMessage('Conferindo o anúncio…');
    try {
      const conferido = await verifyVehicle();
      if (!conferido.ok) { setCaptionMessage(conferido.error); return; }
      await navigator.clipboard.writeText(caption);
      setCaptionMessage('Legenda copiada. Cole no aplicativo ao publicar.');
    } catch {
      captionRef.current?.focus();
      captionRef.current?.select();
      setCaptionMessage('Selecione e copie a legenda acima.');
    } finally {
      setCopyBusy(false);
    }
  }

  const bloqueado = busy || Boolean(exportProblem) || photoState !== 'ready';

  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <div className={artStyles.editor}>
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact} ${artStyles.backLink}`} href={`/admin/veiculos/${vehicle.id}`}>Voltar ao veículo</Link>
      <h1 className={styles.heading}>Criar arte</h1>
      <p className={styles.description}>{vehicle.title} · {vehicle.price}</p>
      {exportProblem ? <p className={artStyles.warning} role="status">Prévia disponível. Para publicar ou baixar: {exportProblem}</p> : null}

      <div className={artStyles.stack}>
        <section className={artStyles.preview} aria-labelledby="art-preview-title">
          <h2 id="art-preview-title">Prévia da arte</h2>
          <div data-palco="previa">
            <ArtCanvas destination={destination} badge={badge} brand={brand} showChrome={showChrome}
              photoUrl={photoUrl} photoRetry={photoRetry} title={artTitle} meta={artMeta}
              price={vehicle.price} phone={phone} status={vehicle.status} note={note}
              stageRef={previewStage} onPhotoLoad={onPhotoLoad} onDropped={setDescartados} />
          </div>
          <label className={artStyles.chromeToggle}>
            <input type="checkbox" checked={showChrome} onChange={(event) => setShowChrome(event.target.checked)} />
            Mostrar onde o aplicativo escreve por cima
          </label>
          {photoState === 'error' ? <div className={artStyles.warning} role="alert">
            <p>{photoError}</p>
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => { setPhotoState('loading'); setPhotoRetry((valor) => valor + 1); }}>Tentar carregar foto novamente</button>
          </div> : null}
          {photoState === 'loading' ? <p className={artStyles.hint} role="status">Carregando foto da arte…</p> : null}
          {/* O teto de altura do bloco de texto (§4.3) descarta a observação antes da linha de
              dados, e nunca uma palavra do título. Quando descarta, a tela diz: a pessoa confirmou
              um texto e precisa saber que ele não entrou na peça. */}
          {descartados.includes('note') ? <p className={artStyles.warning} role="status">O texto auxiliar não cabe nesta peça e não entrou na arte. A prévia mostra o que vai sair.</p> : null}
          {descartados.includes('meta') ? <p className={artStyles.warning} role="status">A linha de ano, quilometragem e cor não cabe nesta peça e não entrou na arte.</p> : null}
          {podePreparar && preparing ? <p className={artStyles.hint} role="status">Preparando os arquivos dos quatro destinos…</p> : null}
          {prepareError ? <div className={artStyles.warning} role="alert">
            <p>{prepareError}</p>
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => { setArts({ key: '', items: {} }); setPrepareRetry((valor) => valor + 1); }}>Tentar preparar novamente</button>
          </div> : null}
        </section>

        <div className={artStyles.destinations} role="group" aria-label="Destino da arte">
          {DESTINATION_ORDER.map((alvo) => <button key={alvo} type="button" className={artStyles.destinationChip}
            aria-pressed={destination === alvo} onClick={() => escolherDestino(alvo)}>{ART_DESTINATIONS[alvo].label}</button>)}
        </div>
        {/* A dimensão fica fora da ficha de propósito: dentro do botão ela entraria no nome
            acessível e quem usa leitor de tela ouviria o número antes de saber qual é a rede. */}
        <p className={artStyles.hint}>Arquivo de {spec.width} × {spec.height}, com a área segura do {spec.label}. O fantasma mostra onde o aplicativo escreve por cima.</p>

        <div className={artStyles.actions}>
          <button className={styles.button} type="button" disabled={bloqueado} onClick={() => void publicar()}>
            {busy ? 'Abrindo aplicativos…' : spec.actionLabel}</button>
          <button className={`${styles.button} ${styles.buttonSecondary}`} type="button"
            disabled={bloqueado} onClick={() => void baixar()}>Baixar</button>
        </div>
        <p className={artStyles.hint} role="status" aria-live="polite">{message}</p>
        {captionCopied ? <p className={artStyles.hint} role="status" aria-live="polite">A legenda foi copiada. Cole no aplicativo ao publicar.</p> : null}
        <p className={artStyles.hint}>{shareSupport === 'insecure'
          ? 'O compartilhamento direto exige HTTPS no celular. Este endereço da rede local permite somente Baixar.'
          : shareSupport === 'unsupported'
            ? 'Este navegador não abre aplicativos instalados. Use o painel no celular com HTTPS ou toque em Baixar.'
            : 'Um toque entrega o arquivo deste destino ao aparelho e põe a legenda na área de transferência.'}</p>

        <details className={artStyles.captionDetails}>
          <summary>Legenda do {spec.label}</summary>
          <div className={artStyles.captionDetailsBody}>
            <label className={`${styles.field} ${artStyles.captionField}`}>Legenda para o {spec.label}
              <textarea ref={captionRef} className={styles.input} value={caption} maxLength={1800} rows={11}
                onChange={(event) => { setCaptionEdits((atual) => ({ ...atual, [destination]: event.target.value }));
                  setCaptionMessage(null); }} />
            </label>
            <div className={artStyles.captionActions}>
              <button className={`${styles.button} ${styles.buttonSecondary}`} type="button"
                disabled={copyBusy || Boolean(exportProblem)} onClick={() => void copiarLegenda()}>
                {copyBusy ? 'Conferindo anúncio…' : 'Copiar legenda'}</button>
              {captionEdits[destination] !== undefined ? <button className={`${styles.button} ${styles.buttonSecondary}`}
                type="button" onClick={() => setCaptionEdits((atual) => {
                  const proximo = { ...atual }; delete proximo[destination]; return proximo;
                })}>Restaurar sugestão</button> : null}
            </div>
            <p className={artStyles.hint} role="status" aria-live="polite">{captionMessage}</p>
          </div>
        </details>

        <details className={artStyles.captionDetails}>
          <summary>Foto, selo e texto auxiliar</summary>
          <div className={artStyles.captionDetailsBody}>
            {photos.length === 0 ? <p>Adicione uma foto no cadastro para montar a peça.</p> :
              <div className={artStyles.photos}>{photos.map((photo, index) =>
                <button key={photo.id} type="button" className={artStyles.photoOption} aria-pressed={photoId === photo.id}
                  onClick={() => { if (photoId === photo.id) return; setPhotoState('loading'); setPhotoId(photo.id); }}>
                  {/* Fotos antigas usam /images; fotos R2 passam pela rota autenticada. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.src} alt="" loading="lazy" />
                  <span>Foto {index + 1}{photo.isCover ? ' · capa' : ''}</span>
                </button>)}</div>}
            <div className={`${artStyles.options} ${artStyles.badges}`}>{seloOferecido.map((item) =>
              <button key={item.id} type="button" className={artStyles.option} aria-pressed={badge === item.id}
                onClick={() => escolherSelo(item.id)}>{item.label}</button>)}</div>
            {badge === 'offer' ? <p className={artStyles.hint}>Este selo mostra apenas o preço do cadastro. Desconto e validade não são anunciados sem aprovação.</p> : null}
            <label className={`${styles.field} ${artStyles.noteField}`}>Texto auxiliar opcional
              <input className={styles.input} type="text" maxLength={50} value={note}
                onChange={(event) => { setNote(event.target.value); setNoteApproved(false); }} placeholder={defaultNote} /></label>
            {note.trim() ? <label className={artStyles.confirmNote}>
              <input type="checkbox" checked={noteApproved} onChange={(event) => setNoteApproved(event.target.checked)} />
              Confirmei que o texto auxiliar está correto e autorizado.
            </label> : null}
            <p className={artStyles.hint}>Marca, modelo, ano e preço vêm do cadastro. Revise o texto auxiliar antes de publicar.</p>
          </div>
        </details>
      </div>

      {/* O palco oculto: um só, reaproveitado entre os destinos e liberado quando o lote termina.
          Fica fora da prévia porque a prévia é 1080 px escalada por CSS e trocar o destino dela a
          cada arquivo faria a tela piscar os quatro formatos na cara de quem está publicando. */}
      {pedido && podePreparar ? <div data-palco="oculto" aria-hidden="true" className={artStyles.offstage}>
        <ArtCanvas destination={pedido.destination} badge={badge} brand={brand} showChrome={false}
          photoUrl={photoUrl} photoRetry={photoRetry} title={artTitle} meta={artMeta}
          price={vehicle.price} phone={phone} status={vehicle.status} note={note}
          stageRef={offstageStage} onPhotoLoad={onOffstagePhotoLoad} />
      </div> : null}
    </div>
  </main>;
}
