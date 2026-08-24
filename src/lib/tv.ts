/**
 * Detecção de TV / TV Box / TV Box Android / WebView de TV.
 *
 * A navegação por controle remoto (setas + OK + Voltar, com o destaque
 * vermelho no item focado) precisa funcionar em QUALQUER aparelho que rode o
 * app dentro de um WebView de TV — inclusive conversores Android TV Box cujo
 * user-agent é apenas "Android" (genérico), sem nenhuma palavra "TV".
 *
 * Por isso a detecção é agressiva: além de UAs clássicos de TV, tratamos como
 * TV todo WebView Android com > 12" de tela (a maioria dos TV Box), e
 * aceitamos override manual via ?tv=1 / ?tv=0.
 */

const UA_TV = /\b(smart-?tv|smarttv|googletv|android tv|appletv|hbbtv|netcast|webos|tizen|viera|aquos|bravia|philipstv|dtv|crkey|nettv|inettvbrowser|opera tv|large screen|silk|tv box|tvbox)\b/i;

export function ehTelaDeTv(): boolean {
  if (typeof window === "undefined") return false;

  // Permite forçar/desligar manualmente: ?tv=1 ou ?tv=0
  const forcado = new URLSearchParams(window.location.search).get("tv");
  if (forcado === "1") return true;
  if (forcado === "0") return false;

  const ua = navigator.userAgent || "";
  if (UA_TV.test(ua)) return true;

  const largura = window.innerWidth;
  const altura = window.innerHeight;

  // Android TV Box (WebView genérico): Android + tela grande (> 11") +
  // sem mouse real (coarse/none) => quase certamente TV.
  const ehAndroid = /android/i.test(ua);
  const ehDispositivoMovel = /iphone|ipad|ipod|windows phone/i.test(ua);

  if (ehAndroid && !ehDispositivoMovel && largura >= 1100) {
    const ponteiro = window.matchMedia?.("(pointer: coarse)")?.matches;
    const ponteiroFino = window.matchMedia?.("(pointer: fine)")?.matches;
    // TV Box Android não tem mouse: se não há ponteiro fino, é TV.
    if (ponteiroFino === false || ponteiro === true) return true;
    // Mesmo com ponteiro fino (ex.: TV Box com "mouse mode"), telas >= 1400
    // horizontais são quase sempre TVs.
    if (largura >= 1400) return true;
  }

  // PC: tem mouse (ponteiro fino) — não ativa.
  const temMouse = window.matchMedia?.("(pointer: fine)")?.matches ?? true;
  if (temMouse) return false;

  // Sobrou: tela grande, sem mouse => provável TV Box.
  return largura >= 1100;
}
