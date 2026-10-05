/**
 * MovieFlix TV — PROGRESSO E SEEK REAIS DO PLAYER DO PROVEDOR (postMessage).
 * ══════════════════════════════════════════════════════════════════════════════
 * CAUSA RAIZ do "0:00 / 0:00" e do "seek não funciona de verdade":
 *
 * O player do MovieFlix vive no EMBED OFICIAL do StreamBetter, dentro de um
 * IFRAME DE OUTRA ORIGEM. A política de mesma origem impede o site de ler
 * `video.currentTime` / `video.duration` ali dentro — por isso a versão anterior
 * só conseguia mostrar a duração do CATÁLOGO e uma posição "contada pelos
 * comandos", e o seek ±10s era enviado com nomes de comando que o provedor NÃO
 * reconhece (o embed ignorava em silêncio).
 *
 * O provedor PUBLICA o estado real por `postMessage` (documentado em
 * https://streambetter.shop/docs):
 *   • SAÍDA  — `streambetter:progress` a cada ~15s e em play/pause/seeked/ended,
 *              com `{ currentTime, duration, state, tmdbId, season, episode }`;
 *   • ENTRADA — `streambetter:seek` com `{ type:'streambetter:seek', seconds }`
 *              muda a posição REAL sem recarregar o iframe.
 *
 * Este módulo é a ÚNICA ponte com esse protocolo. Ele NÃO inventa tempo: quando
 * o provedor não publica (ex.: ainda carregando), quem chama mantém o fallback
 * honesto (duração do catálogo) — nunca um número falso apresentado como real.
 */

/** Origem oficial do embed do provedor (obrigatória na checagem de segurança). */
export const ORIGEM_PROVEDOR = 'https://streambetter.shop';

/** Estado de reprodução publicado pelo provedor. */
export type EstadoProvedor = 'playing' | 'paused' | 'ended';

/** Progresso REAL publicado pelo player do provedor. */
export interface ProgressoProvedor {
  /** Posição atual, em segundos (real, lida do `<video>` do provedor). */
  posicao: number;
  /** Duração total, em segundos (real). 0 quando ainda desconhecida. */
  duracao: number;
  /** Estado de reprodução real. */
  estado: EstadoProvedor | null;
  /** Identificação do conteúdo (o player troca de fonte sozinho no autoplay). */
  tmdbId: number | null;
  season: number | null;
  episode: number | null;
}

/** Forma mínima da mensagem recebida (validada antes de qualquer uso). */
interface MensagemProvedor {
  type?: string;
  currentTime?: number;
  duration?: number;
  state?: string;
  tmdbId?: number;
  season?: number;
  episode?: number;
}

/**
 * Assina o progresso REAL do player do provedor.
 *
 * SEGURANÇA (obrigatória, não opcional): confere `event.origin` ANTES de ler o
 * conteúdo. Sem isso, qualquer outro iframe da página (um anúncio) poderia
 * forjar `streambetter:progress` e envenenar o tempo mostrado.
 *
 * @returns função de limpeza (remove o listener).
 */
export function assinarProgressoProvedor(
  aoReceber: (p: ProgressoProvedor) => void,
): () => void {
  function onMessage(event: MessageEvent) {
    // 1) Origem: só o provedor oficial. Nunca `'*'`.
    if (event.origin !== ORIGEM_PROVEDOR) return;
    const dados = event.data as MensagemProvedor | null;
    if (!dados || typeof dados !== 'object') return;
    // 2) Tipo: só o progresso do provedor.
    if (dados.type !== 'streambetter:progress') return;

    const posicao = Number(dados.currentTime);
    const duracao = Number(dados.duration);
    if (!Number.isFinite(posicao)) return;

    const estado =
      dados.state === 'playing' || dados.state === 'paused' || dados.state === 'ended'
        ? dados.state
        : null;

    aoReceber({
      posicao: Math.max(0, posicao),
      duracao: Number.isFinite(duracao) && duracao > 0 ? duracao : 0,
      estado,
      tmdbId: Number.isFinite(Number(dados.tmdbId)) ? Number(dados.tmdbId) : null,
      season: Number.isFinite(Number(dados.season)) ? Number(dados.season) : null,
      episode: Number.isFinite(Number(dados.episode)) ? Number(dados.episode) : null,
    });
  }

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/**
 * Pede ao player do provedor para mudar a posição REAL (seek), sem recarregar.
 *
 * Usa o domínio REAL do embed como `targetOrigin` (nunca `'*'`): aqui é o site
 * que sabe para onde está mandando.
 *
 * @returns `true` quando a mensagem foi postada (o provedor decide se aplica).
 */
export function pedirSeekProvedor(
  iframe: HTMLIFrameElement | null | undefined,
  segundos: number,
): boolean {
  if (!iframe || !Number.isFinite(segundos)) return false;
  try {
    iframe.contentWindow?.postMessage(
      { type: 'streambetter:seek', seconds: Math.max(0, segundos) },
      ORIGEM_PROVEDOR,
    );
    return true;
  } catch {
    return false;
  }
}
