import type { CapacitorConfig } from '@capacitor/cli';

/**
 * MovieFlix TV — Capacitor configuration (Android TV / Google TV / TV Box).
 *
 * O app é um shell nativo (Capacitor/Android) que SEMPRE carrega a interface
 * TV do site MovieFlix (https://movieflix-bszf.onrender.com/#/tv).
 *
 * - `server.url` aponta para o site online + rota /tv: qualquer mudança no
 *   site (filmes, séries, categorias, player, textos, configurações)
 *   aparece AUTOMATICAMENTE no app, SEM precisar gerar/instalar um novo APK.
 * - `server.cleartext` = false: só HTTPS.
 * - NÃO usamos `webDir` (sem assets locais): o app é 100% remoto.
 * - `android.captureInput` = true: teclas físicas/DPAD (setas, OK, Voltar)
 *   chegam como eventos de teclado na página (usados pelo useTvNavigation).
 * - `android.allowMixedContent` = false: o player usa HTTPS.
 */
const config: CapacitorConfig = {
  appId: 'com.movieflix.tv',
  appName: 'MovieFlix TV',
  backgroundColor: '#0a0a0f',

  // Placeholder local (nunca exibido): o app carrega o site remoto abaixo.
  webDir: 'www',

  // WebView remoto — o app NUNCA embute uma cópia antiga do site.
  server: {
    url: 'https://movieflix-bszf.onrender.com/#/tv',
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
    backgroundColor: '#0a0a0f',
    // physical keyboard support (remote arrows/enter arrive as key events)
    captureInput: true,
  },

  // Splash escuro curto (senso de app nativo na TV).
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
