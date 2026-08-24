import type { CapacitorConfig } from '@capacitor/cli';

/**
 * MovieFlix — Capacitor configuration.
 *
 * The app loads the project's OWN compiled frontend (webDir: "dist") inside
 * the native shell. It NEVER points to a remote URL: `server.androidScheme`
 * is "https" (default) and `android.clearText` stays false, so the WebView
 * serves the bundled assets locally. All API/backend calls continue to use
 * their normal https URLs at runtime.
 */
const config: CapacitorConfig = {
  appId: 'com.movieflix.app',
  appName: 'MovieFlix',
  webDir: 'dist',
  backgroundColor: '#0a0a0f',

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
