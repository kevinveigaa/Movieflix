import { useEffect, useRef } from 'react';

/**
 * Controles de reprodução por controle remoto para o player (TV / TV Box).
 *
 * Comportamento:
 *  - OK / Enter / Play / Pause → play/pause do vídeo embutido (primeiro
 *    <video> dentro do iframe do player, quando acessível) ou do elemento
 *    <video> direto da página (fonte MP4/HLS nativa).
 *  - Voltar → se o foco está dentro do player, sai do player (navigate(-1));
 *    caso contrário, deixa o useTvNavigation global tratar.
 *
 * Este hook NÃO intercepta as setas direcionais: a navegação espacial do
 * app (useTvNavigation) continua funcionando para os botões ao redor do
 * player (voltar, abrir no navegador, seletor de episódios etc.).
 */
export function useTvPlayerControls(
  enabled: boolean,
  onBack: () => void,
) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;

    function acao(e: KeyboardEvent) {
      // O useTvNavigation (registrado antes, na mesma fase de captura) já
      // tratou a tecla (ex.: voltar de página) — não agir de novo.
      if (e.defaultPrevented) return;

      const k = e.key;
      const c = e.keyCode || e.which;

      const playPause =
        k === 'Enter' || k === 'OK' || k === 'Select' || k === 'Play' || k === 'Pause' ||
        c === 13 || c === 23 || c === 179 || c === 415 || c === 19;

      const voltar =
        k === 'GoBack' || k === 'BrowserBack' || k === 'XF86Back' || k === 'Escape' ||
        c === 8 || c === 27 || c === 461 || c === 10009 || c === 166 || c === 4;

      if (!playPause && !voltar) return;

      const iframe = document.querySelector<HTMLIFrameElement>('#player-frame');
      const videoDireto = document.querySelector<HTMLVideoElement>('video[data-mf-player]');

      // Tenta controlar o vídeo do player embutido (se o iframe for
      // same-origin ou o player expuser a API). Cross-origin: falha silenciosa.
      let video: HTMLVideoElement | null = null;
      if (videoDireto) {
        video = videoDireto;
      } else if (iframe?.contentDocument) {
        video = iframe.contentDocument.querySelector('video');
      }

      if (playPause) {
        // Só intercepta OK/Enter quando há vídeo controlável OU quando o
        // foco não está em um botão (evita "clicar" duas vezes).
        const ativo = document.activeElement as HTMLElement | null;
        const focoEmBotao =
          !!ativo && (ativo.tagName === 'BUTTON' || ativo.tagName === 'A' || ativo.hasAttribute('data-tv-focusable'));
        if (!video && focoEmBotao) return; // deixa o OK navegar normalmente

        if (video) {
          e.preventDefault();
          e.stopPropagation();
          if (video.paused) {
            video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        }
        return;
      }

      if (voltar) {
        e.preventDefault();
        e.stopPropagation();
        onBackRef.current();
      }
    }

    window.addEventListener('keydown', acao, true);
    return () => window.removeEventListener('keydown', acao, true);
  }, [enabled]);
}
