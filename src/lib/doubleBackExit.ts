/**
 * MovieFlix — Saída com DUPLA PULSAÇÃO (double-back to exit).
 *
 * Regra do produto: o usuário NUNCA sai do site/player com um único "voltar"
 * (botão back do navegador, tecla Voltar do controle remoto, gesto do sistema).
 * Sair só é permitido com DUAS pulsações de "voltar" em menos de 2s — tanto em
 * PC quanto em TV/APK.
 *
 * Como funciona (2 mecanismos complementares):
 *
 * 1) GUARD DE HISTÓRICO (cobre PC, TV e WebView do APK):
 *    Ao montar, empurramos uma entrada fantasma `{ mfExitGuard: true }` no
 *    fundo do histórico. Toda a navegação interna do SPA (React Router) fica
 *    ACIMA dela e continua funcionando com UM clique (voltar dentro do site
 *    navega normalmente). Quando o usuário pressiona "voltar" já na raiz do
 *    app, o popstate cai NA ENTRADA GUARD — aí interceptamos:
 *      - 1ª pulsação: mostra um aviso sutil ("Pulsa de novo para sair") e
 *        re-empurra o guard para "pegar" a próxima pulsação. NÃO sai.
 *      - 2ª pulsação (≤2s): remove o interceptor e sai DE VERDADE
 *        (fecha o app nativo via MovieFlixAndroid.exitApp() no APK, ou
 *        history.back() no navegador comum).
 *
 * 2) DEFESA POR TECLA (fallback para useTvNavigation quando o histórico não
 *    estiver disponível): mesma janela de 2s com timestamps.
 *
 * Tudo é SILENCIOSO no sentido de não "travar" o usuário com diálogos — o
 * único feedback é o aviso discreto de "pulsa de novo" (padrão Android), que
 * some sozinho. Nenhum alert/toast de "bloqueado" é exibido.
 */

let avisoEl: HTMLDivElement | null = null;
let avisoTimer: number | null = null;

/** Janela (ms) entre as duas pulsações de "voltar" para permitir a saída. */
export const JANELA_DUPLO_BACK = 2000;

/** Mostra o aviso discreto "Pulsa de novo para sair" (some sozinho em ~1.8s). */
export function mostrarAvisoSair(): void {
  try {
    if (!avisoEl) {
      avisoEl = document.createElement('div');
      avisoEl.className = 'mf-exit-hint';
      avisoEl.setAttribute('role', 'status');
      avisoEl.textContent = 'Pulsa de novo para sair';
      document.body.appendChild(avisoEl);
    }
    avisoEl.classList.add('mf-show');
    if (avisoTimer !== null) window.clearTimeout(avisoTimer);
    avisoTimer = window.setTimeout(() => {
      avisoEl?.classList.remove('mf-show');
    }, 1800);
  } catch {
    /* nunca quebra o player por causa do aviso */
  }
}

/**
 * Executa a saída REAL após o duplo-back confirmado.
 * - No APK (WebView Capacitor): chama o bridge nativo `MovieFlixAndroid.exitApp()`
 *   (registrado no MainActivity) → fecha o app.
 * - No navegador comum: deixa o back sair do site (o guard foi removido pelo
 *   chamador antes de invocar isto).
 */
export function sairDeVerdade(): void {
  // 1) APK (Capacitor): plugin nativo MovieFlixAndroid.exitApp() fecha o app.
  try {
    const w = window as unknown as {
      Capacitor?: { Plugins?: { MovieFlixApp?: { exitApp?: () => Promise<void> | void } } };
      MovieFlixAndroid?: { exitApp?: () => void };
    };
    const plugin = w.Capacitor?.Plugins?.MovieFlixApp;
    if (plugin && typeof plugin.exitApp === 'function') {
      plugin.exitApp();
      return;
    }
    // 2) Fallback: JavascriptInterface legado (se existir).
    if (w.MovieFlixAndroid && typeof w.MovieFlixAndroid.exitApp === 'function') {
      w.MovieFlixAndroid.exitApp();
      return;
    }
  } catch {
    /* ignora */
  }
  // 3) Navegador comum / último recurso: deixa o back sair do site.
  try {
    window.history.back();
  } catch {
    /* ignora */
  }
}

let ultimaSaidaPorTecla = 0;

/**
 * Defesa por tecla (usada pelo useTvNavigation quando não há histórico para
 * navegar): devolve `true` apenas na SEGUNDA pulsação dentro de 2s.
 * Na primeira, mostra o aviso e devolve `false`.
 */
export function pedirSaidaPorTecla(): boolean {
  const agora = Date.now();
  if (agora - ultimaSaidaPorTecla < JANELA_DUPLO_BACK) {
    ultimaSaidaPorTecla = 0;
    return true;
  }
  ultimaSaidaPorTecla = agora;
  mostrarAvisoSair();
  return false;
}

/**
 * Instala o guard de histórico + interceptor de popstate. Deve ser chamado UMA
 * vez por montagem do app (useDoubleBackExit). Retorna a função de limpeza.
 *
 * Regras:
 * - Navegação interna do SPA (popstate SEM mfExitGuard): NUNCA é interceptada —
 *   voltar dentro do site continua com um clique.
 * - Popstate com mfExitGuard (tentativa de SAIR do site/app): exige duplo-back.
 */
export function instalarGuardDeSalida(): () => void {
  // Expõe o aviso para o shell nativo (MainActivity) chamar via evaluateJavascript
  // quando o usuário pressiona Voltar na raiz e o JS não capturou a tecla.
  try {
    (window as unknown as { __mfMostrarAviso?: () => void }).__mfMostrarAviso = mostrarAvisoSair;
  } catch {
    /* ignora */
  }

  // Empurra a entrada fantasma se ainda não existir (idempotente para
  // re-montagens em StrictMode/dev).
  try {
    const st = window.history.state as { mfExitGuard?: boolean } | null;
    if (!st || !st.mfExitGuard) {
      window.history.pushState({ mfExitGuard: true } as unknown as unknown, '');
    }
  } catch {
    /* histórico indisponível: a defesa por tecla cobre */
  }

  let primeiraSaida = 0;
  let saindo = false;

  function onPopState(): void {
    if (saindo) return;
    const st = window.history.state as { mfExitGuard?: boolean } | null;
    if (!st || !st.mfExitGuard) return; // navegação interna normal — deixa passar

    const agora = Date.now();
    if (agora - primeiraSaida < JANELA_DUPLO_BACK) {
      // SEGUNDA pulsação: sai de verdade.
      saindo = true;
      window.removeEventListener('popstate', onPopState);
      sairDeVerdade();
      return;
    }

    // PRIMEIRA pulsação: avisa e re-empurra o guard para pegar a próxima.
    primeiraSaida = agora;
    mostrarAvisoSair();
    try {
      window.history.pushState({ mfExitGuard: true } as unknown as unknown, '');
    } catch {
      /* ignora */
    }
  }

  window.addEventListener('popstate', onPopState);

  return () => {
    window.removeEventListener('popstate', onPopState);
  };
}
