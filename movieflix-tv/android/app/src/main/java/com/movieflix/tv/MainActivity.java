package com.movieflix.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.util.Locale;

/**
 * MovieFlix TV 4.0.1 — MainActivity.
 *
 * ═══ POR QUE ESTE APP É DIFERENTE DO APP NATIVO ANTERIOR ═══
 * O app TV anterior reimplementou uma UI genérica de Android TV e por isso NÃO
 * se parecia com o MovieFlix. Este app é a ADAPTAÇÃO PARA TV DO MESMO
 * MOVIEFLIX: um shell nativo (WebView) que carrega o site oficial e ativa a
 * interface de TV que JÁ EXISTE no próprio site (src/tv/*, rota #/tv).
 *
 * Consequência: identidade visual, logo, cores, cards, banners, catálogo,
 * autenticação, planos, favoritos, histórico, "continuar assistindo" e player
 * são EXATAMENTE os do MovieFlix existente — uma única fonte de verdade.
 *
 * ═══ RESPONSABILIDADES NATIVAS ═══
 *  1. Carregar o site com `?tvapp=1` (força o modo TV) + window.__MF_TV_APP__,
 *     para que a detecção de TV do site seja 100% confiável em qualquer box.
 *  2. DPAD/controle remoto: o WebView fica sempre focado, então setas/OK/
 *     Voltar chegam ao site (useTvNavigation) — foco visível sempre.
 *  3. Voltar previsível: com histórico → volta uma tela; na raiz → duplo-back
 *     para sair (nunca sai com um toque acidental).
 *  4. Fullscreen de vídeo (onShowCustomView) para o player ocupar a tela toda.
 *  5. WhatsApp oficial via intent (wa.me) — o WebView não bloqueia.
 *  6. Deep link movieflix:// → abre o site já no conteúdo escolhido.
 *  7. Navegação externa/de anúncio é bloqueada silenciosamente.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout root;
    private WebChromeClient chromeClient;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    private long ultimoBack = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(COR_FUNDO);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        configurarWebView();

        // Deep link recebido ao abrir (cold start).
        String inicial = DeepLink.paraUrlSite(getIntent() != null ? getIntent().getDataString() : null, SITE_URL_BASE);
        webView.loadUrl(inicial != null ? inicial : SITE_URL);
    }

    // ── Configuração do WebView ────────────────────────────────────────────

    @SuppressWarnings({"SetJavaScriptEnabled", "deprecation"})
    private void configurarWebView() {
        webView.setBackgroundColor(COR_FUNDO);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadsImagesAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setUserAgentString(s.getUserAgentString() + " " + APP_UA);
        // minSdk 21 (LOLLIPOP): mixed content é configurável desde a API 21.
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Ponte nativa (mesmos nomes usados pelo MovieFlix Mobile).
        TvBridge bridge = new TvBridge(this);
        webView.addJavascriptInterface(bridge, "MovieFlixAndroid");
        webView.addJavascriptInterface(bridge, "MovieFlixTV");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injetarModoTv(view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injetarModoTv(view);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return tratarNavegacao(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri;
                try { uri = Uri.parse(url); } catch (Exception e) { return false; }
                return tratarNavegacao(uri);
            }
        });

        chromeClient = new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                if (view != null) {
                    view.setBackgroundColor(Color.BLACK);
                    root.addView(view, new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                }
                webView.setVisibility(View.GONE);
                esconderBarras();
            }

            @Override
            public void onHideCustomView() {
                if (customView != null) root.removeView(customView);
                customView = null;
                if (customViewCallback != null) customViewCallback.onCustomViewHidden();
                customViewCallback = null;
                webView.setVisibility(View.VISIBLE);
                webView.requestFocus();
                mostrarBarras();
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) { return true; }
        };
        webView.setWebChromeClient(chromeClient);

        // Downloads (anúncios) nunca abrem: bloqueados silenciosamente.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> { /* bloqueia */ });
    }

    /**
     * Injeta a flag de modo TV no contexto JS. É a MESMA flag que o site já lê
     * em src/lib/tv.ts (window.__MF_TV_APP__) — por isso a detecção de TV é
     * garantida, mesmo em TV Box com user-agent genérico.
     */
    private void injetarModoTv(WebView view) {
        String js = "(function(){try{"
                + "window.__MF_TV_APP__=true;"
                + "document.documentElement.classList.add('is-native-app');"
                + "document.documentElement.classList.add('tv-nav');"
                + "}catch(e){}})();";
        view.evaluateJavascript(js, null);
    }

    /**
     * Decide o que fazer com uma navegação do WebView.
     *  - Site oficial  → permite (navegação interna normal).
     *  - WhatsApp      → abre no app externo (intent).
     *  - Outros hosts  → bloqueia (nunca leva o usuário para página de terceiro).
     */
    private boolean tratarNavegacao(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";

        if (ehWhatsAppOficial(uri)) {
            abrirExterno(uri);
            return true;
        }

        if ("http".equals(scheme) || "https".equals(scheme)) {
            // Mantém o usuário no MovieFlix; qualquer outro host é bloqueado.
            return !host.equals(HOST_SITE) && !host.endsWith("." + HOST_SITE);
        }

        // Qualquer outro scheme (intent://, market://, etc.): bloqueia.
        return true;
    }

    /** Abre uma URI em um app externo (WhatsApp), com fallback amigável. */
    public void abrirExterno(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            try {
                Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse(WHATSAPP_WEB_URL));
                web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(web);
            } catch (Exception e2) {
                Toast.makeText(this, "Não foi possível abrir o WhatsApp", Toast.LENGTH_SHORT).show();
            }
        }
    }

    /** Fecha o app (usado pelo duplo-back do site e pelo BACK nativo). */
    public void fecharApp() {
        // minSdk 21: finishAndRemoveTask existe desde a API 21.
        finishAndRemoveTask();
    }

    // ── Deep link em execução (singleTask) ─────────────────────────────────

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String destino = DeepLink.paraUrlSite(intent != null ? intent.getDataString() : null, SITE_URL_BASE);
        if (destino != null) webView.loadUrl(destino);
    }

    // ── Controle remoto (D-pad) ────────────────────────────────────────────

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Garante que o WebView permaneça focado para o site receber as teclas.
        if (customView == null && !webView.hasFocus()) webView.requestFocus();
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (customView != null) {
                // Sai do fullscreen do player antes de tudo.
                if (chromeClient != null) chromeClient.onHideCustomView();
                return true;
            }
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            long agora = System.currentTimeMillis();
            if (agora - ultimoBack <= JANELA_DUPLO_BACK_MS) {
                fecharApp();
            } else {
                ultimoBack = agora;
                Toast.makeText(this, "Pressione voltar de novo para sair", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY
                || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
            // Repassa ao WebView (o player do site trata).
            return webView.dispatchKeyEvent(event);
        }
        return super.onKeyDown(keyCode, event);
    }

    // ── Barras do sistema / foco ───────────────────────────────────────────

    @SuppressWarnings("deprecation")
    private void esconderBarras() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @SuppressWarnings("deprecation")
    private void mostrarBarras() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && customView != null) esconderBarras();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.requestFocus();
    }

    @Override
    protected void onDestroy() {
        try {
            root.removeView(webView);
            webView.destroy();
        } catch (Exception ignored) { }
        super.onDestroy();
    }

    // ── Constantes ─────────────────────────────────────────────────────────

    /** Base do site oficial — a MESMA fonte de verdade do MovieFlix. */
    public static final String SITE_URL_BASE = "https://movieflix-bszf.onrender.com";

    /**
     * URL inicial: a interface de TV do próprio site, já em modo TV
     * (?tvapp=1 → src/lib/tv.ts) com a versão do app para telemetria.
     */
    public static final String SITE_URL = SITE_URL_BASE + "/#/tv?tvapp=1&tvv=4.0.1";

    public static final String HOST_SITE = "movieflix-bszf.onrender.com";
    public static final String APP_UA = "MovieFlixTV/4.0.1";

    /** Número OFICIAL de WhatsApp do MovieFlix. */
    public static final String WHATSAPP_NUMERO = "5511943750307";
    public static final String WHATSAPP_WEB_URL = "https://wa.me/" + WHATSAPP_NUMERO;

    private static final long JANELA_DUPLO_BACK_MS = 2000L;
    private static final int COR_FUNDO = Color.parseColor("#0a0a0f");

    /** Só aceita o WhatsApp OFICIAL do MovieFlix (wa.me / whatsapp.com / whatsapp:). */
    public static boolean ehWhatsAppOficial(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        if ("whatsapp".equals(scheme)) return true;
        String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
        String[] hosts = { "wa.me", "api.whatsapp.com", "whatsapp.com", "www.whatsapp.com" };
        for (String h : hosts) {
            if (h.equals(host)) {
                // wa.me/5511943750307 — confere o número quando presente.
                String caminho = uri.getPath() != null ? uri.getPath() : "";
                if ("wa.me".equals(h) && !caminho.isEmpty() && !caminho.contains(WHATSAPP_NUMERO)) {
                    continue;
                }
                return true;
            }
        }
        return false;
    }
}
