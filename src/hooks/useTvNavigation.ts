import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Navegação espacial por controle remoto / teclado (TV, TV Box, PC).
 *
 * Compatível com:
 *  - Android TV / Chrome / WebView  (keyCode 37-40, 13, 8)
 *  - Samsung Tizen                  (keyCode 10009 = Voltar)
 *  - LG webOS                       (keyCode 461 = Voltar)
 *  - Teclas antigas "Left"/"Up"/"Right"/"Down"/"Enter"
 *
 * Muitas TVs enviam e.key === "Unidentified", por isso usamos keyCode como
 * fonte principal e e.key só como reforço.
 */

const SELETOR_FOCAVEL = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "video",
  "[tabindex]:not([tabindex='-1'])",
  "[data-tv-focusable]",
].join(",");

type Direcao = "up" | "down" | "left" | "right";

function visivel(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const estilo = window.getComputedStyle(el);
  if (estilo.visibility === "hidden" || estilo.display === "none" || estilo.opacity === "0") return false;
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
  if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|VIDEO)$/.test(el.tagName)) {
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

  // Prefere o conteudo principal (banner/cards) em vez do menu do topo:
  // numa TV o usuario espera comecar no filme em destaque, nao no logo.
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

  if (k === "ArrowUp" || k === "Up" || c === 38) return "up";
  if (k === "ArrowDown" || k === "Down" || c === 40) return "down";
  if (k === "ArrowLeft" || k === "Left" || c === 37) return "left";
  if (k === "ArrowRight" || k === "Right" || c === 39) return "right";
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

export function useTvNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // Foco inicial a cada troca de página (o controle precisa ter "onde começar").
  useEffect(() => {
    limparFocoVisual();
    const t = window.setTimeout(() => {
      const ativo = document.activeElement as HTMLElement | null;
      if (!ativo || ativo === document.body || !visivel(ativo)) {
        const inicial = primeiroFocavel();
        if (inicial) focar(inicial);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  useEffect(() => {
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

      if (acao === "back") {
        if (digitando && (e.key === "Backspace" || e.keyCode === 8)) return; // apagar texto
        e.preventDefault();
        if (window.history.length > 1) navigate(-1);
        else navigate("/");
        return;
      }

      if (acao === "ok") {
        if (!ativo || ativo === document.body) {
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
        }
        return;
      }

      const dir = acao;

      if (digitando && (dir === "left" || dir === "right")) return;
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
      // mantém o destaque coerente
      limparFocoVisual();
      const ativo = document.activeElement as HTMLElement | null;
      if (ativo && ativo !== document.body) ativo.classList.add("tv-focus");
    }

    // Fase de captura: garante que a navegação funcione mesmo quando um
    // componente interno (carrossel, player, modal) também escuta teclado.
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusOut);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusOut);
      document.documentElement.classList.remove("tv-nav");
    };
  }, [navigate]);
}
