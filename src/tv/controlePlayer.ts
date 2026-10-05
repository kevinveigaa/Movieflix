/**
 * MovieFlix TV — PONTE DE CONTROLE DO PLAYER (controle remoto → player do provedor)
 * ══════════════════════════════════════════════════════════════════════════════
 * PROBLEMA RELATADO: no player, o MovieFlix TV mostra o indicador na tela, mas o
 * player do provedor (embed em iframe) NÃO executa a ação — não pausa, não
 * avança e não retrocede pelo controle remoto.
 *
 * ── CAUSA RAIZ (medida, não suposta) ─────────────────────────────────────────
 * O player vive num IFRAME DE OUTRA ORIGEM. Existem dois fatos verificados:
 *
 *  1. Uma tecla CHEGA ao documento do iframe quando — e SOMENTE quando — o
 *     próprio elemento `<iframe>` é o `document.activeElement`. Nesse estado o
 *     navegador roteia a tecla para o documento do player (mesmo cross-origin) e
 *     o controle dele reage de verdade.
 *  2. Nesse mesmo estado o documento PAI não recebe mais a tecla (a entrega é
 *     exclusiva). E eventos sintéticos (`dispatchEvent`) NUNCA atravessam a
 *     fronteira de origem — por isso "mandar a tecla pelo JavaScript" não
 *     funcionava e o usuário só via o aviso na tela.
 *
 * Consequência: para o controle do provedor reagir é preciso uma TECLA REAL
 * entregue enquanto o iframe está focado. Só a camada nativa Android pode fazer
 * isso (um evento de tecla de verdade). Daí a ponte:
 *
 *   CONTROLE REMOTO → EVENTO DO CONTROLE → INTEGRAÇÃO DO MOVIEFLIX TV (aqui)
 *     → PONTE NATIVA (`MovieFlixApp.enviarTeclaPlayer`) → TECLA REAL NO IFRAME
 *     → PLAYER DO PROVEDOR EXECUTA A AÇÃO
 *
 * A ponte nativa (`MainActivity.PonteNativa.enviarTeclaPlayer`) injeta a tecla
 * no WebView, devolve o foco ao site depois e não intercepta nada por conta
 * própria. O player do provedor continua sendo o ÚNICO player — nada é
 * substituído, removido ou trocado; a fonte dos vídeos é a mesma.
 *
 * ── CAMINHOS POR AMBIENTE ────────────────────────────────────────────────────
 *  • Android TV / TV Box (APK): ponte nativa — o único caminho que faz o player
 *    reagir de verdade. É o caminho que o MovieFlix TV usa.
 *  • Navegador / WebView sem ponte: protocolo `postMessage` do embed e o vídeo
 *    nativo (`[data-mf-player]`), como antes (ver `@/lib/playerCommands`).
 * Ambos são tentados sempre: o provedor usa o que reconhecer e ignora o resto.
 */

import { enviarComandoPlayer, type AcaoPlayer } from '@/lib/playerCommands';

/** Ações de reprodução que o controle remoto dispara. */
export type AcaoPlayerBase = AcaoPlayer; // 'play' | 'pause' | 'toggle' | 'seekFwd' | 'seekBack'

/**
 * Ações que o controle remoto dispara no player.
 *
 * `ok` é o comando PLAY/PAUSE DO BOTÃO OK/ENTER do controle — separado de
 * `toggle` porque o protocolo de `postMessage` do embed reconhece `toggle`
 * (usado pelos botões da barra em navegador), enquanto o OK da TV precisa
 * virar uma TECLA REAL (KEYCODE_MEDIA_PLAY_PAUSE) entregue pela ponte nativa.
 */
export type AcaoControle = AcaoPlayerBase | 'ok';

/**
 * keyCode Android (KeyEvent) de cada ação — o MESMO valor que o controle remoto
 * envia ao Android. É o que a ponte nativa injeta para o player reagir.
 */
export const KEYCODE_ANDROID: Record<AcaoControle, number> = {
  play: 126, // KEYCODE_MEDIA_PLAY
  pause: 127, // KEYCODE_MEDIA_PAUSE
  toggle: 85, // KEYCODE_MEDIA_PLAY_PAUSE
  seekFwd: 90, // KEYCODE_MEDIA_FAST_FORWARD
  seekBack: 89, // KEYCODE_MEDIA_REWIND
  // OK = play/pause no player. NÃO usamos KEYCODE_MEDIA_PLAY_PAUSE (85): é uma
  // tecla de MÍDIA do sistema, e o WebView/Chromium a roteia para a MediaSession
  // em vez de entregá-la como `keydown` ao iframe do player — por isso o OK não
  // pausava, embora o seek (teclas 90/89) funcionasse. Usamos a tecla que TODO
  // player web escuta para play/pause: ESPAÇO (32), uma tecla comum, entregue
  // como `keydown` confiável ao iframe focado — o MESMO caminho do seek.
  ok: 32, // KEYCODE_SPACE (play/pause universal de players web)
};

