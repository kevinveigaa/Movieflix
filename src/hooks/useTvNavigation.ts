import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Navegação espacial por controle remoto / teclado (TV, TV Box, PC).
 *
 * - Setas: move o foco para o elemento mais próximo na direção
 * - OK / Enter: aciona o elemento focado
 * - Voltar (Backspace / Escape / tecla "Back" de TV): volta uma página
 *
 * Funciona com qualquer elemento focável (links, botões, inputs) e faz
 * o scroll acompanhar o foco automaticamente.
 */

const SELETOR_FOCAVEL = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
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

    // Precisa estar realmente na direção pedida.
    const naDirecao =
      (dir === "right" && alvo.r.left >= origem.r.right - 4) ||
      (dir === "left" && alvo.r.right <= origem.r.left + 4) ||
      (dir === "down" && alvo.r.top >= origem.r.bottom - 4) ||
      (dir === "up" && alvo.r.bottom <= origem.r.top + 4);

    if (!naDirecao) continue;

    const principal = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
    const desvio = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);

    // Penaliza fortemente o desvio para manter o foco na mesma linha/coluna.
    const custo = principal + desvio * 3;

    if (custo < melhorCusto) {
      melhorCusto = custo;
      melhor = el;
    }
  }

  return melhor;
}

function primeiroFocavel(): HTMLElement | null {
  const lista = candidatos().filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight;
  });
  return lista[0] ?? candidatos()[0] ?? null;
}

export function useTvNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add("tv-nav");

    function onKeyDown(e: KeyboardEvent) {
      const ativo = document.activeElement as HTMLElement | null;
      const digitando =
        !!ativo &&
        (ativo.tagName === "INPUT" || ativo.tagName === "TEXTAREA" || ativo.isContentEditable);

      // Voltar (Backspace de controle remoto / Escape / tecla Back de TV)
      if (
        e.key === "GoBack" ||
        e.key === "BrowserBack" ||
        e.key === "Escape" ||
        (e.key === "Backspace" && !digitando)
      ) {
        e.preventDefault();
        navigate(-1);
        return;
      }

      const mapa: Record<string, Direcao> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };

      const dir = mapa[e.key];
      if (!dir) return;

      // Em campos de texto, as setas horizontais movem o cursor.
      if (digitando && (dir === "left" || dir === "right")) return;
      if (ativo?.tagName === "SELECT") return;

      if (!ativo || ativo === document.body || !visivel(ativo)) {
        const inicial = primeiroFocavel();
        if (inicial) {
          e.preventDefault();
          inicial.focus({ preventScroll: true });
          inicial.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        }
        return;
      }

      const alvo = melhorAlvo(ativo, dir);
      if (!alvo) return;

      e.preventDefault();
      alvo.focus({ preventScroll: true });
      alvo.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.classList.remove("tv-nav");
    };
  }, [navigate]);
}
