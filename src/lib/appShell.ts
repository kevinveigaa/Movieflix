/**
 * MovieFlix — Detecção do shell nativo (app Android via Capacitor).
 *
 * O APK é um WebView remoto que carrega este site. Este módulo expõe:
 *
 * - `rodandoNoApp()` → true quando o site está rodando DENTRO do app
 *   (Android/TV Box). Usado para:
 *     * esconder o botão "Baixar app" (não faz sentido baixar o app dentro
 *       do próprio app);
 *     * mostrar a dica de controle remoto sempre (TV) / adaptar a UI.
 * - `appIsAppPromise` → Promise<boolean> (não bloqueia se o plugin não existir).
 *
 * Implementação: tenta o plugin Capacitor (`window.Capacitor` +
 * `MovieFlixApp.isApp()`). Se não existir (navegador comum), resolve false.
 */

let cache: boolean | null = null;

/** Detecta se o site está rodando dentro do app nativo (Capacitor). */
export async function rodandoNoApp(): Promise<boolean> {
  if (cache !== null) return cache;
  try {
    const w = window as any;
    const cap = w.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const plugin = cap.Plugins?.MovieFlixApp;
      if (plugin?.isApp) {
        const res = await plugin.isApp();
        cache = Boolean(res?.isApp);
        return cache;
      }
      // Sem plugin registrado, mas é Capacitor (WebView nativo).
      cache = true;
      return true;
    }
  } catch {
    // Qualquer erro → trata como navegador comum.
  }
  cache = false;
  return false;
}

/** Sincroniza (melhor esforço) com o estado nativo — usa cache. */
export function ehAppSincrono(): boolean {
  return cache === true;
}

/**
 * Abre o WhatsApp OFICIAL do MovieFlix DENTRO do app nativo (APK/Capacitor).
 *
 * Motivo: no WebView do app, `window.open` é bloqueado por
 * `setSupportMultipleWindows(false)` (retorna um Window inútil, não-nulo) e a
 * navegação via `location.href` passa pela interceptação do shouldOverrideUrlLoading
 * do MainActivity. Para abrir o WhatsApp de forma CONFIÁVEL no app, chamamos a
 * ponte nativa `MovieFlixApp.abrirWhatsApp(url)`, que valida a URL (só o
 * WhatsApp oficial) e dispara o intent ACTION_VIEW diretamente.
 *
 * Retorna true se o app nativo assumiu a abertura; false se não estiver no app
 * (navegador) ou se a ponte não existir — nesse caso o chamador usa o fallback
 * do navegador (window.open / location.href).
 */
export async function abrirWhatsAppNoApp(url: string): Promise<boolean> {
  try {
    const w = window as any;
    const cap = w.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const plugin = cap.Plugins?.MovieFlixApp;
      if (plugin?.abrirWhatsApp) {
        await plugin.abrirWhatsApp({ url });
        return true;
      }
    }
  } catch {
    // Ponte falhou (ex.: URL rejeitada) — cai para o fallback do navegador.
  }
  return false;
}

/** Adiciona a classe `is-native-app` no <html> quando dentro do app. */
export async function aplicarClasseApp() {
  try {
    const isApp = await rodandoNoApp();
    if (isApp) {
      document.documentElement.classList.add('is-native-app');
      document.documentElement.classList.add('tv-nav');
    }
  } catch {
    // ignora
  }
}

/**
 * Abre uma URL no NAVEGADOR EXTERNO do celular (fora do WebView), via a ponte
 * nativa `MovieFlixApp.abrirNoNavegador(url)`.
 *
 * Motivo: dentro do WebView do app, `window.open` é bloqueado por
 * `setSupportMultipleWindows(false)` e a navegação via `location.href` passa
 * pela interceptação do shouldOverrideUrlLoading. Para abrir a página de
 * assinatura do site no navegador externo (onde o WhatsApp funciona
 * normalmente), chamamos a ponte nativa, que dispara o intent ACTION_VIEW
 * diretamente — o navegador do celular abre a URL FORA do WebView.
 *
 * Retorna true se o app nativo assumiu a abertura; false se não estiver no
 * app (navegador) ou se a ponte não existir — nesse caso o chamador usa o
 * fallback do navegador (window.open / location.href).
 */
export async function abrirNoNavegador(url: string): Promise<boolean> {
  try {
    const w = window as any;
    const cap = w.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const plugin = cap.Plugins?.MovieFlixApp;
      if (plugin?.abrirNoNavegador) {
        await plugin.abrirNoNavegador({ url });
        return true;
      }
    }
  } catch {
    // Ponte falhou — cai para o fallback do navegador.
  }
  return false;
}