/** Nome da tecla (só para depuração/log no lado nativo). */
export const NOME_TECLA: Record<AcaoControle, string> = {
  play: 'MediaPlay',
  pause: 'MediaPause',
  toggle: 'MediaPlayPause',
  seekFwd: 'MediaFastForward',
  seekBack: 'MediaRewind',
  ok: 'Space',
};

/** Superfície da ponte nativa do shell Android TV (MainActivity.PonteNativa). */
export interface PontePlayerTv {
  /**
   * Injeta uma TECLA REAL no WebView com o iframe do player focado.
   * Devolve `true` quando a ponte existe e assumiu a entrega.
   */
  enviarTeclaPlayer?: (keyCode: number, key: string) => boolean;
}

/** A ponte nativa do player, quando o site roda dentro do APK (senão `null`). */
export function pontePlayerTv(): PontePlayerTv | null {
  try {
    const ponte = (window as unknown as { MovieFlixApp?: PontePlayerTv }).MovieFlixApp;
    return ponte && typeof ponte.enviarTeclaPlayer === 'function' ? ponte : null;
  } catch {
    return null;
  }
}

/**
 * A camada nativa que entrega teclas REAIS ao player está disponível?
 *
 * Só o APK a expõe. Quando ela existe, o controle do provedor reage de verdade;
 * quando não existe (navegador), valem o `postMessage` e o vídeo nativo.
 */
export function temPonteDeTeclasNativa(): boolean {
  return pontePlayerTv() !== null;
}

/**
 * Aciona o controle do player do provedor para uma ação do controle remoto.
 *
 * Tenta, nesta ordem: (1) a PONTE NATIVA que entrega a tecla real ao player
 * (Android TV); (2) o protocolo de `postMessage` do embed; (3) o vídeo nativo
 * `[data-mf-player]`. Devolve `true` quando ao menos um caminho agiu.
 *
 * ── CAUSA RAIZ (medida na documentação do PRÓPRIO provedor) ─────────────────
 * O protocolo `postMessage` do embed do StreamBetter é DOCUMENTADO em
 * https://streambetter.shop/docs e define APENAS dois tipos:
 *   • `streambetter:seek`     (entrada — o site manda a posição);
 *   • `streambetter:progress` (saída — o player informa o tempo).
 * NÃO existe NENHUM comando de play/pause por `postMessage`. A correção
 * anterior inventou um `{event:'command',func:'toggle'}` que o provedor NUNCA
 * escuta — por isso o OK continuou sem pausar no aparelho, mesmo com o teste
 * "postados=[...]" passando (o teste só provava que a mensagem SAÍA, não que o
 * player a entendia).
 *
 * O ÚNICO caminho que muda o estado do vídeo é a TECLA REAL entregue pela
 * ponte nativa (KEYCODE_MEDIA_PLAY_PAUSE = 85) com o iframe focado — o mesmo
 * mecanismo que faz o avançar/retroceder funcionar. Por isso o `ok` NÃO manda
 * mais nenhum `postMessage` fabricado: ele usa a ponte nativa e, quando não há
 * ponte (navegador), o vídeo nativo `[data-mf-player]` (play/pause reais).
 *
 * @param iframe   o `<iframe>` do embed do provedor
 * @param acao     a ação pedida pelo controle
 * @param passoSeek segundos do avanço/retrocesso
 * @param ponte    ponte nativa (injetável nos testes)
 */
export function acionarControlePlayer(
  iframe: HTMLIFrameElement | null | undefined,
  acao: AcaoControle,
  passoSeek: number,
  ponte: PontePlayerTv | null = pontePlayerTv(),
): boolean {
  let agiu = false;

  // (1) PONTE NATIVA — entrega uma TECLA REAL com o iframe focado.
  //
  // Vale para TODAS as ações, INCLUSIVE o OK (85 = MEDIA_PLAY_PAUSE): é o único
  // caminho que muda o estado do vídeo no aparelho. Sem ela, o OK do controle
  // mostrava o ícone mas o player do provedor não pausava/retomava.
  try {
    if (ponte?.enviarTeclaPlayer?.(KEYCODE_ANDROID[acao], NOME_TECLA[acao])) agiu = true;
  } catch {
    /* aparelho sem a ponte: seguimos para os caminhos de navegador */
  }

  // (2) + (3) Caminhos de navegador/WebView.
  //
  // O `ok` NÃO entra no `postMessage`: o protocolo do provedor não tem comando
  // de play/pause (ver CAUSA RAIZ acima). Mandar um evento inventado só criava
  // a ILUSÃO de correção. O `ok` entrega uma TECLA REAL pela ponte nativa — mas
  // ESPAÇO (32), não a tecla de mídia 85: o WebView roteia MEDIA_PLAY_PAUSE para
  // a MediaSession (não ligada ao `<video>` do iframe) em vez de entregá-la como
  // `keydown` ao player. Sem ponte (navegador), alterna o vídeo nativo.
  if (acao === 'ok') {
    // Sem ponte nativa (navegador): alterna o vídeo nativo, se houver.
    if (!agiu) {
      try {
        const video =
          iframe?.contentDocument?.querySelector<HTMLVideoElement>('video') ??
          document.querySelector<HTMLVideoElement>('video[data-mf-player]');
        if (video) {
          if (video.ended === true) {
            // Vídeo finalizado: respeita o comportamento existente do player —
            // não alterna (nada de play/pause indevido no fim do vídeo).
          } else if (video.paused) {
            const p = video.play();
            if (p !== undefined) p.catch(() => undefined);
          } else {
            video.pause();
          }
          agiu = true;
        }
      } catch {
        /* cross-origin: inalcançável — só a ponte nativa resolveria */
      }
    }
    return agiu;
  }

  // Demais ações (play/pause explícitos e seek): mantêm o caminho de
  // `postMessage` + vídeo nativo como antes (o seek é o que o usuário confirma
  // que funciona; não mexemos nele).
  const legado: AcaoPlayerBase = acao;
  if (enviarComandoPlayer(iframe, legado, passoSeek)) agiu = true;

  return agiu;
}

