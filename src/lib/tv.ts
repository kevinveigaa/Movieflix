/**
 * Detecção de TV / TV Box.
 *
 * A navegação por controle remoto (setas + OK + Voltar, com o destaque
 * vermelho no item focado) só faz sentido em telas grandes de TV.
 * Em celular, tablet e PC ela é desligada — nada de foco "preso" na tela.
 */

const UA_TV = /\b(smart-?tv|smarttv|googletv|android tv|appletv|hbbtv|netcast|webos|tizen|viera|aquos|bravia|philipstv|dtv|crkey|nettv|inettvbrowser|opera tv|large screen|silk)\b/i;

export function ehTelaDeTv(): boolean {
  if (typeof window === "undefined") return false;

  // Permite forçar/desligar manualmente: ?tv=1 ou ?tv=0
  const forcado = new URLSearchParams(window.location.search).get("tv");
  if (forcado === "1") return true;
  if (forcado === "0") return false;

  const ua = navigator.userAgent || "";
  if (UA_TV.test(ua)) return true;

  // Celular/tablet: nunca ativa.
  if (/android|iphone|ipad|ipod|mobile|tablet/i.test(ua)) return false;

  // PC: tem mouse (ponteiro fino) — não ativa.
  const temMouse = window.matchMedia?.("(pointer: fine)")?.matches ?? true;
  if (temMouse) return false;

  // Sobrou: tela grande, sem mouse => provável TV Box.
  return window.innerWidth >= 1280;
}
