import { useEffect, useRef, type RefObject } from 'react';

/**
 * Controles de reprodução por controle remoto para o player (TV / TV Box).
 *
 * DOIS MODOS:
 *  - MODO 1 (NAVEGAÇÃO DA PÁGINA): o foco está FORA do player. As setas do
 *    controle navegam a página normalmente (useTvNavigation global). Um toque
 *    rápido de OK executa a ação normal do item focado.
 *  - MODO 2 (CONTROLE DO PLAYER): ativado segurando OK ~1s com o foco no
 *    player. As setas operam os CONTROLES INTERNOS do vídeo (play/pause,
 *    retroceder/avançar, volume, barra de progresso etc.). Um toque rápido de
 *    OK NÃO sai do modo (não confunde toque com long-press); segurar OK ~1s
 *    novamente sai e volta o foco para a página.
 *
 * Comportamento das teclas:
 *  - OK (keyCode 23 / 13): toque rápido = ação normal (ex.: play/pause do
 *    vídeo nativo); long-press (~1s) = alterna MODO 1 <-> MODO 2.
 *  - Setas (19-22 / 37-40): no MODO 2, navegam entre os controles do player
 *    (iframe) ou do vídeo nativo; no MODO 1, são ignoradas aqui (quem trata é
 *    o useTvNavigation global).
 *  - Voltar (keyCode 4 / 27 / 461 / 10009 / 8): no MODO 2, sai do modo
 *    primeiro; no MODO 1, navega para trás (navigate(-1)).
 *
 * Este hook registra o listener em FASE DE CAPTURA e ANTES do
 * useTvNavigation? Não — o useTvNavigation é registrado no App (ancestral) e
 * este hook na página do player (descendente): a fase de captura desce do
 * ancestral para o descendente, então o useTvNavigation vê a tecla PRIMEIRO.
 * Por isso este hook respeita `e.defaultPrevented` (o global já tratou).
 */