/**
 * ESTADO REAL DO ELEMENTO `<video>` DO PLAYER — leitura honesta (sem inventar).
 * ──────────────────────────────────────────────────────────────────────────
 * A especificação pede que a lógica do OK/ENTER use o estado REAL do <video>
 * (`video.paused`) e que o ícone de play/pause o acompanhe (reutilizando a
 * lógica existente, em vez de criar outra).
 *
 * O `<video>` do MovieFlix (player HLS nativo, `[data-mf-player]`) é de MESMA
 * ORIGEM e é lido direto. No embed do provedor o <video> vive num IFRAME de
 * OUTRA origem e a política de mesma origem impede a leitura — nesse caso o
 * estado devolvido é UNKNOWN (nunca um valor inventado). A ação em si continua
 * sendo entregue pela ponte nativa; este módulo só RESOLVE O ESTADO.
 */
export type EstadoVideoPlayer = 'PLAYING' | 'PAUSED' | 'UNKNOWN';

/**
 * ALTERNA a reprodução pelo botão OK/ENTER do controle remoto.
 *
 * É o ÚNICO ponto de decisão do play/pause da TV — usado tanto pelo OK/ENTER
 * quanto pela tecla de mídia do shell. A ordem é:
 *   1. se o `<video>` é LEGÍVEL (mesma origem), alterna DIRETO pelo estado real
 *      (`video.paused`) e trata a Promise de `play()`;
 *   2. senão (embed do provedor, cross-origin), entrega a TECLA REAL pela ponte
 *      nativa — o único caminho que muda o estado do vídeo no aparelho.
 *
 * Devolve o estado que a interface deve mostrar: `true` = pausado.
 * Quando o estado real não é legível, devolve `null` e quem chama mantém o
 * toggle otimista (comportamento anterior, honesto).
 */
export function alternarPlayPausePlayer(
  iframe: HTMLIFrameElement | null | undefined,
  ponte: PontePlayerTv | null = pontePlayerTv(),
): boolean | null {
  // (1) Vídeo legível (mesma origem): alterna pelo estado REAL.
  try {
    const video =
      iframe?.contentDocument?.querySelector<HTMLVideoElement>('video') ??
      document.querySelector<HTMLVideoElement>('video[data-mf-player]');
    if (video) {
      if (video.ended === true) return true; // finalizado: não reinicia por engano
      if (video.paused) {
        const p = video.play();
        if (p !== undefined) p.catch(() => undefined);
        return false;
      }
      video.pause();
      return true;
    }
  } catch {
    /* cross-origin: inalcançável — segue para a ponte nativa */
  }

  // (2) Embed do provedor: entrega a TECLA REAL (ESPAÇO = 32) pela ponte.
  try {
    if (ponte?.enviarTeclaPlayer?.(KEYCODE_ANDROID.ok, NOME_TECLA.ok)) return null;
  } catch {
    /* aparelho sem a ponte: nada a fazer */
  }
  return null;
}

/**
 * Lê o estado real do `<video>` do player.
 *
 * @param iframe      o `<iframe>` do embed (quando o player é embed)
 * @param videoNativo o `<video>` nativo conhecido (evita uma busca no DOM)
 * @returns 'PLAYING' | 'PAUSED' | 'UNKNOWN' (UNKNOWN = estado não legível)
 */
export function estadoDoVideoPlayer(
  iframe: HTMLIFrameElement | null | undefined,
  videoNativo: HTMLVideoElement | null = null,
): EstadoVideoPlayer {
  try {
    const alvo = videoNativo ?? document.querySelector<HTMLVideoElement>('video[data-mf-player]');
    if (alvo) return alvo.paused ? 'PAUSED' : 'PLAYING';
    const interno = iframe?.contentDocument?.querySelector<HTMLVideoElement>('video');
    if (interno) return interno.paused ? 'PAUSED' : 'PLAYING';
  } catch {
    /* cross-origin: o vídeo não é alcançável pelo JS */
  }
  return 'UNKNOWN';
}
