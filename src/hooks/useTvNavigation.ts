import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ehTelaDeTv } from "@/lib/tv";

/**
 * Navegação espacial por controle remoto / teclado (TV, TV Box, Android TV Box).
 *
 * Compatível com:
 *  - Android TV / TV Box (WebView)  keyCode 19-22 (setas), 23 (OK), 4 (Voltar)
 *  - Chrome / WebView clássico       keyCode 37-40, 13, 8
 *  - Samsung Tizen                  keyCode 10009 = Voltar
 *  - LG webOS                       keyCode 461 = Voltar
 *  - Teclas antigas "Left"/"Up"/"Right"/"Down"/"Enter"
 *
 * Muitas TVs enviam e.key === "Unidentified", por isso usamos keyCode como
 * fonte principal e e.key só como reforço.
 *
 * O modo TV é controlado por ehTelaDeTv() (ver src/lib/tv.ts) e pode ser
 * forçado com ?tv=1 — essencial para TV Box Android com user-agent genérico.
 */

const SELETOR_FOCAVEL = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "video",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
  "[data-tv-focusable]",
].join(",");

type Direcao = "up" | "down" | "left" | "right";

function visivel(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const estilo = window.getComputedStyle(el);
  if (estilo.visibility === "hidden" || estilo.display === "none" || estilo.opacity === "0") return false;
  // Elementos sob um modal aberto ficam ocultos da navegação (data-tv-hidden).
  if (el.closest("[data-tv-hidden]")) return false;
  return true;
}

function candidatos(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)).filter(visivel);
}

function centro(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}

function melhorAlvo(atual: HTMLElement, dir: Direcao): HTMLElement | null {
  const origem = centro(atual);
  let melhor: HTMLElement | null = null;
  let melhorCusto = Number.POSITIVE_INFINITY;

  for (const el of candidatos()) {
    if (el === atual) continue;
    const alvo = centro(el);
    const dx = alvo.x - origem.x;
    const dy = alvo.y - origem.y;

    const naDirecao =
      (dir === "right" && alvo.r.left >= origem.r.right - 4) ||
      (dir === "left" && alvo.r.right <= origem.r.left + 4) ||
      (dir === "down" && alvo.r.top >= origem.r.bottom - 4) ||
      (dir === "up" && alvo.r.bottom <= origem.r.top + 4);

    if (!naDirecao) continue;

    const principal = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    const desvio = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    const custo = principal + desvio * 3;

    if (custo < melhorCusto) {
      melhorCusto = custo;
      melhor = el;
    }
  }

  return melhor;
}

function focar(el: HTMLElement) {
  if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|VIDEO|IFRAME)$/.test(el.tagName)) {
    el.setAttribute("tabindex", "0");
  }
  el.focus({ preventScroll: true });
  el.classList.add("tv-focus");
  el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
}

function limparFocoVisual() {
  document.querySelectorAll(".tv-focus").forEach((el) => el.classList.remove("tv-focus"));
}

function primeiroFocavel(): HTMLElement | null {
  const lista = candidatos();
  const naTela = lista.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight;
  });

  // Prefere o conteúdo principal (banner/cards) em vez do menu do topo:
  // numa TV o usuário espera começar no filme em destaque, não no logo.
  const conteudo = document.querySelector("main");
  if (conteudo) {
    const dentro = naTela.filter((el) => conteudo.contains(el));
    if (dentro.length > 0) return dentro[0];
  }

  return naTela[0] ?? lista[0] ?? null;
}

/** Traduz o evento em uma ação, aceitando key OU keyCode (TVs). */
function acaoDaTecla(e: KeyboardEvent): Direcao | "ok" | "back" | null {
  const k = e.key;
  const c = e.keyCode || e.which;

  // Android TV / TV Box: 19=Up 20=Down 21=Left 22=Right 23=Center/OK 4=Back
  if (k === "ArrowUp" || k === "Up" || c === 38 || c === 19) return "up";
  if (k === "ArrowDown" || k === "Down" || c === 40 || c === 20) return "down";
  if (k === "ArrowLeft" || k === "Left" || c === 37 || c === 21) return "left";
  if (k === "ArrowRight" || k === "Right" || c === 39 || c === 22) return "right";
  if (k === "Enter" || k === "OK" || k === "Select" || c === 13 || c === 32 || c === 23) return "ok";
  if (
    k === "GoBack" ||
    k === "BrowserBack" ||
    k === "XF86Back" ||
    k === "Escape" ||
    k === "Backspace" ||
    c === 8 ||
    c === 27 ||
    c === 461 ||
    c === 10009 ||
    c === 166 ||
    c === 4
  )
    return "back";

  return null;
}

/** Estamos dentro do iframe do player? (foco dedicado ao vdeo) */
function noPlayerFrame(): boolean {
  const ativo = document.activeElement as HTMLElement | null;
  return !!ativo && (ativo.tagName === "IFRAME" || ativo.tagName === "VIDEO" || !!ativo.closest?.("[data-tv-player-box]"));
}

/** O modo "CONTROLE DO PLAYER" est ativo? (long-press OK) */
function playerModeAtivo(): boolean {
  return document.documentElement.classList.contains("tv-in-player");
}

/** Sincroniza o estado do modo com o badge/indicador (evento do useTvPlayerControls). */
function emitirModoPlayer() {
  window.dispatchEvent(new CustomEvent("mf-player-mode-change"));
}

