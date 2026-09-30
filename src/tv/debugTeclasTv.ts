/**
 * DEBUG TEMPORÁRIO — overlay de teclas do controle remoto (MovieFlix TV).
 * ═══════════════════════════════════════════════════════════════════════════
 * OBJETIVO: descobrir, NO APARELHO REAL, qual keyCode o botão OK (e as setas)
 * realmente envia, e por qual caminho o evento passa. O player do provedor está
 * atrás do Cloudflare/Turnstile e NÃO pode ser testado de fora — só o aparelho
 * responde. Este overlay mostra, na própria TV, as últimas 10 teclas recebidas:
 *
 *   • linhas "JS"      → o que o documento do MovieFlix TV recebeu (keydown/keyup)
 *   • linhas "ANDROID" → o keyCode CRU que a camada nativa interceptou ANTES de
 *                        entregar ao WebView (encaminhado por MainActivity)
 *
 * Comparando as duas linhas da MESMA pulsação sabemos se o OK chega ao site, com
 * que código, e se o Android o consome antes. É instrumentação de diagnóstico:
 * não altera nenhum comportamento do player, do login ou da navegação.
 */

let instalado = false;
const linhas: string[] = [];

function overlay(): HTMLElement {
  let el = document.getElementById('mf-debug-teclas');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mf-debug-teclas';
    el.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:2147483647;' +
      'background:rgba(0,0,0,.85);color:#39ff14;font:12px/1.35 monospace;' +
      'padding:8px 10px;border-radius:6px;max-width:94vw;max-height:60vh;' +
      'overflow:hidden;white-space:pre-wrap;pointer-events:none;' +
      'text-shadow:0 0 2px #000;';
    (document.body || document.documentElement).appendChild(el);
  }
  return el;
}

function registrar(origem: string, dados: Record<string, unknown>): void {
  const t = new Date().toISOString().slice(11, 23);
  linhas.push(`[${t}] ${origem} ${JSON.stringify(dados)}`);
  while (linhas.length > 10) linhas.shift();
  try {
    overlay().textContent = 'DEBUG TECLAS (últimas 10)\n' + linhas.join('\n');
  } catch {
    /* sem DOM ainda: ignora */
  }
}

/** Instala o overlay e os listeners (idempotente). */
export function instalarDebugTeclas(): void {
  if (instalado) return;
  instalado = true;

  const handler = (e: KeyboardEvent) => {
    const alvo = e.target as HTMLElement | null;
    const ativo = document.activeElement as HTMLElement | null;
    registrar('JS', {
      type: e.type,
      keyCode: e.keyCode,
      which: e.which,
      key: e.key,
      code: e.code,
      repeat: e.repeat,
      target: alvo?.tagName ?? null,
      active: ativo?.tagName ?? null,
    });
  };
  window.addEventListener('keydown', handler, true);
  window.addEventListener('keyup', handler, true);

  // Android → JS: a ponte nativa encaminha o keyCode CRU interceptado.
  window.addEventListener('mf-debug-android', ((e: CustomEvent) => {
    registrar('ANDROID', (e.detail as Record<string, unknown>) ?? {});
  }) as EventListener);

  registrar('SISTEMA', { msg: 'overlay instalado' });
}
