/**
 * O destino é a unidade do estúdio.
 *
 * Antes, o formato do arquivo e a plataforma eram escolhidos em dois lugares diferentes da tela e
 * se sobrescreviam: um 9:16 mandado ao Feed saía recortado ao centro, sem logo e sem rodapé. Aqui
 * as duas coisas são a mesma: escolher "Stories" já define dimensão, área segura, fantasma da
 * interface, variante da legenda, rótulo do botão e sufixo do arquivo.
 *
 * **A área segura e o fantasma saem deste mesmo dado.** Se fossem duas fontes, divergiriam na
 * primeira correção — e a prévia passaria a mentir justamente sobre o que ela existe para provar.
 *
 * Os números da área segura são **ponto de partida declarado, não verdade**: nenhuma plataforma
 * publica mapa oficial em pixels, e os guias de terceiros divergem entre si. Ficam na faixa em que
 * as fontes concordam, com folga. A conferência definitiva é visual, no aparelho da loja, com o
 * fantasma ligado. Corrigir depois é trocar número aqui, num lugar só.
 */

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export type ArtDestination = 'feed' | 'story' | 'whatsapp' | 'tiktok';

/**
 * Uma forma do fantasma da interface da rede.
 *
 * São formas neutras de propósito: retângulos e um círculo, nunca o logo, a marca ou o ícone de
 * nenhuma plataforma — desenhar a marca alheia dentro do produto é risco de marca registrada sem
 * ganho nenhum, porque o que precisa ser visto é *onde* a rede escreve por cima, não *o quê*.
 */
export type ChromeShape = {
  kind: 'avatar' | 'bar' | 'rail' | 'actions';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DestinationSpec = {
  id: ArtDestination;
  /** O texto da ficha na fileira de destinos. */
  label: string;
  /** O texto do botão primário. */
  actionLabel: string;
  width: number;
  height: number;
  safe: SafeArea;
  chrome: readonly ChromeShape[];
  /**
   * O que entra em `liberato-<slug>-<sufixo>.jpg`. Três dos quatro repetem os sufixos que já
   * saem hoje, para não trocar o nome de arquivo que a loja já reconhece; só o Status é novo,
   * porque até aqui ele saía como `story`.
   */
  fileSuffix: string;
};

/** A ordem da fileira de fichas, e a ordem em que os quatro arquivos são pré-renderizados. */
export const DESTINATION_ORDER: readonly ArtDestination[] = ['feed', 'story', 'whatsapp', 'tiktok'];

export const ART_DESTINATIONS: Record<ArtDestination, DestinationSpec> = {
  /**
   * Feed do Instagram e do Facebook, 4:5 — o retrato mais alto que as duas aceitam.
   *
   * Não há interface sobreposta aqui; o que governa a margem é o **recorte 1:1 da grade do
   * perfil**, que mostra só a faixa y 135–1215. Por isso t/b de 150: todo o conteúdo aparece
   * também na miniatura da grade, não só no post aberto.
   */
  feed: {
    id: 'feed',
    label: 'Feed',
    actionLabel: 'Publicar no Feed',
    width: 1080,
    height: 1350,
    safe: { top: 150, right: 72, bottom: 150, left: 72 },
    fileSuffix: 'feed',
    chrome: [
      // Cabeçalho do post: avatar e nome da conta.
      { kind: 'avatar', x: 72, y: 36, width: 84, height: 84 },
      { kind: 'bar', x: 180, y: 60, width: 360, height: 36 },
      // Linha de curtir, comentar e compartilhar, abaixo da imagem.
      { kind: 'actions', x: 72, y: 1218, width: 420, height: 60 },
    ],
  },

  /**
   * Stories do Instagram e do Facebook. Avatar e nome no topo, caixa de resposta e "enviar
   * mensagem" na base. A base em 340 vem de onde as fontes mais convergem (336–340), contra os
   * 300 que estavam em produção.
   */
  story: {
    id: 'story',
    label: 'Stories',
    actionLabel: 'Publicar no Stories',
    width: 1080,
    height: 1920,
    safe: { top: 250, right: 72, bottom: 340, left: 72 },
    fileSuffix: 'story',
    chrome: [
      { kind: 'bar', x: 72, y: 48, width: 936, height: 8 },
      { kind: 'avatar', x: 72, y: 96, width: 104, height: 104 },
      { kind: 'bar', x: 200, y: 128, width: 300, height: 40 },
      // Caixa de resposta e os dois ícones ao lado dela.
      { kind: 'bar', x: 72, y: 1660, width: 700, height: 108 },
      { kind: 'actions', x: 812, y: 1660, width: 196, height: 108 },
    ],
  },

  /**
   * Status do WhatsApp. Avatar, nome e hora no topo; legenda e seta de resposta na base.
   *
   * Até aqui o estúdio reusava a área do Stories sem distinção, e as duas interfaces não são
   * iguais — a do WhatsApp é mais enxuta nas duas pontas. **Destes quatro, é o único cujos números
   * não têm nem guia de terceiro atrás**: é estimativa declarada, e o fantasma é o instrumento
   * para corrigi-la no aparelho.
   */
  whatsapp: {
    id: 'whatsapp',
    label: 'Status',
    actionLabel: 'Publicar no Status',
    width: 1080,
    height: 1920,
    safe: { top: 220, right: 72, bottom: 260, left: 72 },
    fileSuffix: 'status',
    chrome: [
      { kind: 'bar', x: 72, y: 40, width: 936, height: 6 },
      { kind: 'avatar', x: 72, y: 80, width: 92, height: 92 },
      { kind: 'bar', x: 188, y: 104, width: 280, height: 36 },
      // Campo de resposta e a seta de enviar.
      { kind: 'bar', x: 72, y: 1700, width: 760, height: 96 },
      { kind: 'actions', x: 872, y: 1700, width: 136, height: 96 },
    ],
  },

  /**
   * TikTok, foto vertical. A trilha de curtir/comentar/compartilhar fica à direita, e a base cresce
   * com legenda, música e navegação — por isso é a mais generosa das quatro embaixo, e a única com
   * coluna reservada de lado. As laterais convergem em ~120 px; a trilha é estimada entre 100 e
   * 164, e os 180 seguem confortáveis.
   */
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    actionLabel: 'Publicar no TikTok',
    width: 1080,
    height: 1920,
    safe: { top: 150, right: 180, bottom: 500, left: 120 },
    fileSuffix: 'tiktok',
    chrome: [
      // Abas "Seguindo / Para você" no topo.
      { kind: 'bar', x: 340, y: 56, width: 400, height: 48 },
      // A trilha de ícones da direita.
      { kind: 'rail', x: 912, y: 760, width: 96, height: 620 },
      // Legenda, nome do autor e faixa da música.
      { kind: 'bar', x: 120, y: 1440, width: 700, height: 240 },
      // Barra de navegação do aplicativo.
      { kind: 'actions', x: 120, y: 1760, width: 840, height: 96 },
    ],
  },
};

export function destinationSpec(id: ArtDestination): DestinationSpec {
  return ART_DESTINATIONS[id];
}