export function useTvPlayerControls(
  enabled: boolean,
  playerMode: boolean,
  playerFrameRef: RefObject<HTMLIFrameElement | null>,
  onBack: () => void,
) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const modeRef = useRef(playerMode);
  modeRef.current = playerMode;
  const frameRef = useRef(playerFrameRef);
  frameRef.current = playerFrameRef;

  useEffect(() => {
    if (!enabled) return;

    // ---- Long-press do OK (~1s) -------------------------------------------
    let longPressTimer: number | null = null;
    let longPressFired = false;

    function cancelLongPress() {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      longPressFired = false;
    }

    function isOk(e: KeyboardEvent): boolean {
      const k = e.key;
      const c = e.keyCode || e.which;
      return (
        k === 'Enter' || k === 'OK' || k === 'Select' ||
        c === 13 || c === 23 || c === 32
      );
    }

    function isBack(e: KeyboardEvent): boolean {
      const k = e.key;
      const c = e.keyCode || e.which;
      return (
        k === 'GoBack' || k === 'BrowserBack' || k === 'XF86Back' ||
        k === 'Escape' || k === 'Backspace' ||
        c === 8 || c === 27 || c === 461 || c === 10009 || c === 166 || c === 4
      );
    }

    function isArrow(e: KeyboardEvent): 'left' | 'right' | 'up' | 'down' | null {
      const k = e.key;
      const c = e.keyCode || e.which;
      if (k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19) return 'up';
      if (k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20) return 'down';
      if (k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21) return 'left';
      if (k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22) return 'right';
      return null;
    }

    /** Foco está no player (iframe) ou no contêiner do vídeo nativo? */
    function focoNoPlayer(): boolean {
      const ativo = document.activeElement as HTMLElement | null;
      if (!ativo) return false;
      if (ativo.tagName === 'IFRAME') return true;
      if (ativo.tagName === 'VIDEO') return true;
      // O anel vermelho pode estar no contêiner (data-tv-player-box) — o
      // conetúdo foi clicado via long-press e o foco ficou no wrapper.
      return !!ativo.closest?.('[data-tv-player-box]');
    }

    /** Dentro do iframe: envia a tecla para o documento interno (cross-origin: falha silenciosa). */
    function teclaNoIframe(e: KeyboardEvent) {
      const iframe = frameRef.current?.current;
      if (!iframe) return false;
      try {
        const doc = iframe.contentDocument;
        if (!doc) return false;
        const ev = new KeyboardEvent('keydown', {
          key: e.key,
          code: e.code || '',
          keyCode: e.keyCode || 0,
          which: e.which || 0,
          bubbles: true,
          cancelable: true,
        });
        doc.dispatchEvent(ev);
        return true;
      } catch {
        return false; // cross-origin: não conseguimos injetar
      }
    }

    /** Ação de OK: play/pause do vídeo nativo (se houver). */
    function playPauseNative() {
      const video = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
      if (!video) return false;
      try {
        if (video.paused) {
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
        return true;
      } catch {
        return false;
      }
    }

    function acao(e: KeyboardEvent) {
      // O useTvNavigation global (registrado antes, na captura) já tratou a
      // tecla — não agir de novo (ex.: Voltar navegou a página).
      if (e.defaultPrevented) return;

      // Long-press de OK: registra o timer apenas quando a tecla é OK e ainda
      // não disparou. O timer é cancelado no keyup.
      if (isOk(e)) {
        if (!longPressTimer && !longPressFired) {
          longPressFired = false;
          longPressTimer = window.setTimeout(() => {
            longPressFired = true;
            // Só alterna o modo quando o foco está no player (ou no wrapper).
            if (focoNoPlayer()) {
              e.preventDefault();
              e.stopPropagation();
              document.documentElement.classList.toggle('tv-in-player');
              // Dispara um evento customizado para o React atualizar o badge.
              window.dispatchEvent(new CustomEvent('mf-player-mode-change'));
            }
          }, 1000);
        }
        return;
      }

      // Libera o long-press quando a tecla é solta.
      if (e.type === 'keyup' && isOk(e)) {
        cancelLongPress();
        return;
      }

      const dir = isArrow(e);
      const voltar = isBack(e);

      // ---- MODO 2 (controle do player) --------------------------------------
      if (modeRef.current) {
        if (voltar) {
          e.preventDefault();
          e.stopPropagation();
          // Voltar sai do modo primeiro (nunca sai da página direto).
          document.documentElement.classList.remove('tv-in-player');
          window.dispatchEvent(new CustomEvent('mf-player-mode-change'));
          const iframe = frameRef.current?.current;
          try { iframe?.blur(); } catch { /* ignora */ }
          (document.activeElement as HTMLElement | null)?.blur?.();
          // Devolve o foco para um elemento da página (o player continua
          // focável, mas o modo sai).
          const f = document.querySelector<HTMLElement>('[data-tv-focusable], button, a');
          f?.focus?.({ preventScroll: true });
          return;
        }

        if (dir) {
          e.preventDefault();
          e.stopPropagation();
          // Tenta mandar a seta para dentro do iframe (controles do player).
          if (!teclaNoIframe(e)) {
            // Cross-origin sem acesso: o vídeo nativo recebe as setas via
            // controles HTML5 (se o foco estiver no vídeo, ele já trata).
            const video = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
            if (video) {
              try {
                const ev = new KeyboardEvent('keydown', {
                  key: e.key,
                  keyCode: e.keyCode || 0,
                  bubbles: true,
                  cancelable: true,
                });
                video.dispatchEvent(ev);
              } catch { /* ignora */ }
            }
          }
          return;
        }

        if (isOk(e)) {
          // Long-press já foi tratado no keydown acima (timer) — aqui é o
          // keyup do long-press ou um toque rápido. Toque rápido = ação normal.
          if (longPressFired) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // Toque rápido: play/pause do vídeo nativo; se não houver, deixa o
          // iframe/player tratar (a tecla original não é bloqueada).
          if (playPauseNative()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }

        return; // outras teclas no modo player: ignora
      }

      // ---- MODO 1 (navegação da página) -------------------------------------
      // Só o Voltar tem tratamento aqui (back da página). Setas e OK rápido
      // ficam com o useTvNavigation global / comportamento nativo.
      if (voltar) {
        e.preventDefault();
        e.stopPropagation();
        onBackRef.current();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (isOk(e)) cancelLongPress();
    }

    window.addEventListener('keydown', acao, true);
    window.addEventListener('keyup', onKeyUp, true);

    return () => {
      window.removeEventListener('keydown', acao, true);
      window.removeEventListener('keyup', onKeyUp, true);
      if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    };
  }, [enabled]);
}
