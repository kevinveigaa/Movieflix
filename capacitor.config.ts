import type { CapacitorConfig } from '@capacitor/cli';

/**
 * MovieFlix — Capacitor configuration (APP = WebView do site online).
 *
 * O app é um shell nativo (Capacitor/Android) que SEMPRE carrega a versão
 * atual do site MovieFlix hospedada em https://movieflix-bszf.onrender.com.
 *
 * - `server.url` aponta para o site online: qualquer mudança no site
 *   (layout, filmes, categorias, player, textos, configurações, features)
 *   aparece AUTOMATICAMENTE no app, SEM precisar gerar/instalar um novo APK.
 * - `server.cleartext` = false: só HTTPS.
 * - NÃO usamos `webDir` (sem assets locais): o app é 100% remoto.
 * - `android.captureInput` = true: teclas físicas/DPAD (setas, OK, Voltar)
 *   chegam como eventos de teclado na página (usados pelo useTvNavigation).
 */
const config: CapacitorConfig = {
  appId: 'com.movieflix.app',
  appName: 'MovieFlix',
  backgroundColor: '#0a0a0f',

  // WebView remoto — o app NUNCA embute uma cópia antiga do site.
  server: {
    url: 'https://movieflix-bszf.onrender.com',
    cleartext: false,
  },

  android: {
    // TV Box / Android TV: allow fullscreen immersive playback and keep the
    // WebView focused so DPAD keys reach the page's navigation hook.
    allowMixedContent: false,
    backgroundColor: '#0a0a0f',
    // physical keyboard support (remote arrows/enter arrive as key events)
    captureInput: true,
  },

  ios: {
    backgroundColor: '#0a0a0f',
    contentInset: 'never',
    // Permite que o botão de "tela cheia" do <video> funcione no WKWebView
    // (sem isso, o fullscreen nativo do player não abre no iOS).
    allowsInlineMediaPlayback: true,
  },

  // Keep the WebView alive across background/foreground so "continue
  // watching" timers and playback position survive.
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
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
