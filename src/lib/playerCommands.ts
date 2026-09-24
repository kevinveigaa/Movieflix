/**
 * Comandos enviados ao player embutido do MovieFlix TV.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CAUSA RAIZ DO BUG "no player não dá para avançar/retroceder pelo controle":
 *
 * O código enviava `func: 'seekFwd'` / `func: 'seekBack'` — nomes NOSSOS, que
 * NENHUM player reconhece. O canal `postMessage` espera os nomes do protocolo
 * padrão de embeds (JW Player / Video.js / Plyr / players HTML5 em geral):
 *   · `seekForward` / `seekBackward` para avançar e retroceder;
 *   · `play` / `pause` / `toggle` para a reprodução.
 * Como o nome chegava inválido, o embed ignorava o comando silenciosamente e o
 * usuário tinha a impressão de que "o controle não mexe no player".
 *
 * A correção envia, para cada ação, TODOS os formatos de nome conhecidos (o
 * provedor usa o que reconhecer e ignora o resto) e, quando o player é nativo
 * (`<video data-mf-player>` ou iframe da mesma origem), aplica a ação DIRETO no
 * elemento — o que garante play/pause e o avanço/retrocesso de verdade.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * HONESTIDADE: um embed de OUTRA ORIGEM pode recusar comandos externos por
 * segurança. Nesse caso o embed mantém os próprios controles e o volume segue
 * resolvido pelo áudio do APARELHO (que funciona em qualquer provedor).
 */

export type AcaoPlayer = 'play' | 'pause' | 'toggle' | 'seekFwd' | 'seekBack';

/** Nomes aceitos pelo protocolo de embeds, por ação (o player usa o que conhece). */
const NOMES_POR_ACAO: Record<AcaoPlayer, string[]> = {
  play: ['play', 'playVideo'],
  pause: ['pause', 'pauseVideo'],
  toggle: ['toggle', 'play', 'pause'],
  seekFwd: ['seekForward', 'seekforward', 'forward'],
  seekBack: ['seekBackward', 'seekbackward', 'rewind'],
};

/**
 * Envia a ação ao player. Devolve `true` quando algum caminho conseguiu agir
 * (comando postado ou vídeo nativo manipulado), `false` quando não havia alvo.
 */
export function enviarComandoPlayer(
  iframe: HTMLIFrameElement | null | undefined,
  acao: AcaoPlayer,
  passoSeek: number,
): boolean {
  let agiu = false;

  for (const func of NOMES_POR_ACAO[acao]) {
    try {
      iframe?.contentWindow?.postMessage({ event: 'command', func, args: [] }, '*');
      agiu = true;
    } catch {
      /* provedor não aceita comandos externos */
    }
    try {
      // Formato alternativo usado por JW Player / Video.js.
      iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    } catch {
      /* ignora */
    }
    try {
      // Mensagem no formato próprio do MovieFlix (compatibilidade).
      iframe?.contentWindow?.postMessage({ type: 'mf-player-command', command: func }, '*');
    } catch {
      /* ignora */
    }
  }

  // Reforço no player NATIVO (mesma origem / <video data-mf-player>).
  try {
    const video =
      iframe?.contentDocument?.querySelector<HTMLVideoElement>('video') ??
      document.querySelector<HTMLVideoElement>('video[data-mf-player]');

    if (video) {
      if (acao === 'play') {
        void video.play().catch(() => undefined);
        agiu = true;
      } else if (acao === 'pause') {
        video.pause();
        agiu = true;
      } else if (acao === 'toggle') {
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
        agiu = true;
      } else {
        const duracao = Number.isFinite(video.duration) ? video.duration : 0;
        const limite = duracao > 0 ? Math.max(0, duracao - 0.5) : Number.MAX_SAFE_INTEGER;
        const delta = acao === 'seekFwd' ? passoSeek : -passoSeek;
        video.currentTime = Math.max(0, Math.min(limite, (video.currentTime || 0) + delta));
        agiu = true;
      }
    }
  } catch {
    /* cross-origin: inalcançável — o postMessage acima é a única via */
  }

  return agiu;
}