export function useTvNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const emTv = typeof window !== "undefined" && ehTelaDeTv();

  // Foco inicial a cada troca de página (o controle precisa ter "onde começar").
  useEffect(() => {
    if (!emTv) return;
    limparFocoVisual();
    const t = window.setTimeout(() => {
      const ativo = document.activeElement as HTMLElement | null;
      if (!ativo || ativo === document.body || !visivel(ativo)) {
        const inicial = primeiroFocavel();
        if (inicial) focar(inicial);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [location.pathname, emTv]);

  useEffect(() => {
    if (!emTv) {
      document.documentElement.classList.remove("tv-nav");
      document.documentElement.classList.remove("tv-in-player");
      limparFocoVisual();
      return;
    }
    document.documentElement.classList.add("tv-nav");

    // Registra tecla de Voltar do Tizen (Samsung), quando disponível.
    const tizen = (window as unknown as { tizen?: { tvinputdevice?: { registerKey: (k: string) => void } } }).tizen;
    try {
      tizen?.tvinputdevice?.registerKey("Back");
    } catch {
      /* ignora */
    }

    function onKeyDown(e: KeyboardEvent) {
      const acao = acaoDaTecla(e);
      if (!acao) return;

      const ativo = document.activeElement as HTMLElement | null;
      const digitando =
        !!ativo &&
        (ativo.tagName === "INPUT" || ativo.tagName === "TEXTAREA" || ativo.isContentEditable);

      // Voltar: prioridade 1  se o foco est dentro do player (iframe),
      // "sai" do player (volta a navegar a pgina). Se o modo CONTROLE DO
      // PLAYER estiver ativo, sai do modo antes de navegar a pgina.
      if (acao === "back") {
        if (digitando && (e.key === "Backspace" || e.keyCode === 8)) return; // apagar texto
        if (playerModeAtivo()) {
          e.preventDefault();
          document.documentElement.classList.remove("tv-in-player");
          emitirModoPlayer();
          const inicial = primeiroFocavel();
          if (inicial) focar(inicial);
          return;
        }
        e.preventDefault();
        if (noPlayerFrame()) {
          document.documentElement.classList.remove("tv-in-player");
          (ativo as HTMLIFrameElement).blur();
          const inicial = primeiroFocavel();
          if (inicial) focar(inicial);
          return;
        }
        if (window.history.length > 1) navigate(-1);
        else navigate("/");
        return;
      }

      // OK / Enter.
      if (acao === "ok") {
        // No player (pgina com #player-frame), o OK  usado para
        // play/pause pelo useTvPlayerControls. S navega para o primeiro
        // focado se NO houver player na tela.
        const temPlayer = !!document.querySelector("#player-frame") || !!document.querySelector("video[data-mf-player]");
        if (noPlayerFrame()) {
          // Foco no player (iframe/vídeo/contêiner): NÃO intercepta o OK aqui.
          // O useTvPlayerControls (registrado depois, na mesma fase de captura)
          // detecta o long-press (~1s) para entrar/sair do modo CONTROLE DO
          // PLAYER; o toque rápido é o comportamento normal do player (o
          // WebView/iframe recebe a tecla e executa play/pause).
          if (playerModeAtivo()) return; // modo player: useTvPlayerControls cuida
          return;
        }
        if (!ativo || ativo === document.body) {
          if (temPlayer) return; // deixa o player controlar o OK
          const inicial = primeiroFocavel();
          if (inicial) {
            e.preventDefault();
            focar(inicial);
          }
          return;
        }
        if (digitando) return; // deixa o form enviar normalmente
        if (ativo.tagName === "A" || ativo.tagName === "BUTTON" || ativo.hasAttribute("data-tv-focusable")) {
          e.preventDefault();
          ativo.click();
        } else if (ativo.tagName === "IFRAME") {
          // Entrar no player: foca o iframe e esconde o anel (o vídeo assume).
          e.preventDefault();
          ativo.focus({ preventScroll: true });
          document.documentElement.classList.add("tv-in-player");
        }
        return;
      }

      // Setas direcionais.
      const dir = acao;

      // Dentro do player (iframe) OU modo CONTROLE DO PLAYER ativo: as setas
      // vo para o player (volume/seek etc.)  o useTvPlayerControls trata.
      if (noPlayerFrame() || playerModeAtivo()) return;

      // Caixa de texto: setas esquerda/direita movem o cursor; cima/baixo saem.
      if (digitando) {
        if (dir === "left" || dir === "right") return;
        (ativo as HTMLElement).blur();
      }
      if (ativo?.tagName === "SELECT") return;

      if (!ativo || ativo === document.body || !visivel(ativo)) {
        const inicial = primeiroFocavel();
        if (inicial) {
          e.preventDefault();
          focar(inicial);
        }
        return;
      }

      const alvo = melhorAlvo(ativo, dir);
      if (!alvo) {
        // Sem vizinho na direção: rola a página para continuar navegando.
        if (dir === "down" || dir === "up") {
          e.preventDefault();
          window.scrollBy({ top: dir === "down" ? 300 : -300, behavior: "smooth" });
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      limparFocoVisual();
      focar(alvo);
    }

    function onFocusOut() {
      // Mantém o destaque coerente.
      limparFocoVisual();
      const ativo = document.activeElement as HTMLElement | null;
      if (ativo && ativo !== document.body) ativo.classList.add("tv-focus");
    }

    // Fase de captura: garante que a navegação funcione mesmo quando um
    // componente interno (carrossel, player, modal) também escuta teclado.
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusOut);

    // Sincroniza o estado do modo do player (long-press OK) com o badge.
    function onModeChange() {
      // O anel de foco do modo player  controlado pelo CSS (.tv-in-player).
    }
    window.addEventListener("mf-player-mode-change", onModeChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusOut);
      window.removeEventListener("mf-player-mode-change", onModeChange);
      document.documentElement.classList.remove("tv-nav");
      document.documentElement.classList.remove("tv-in-player");
    };
  }, [navigate, emTv]);
}