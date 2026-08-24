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
