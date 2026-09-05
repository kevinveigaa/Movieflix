package com.movieflix.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

import com.getcapacitor.BridgeActivity;

/**
 * MovieFlix — MainActivity
 *
 * Regras de navegação:
 *
 * 1. MovieFlix permanece dentro do WebView.
 * 2. Domínios utilizados pelo player permanecem dentro do WebView.
 * 3. Qualquer outro link HTTP/HTTPS externo é aberto pelo Android.
 * 4. WhatsApp é aberto externamente pelo Android.
 * 5. tel:, mailto:, sms:, intent:// etc. são enviados ao Android.
 * 6. Não existe bloqueio/anti-link para impedir links externos.
 * 7. Não existe WebView fantasma para window.open().
 * 8. Não existe restauração automática após link externo.
 *
 * Mantidos:
 * - Fullscreen de vídeo.
 * - Controle remoto / DPAD.
 * - Deep links movieflix://.
 * - Duplo-back para sair.
 * - Reprodução de mídia.
 */

public class MainActivity extends BridgeActivity {

    public static final String SITE_URL =
            "https://movieflix-bszf.onrender.com";

    public static final String WHATSAPP_NUMBER =
            "5511943750307";

    private WebView webView;
    private boolean primeiraCarga = true;

    // ── Duplo-back ──────────────────────────────────────────────────────────

    private static final long JANELA_DUPLO_BACK_MS = 2000;
    private long ultimoBackPressionado = 0;

    // ── Fullscreen ──────────────────────────────────────────────────────────

    private View customView = null;
    private WebChromeClient.CustomViewCallback customViewCallback = null;

    private int originalSystemUiVisibility = 0;

    private int orientationOriginal =
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    private boolean fullscreenAtivo = false;

    private static final FrameLayout.LayoutParams COVER_SCREEN_PARAMS =
            new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            );

    private static final int FLAGS_IMERSIVOS =
            View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;

    // ────────────────────────────────────────────────────────────────────────
    // CREATE
    // ────────────────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow()
                .getDecorView()
                .setBackgroundColor(
                        Color.rgb(10, 10, 15)
                );

        webView = getBridge().getWebView();

        if (webView != null) {

            WebSettings settings = webView.getSettings();

            // JavaScript
            settings.setJavaScriptEnabled(true);

            // Local storage / Supabase / sessão
            settings.setDomStorageEnabled(true);

            // Permite reprodução automática dos vídeos.
            settings.setMediaPlaybackRequiresUserGesture(false);

            // Segurança de acesso a arquivos.
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                settings.setAllowFileAccessFromFileURLs(false);
                settings.setAllowUniversalAccessFromFileURLs(false);
            }

            /*
             * Sempre tenta carregar a versão atual do site.
             */
            settings.setCacheMode(
                    WebSettings.LOAD_NO_CACHE
            );

            /*
             * Mantido para compatibilidade com players que eventualmente
             * utilizem recursos HTTP dentro de uma página HTTPS.
             */
            settings.setMixedContentMode(
                    WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            );

            // Controle remoto / TV.
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            webView.requestFocus();

            // ── WebChromeClient ────────────────────────────────────────────

            webView.setWebChromeClient(
                    new WebChromeClient() {

                        @Override
                        public void onGeolocationPermissionsShowPrompt(
                                String origin,
                                GeolocationPermissions.Callback callback
                        ) {
                            // Geolocalização não é necessária.
                            callback.invoke(
                                    origin,
                                    false,
                                    false
                            );
                        }

                        // Fullscreen do vídeo.
                        @Override
                        public void onShowCustomView(
                                View view,
                                CustomViewCallback callback
                        ) {
                            entrarFullscreen(
                                    view,
                                    callback
                            );
                        }

                        @Override
                        public void onShowCustomView(
                                View view,
                                int requestedOrientation,
                                CustomViewCallback callback
                        ) {
                            entrarFullscreen(
                                    view,
                                    callback
                            );
                        }

                        @Override
                        public void onHideCustomView() {
                            removerCustomView(false);
                        }

                        /*
                         * window.open / target="_blank"
                         *
                         * Não criamos WebView fantasma.
                         *
                         * O destino é tratado como link externo pelo Android.
                         */
                        @Override
                        public boolean onCreateWindow(
                                WebView view,
                                boolean isDialog,
                                boolean isUserGesture,
                                android.os.Message resultMsg
                        ) {

                            WebView.WebViewTransport transport =
                                    (WebView.WebViewTransport)
                                            resultMsg.obj;

                            WebView novaWebView =
                                    new WebView(
                                            MainActivity.this
                                    );

                            WebSettings novaSettings =
                                    novaWebView.getSettings();

                            novaSettings.setJavaScriptEnabled(true);
                            novaSettings.setDomStorageEnabled(true);

                            novaWebView.setWebViewClient(
                                    new WebViewClient() {

                                        @Override
                                        public boolean shouldOverrideUrlLoading(
                                                WebView v,
                                                WebResourceRequest request
                                        ) {

                                            Uri uri =
                                                    request.getUrl();

                                            if (uri != null) {
                                                tratarLinkExterno(uri);
                                            }

                                            return true;
                                        }

                                        @Override
                                        @SuppressWarnings("deprecation")
                                        public boolean shouldOverrideUrlLoading(
                                                WebView v,
                                                String url
                                        ) {

                                            if (url != null) {
                                                tratarLinkExterno(
                                                        Uri.parse(url)
                                                );
                                            }

                                            return true;
                                        }
                                    }
                            );

                            transport.setWebView(
                                    novaWebView
                            );

                            resultMsg.sendToTarget();

                            return true;
                        }
                    }
            );

            // ── WebViewClient ──────────────────────────────────────────────

            webView.setWebViewClient(
                    new WebViewClient() {

                        @Override
                        public boolean shouldOverrideUrlLoading(
                                WebView view,
                                WebResourceRequest request
                        ) {

                            return tratarNavegacao(
                                    view,
                                    request.getUrl(),
                                    request.isForMainFrame()
                            );
                        }

                        @Override
                        @SuppressWarnings("deprecation")
                        public boolean shouldOverrideUrlLoading(
                                WebView view,
                                String url
                        ) {

                            if (url == null) {
                                return true;
                            }

                            return tratarNavegacao(
                                    view,
                                    Uri.parse(url),
                                    true
                            );
                        }

                        @Override
                        public void onPageFinished(
                                WebView view,
                                String url
                        ) {

                            super.onPageFinished(
                                    view,
                                    url
                            );

                            if (primeiraCarga) {

                                primeiraCarga = false;

                                view.setBackgroundColor(
                                        Color.rgb(10, 10, 15)
                                );

                                FrameLayout root =
                                        findViewById(
                                                android.R.id.content
                                        );

                                if (root != null) {

                                    for (
                                            int i = 0;
                                            i < root.getChildCount();
                                            i++
                                    ) {

                                        View child =
                                                root.getChildAt(i);

                                        if (child instanceof ProgressBar) {

                                            child.setVisibility(
                                                    View.GONE
                                            );
                                        }
                                    }
                                }
                            }

                            view.requestFocus();
                        }

                        @Override
                        public void onPageCommitVisible(
                                WebView view,
                                String url
                        ) {

                            super.onPageCommitVisible(
                                    view,
                                    url
                            );

                            view.requestFocus();
                        }
                    }
            );

            /*
             * Não inicia downloads automaticamente.
             *
             * Isso é independente do sistema de links externos.
             */
            webView.setDownloadListener(
                    (
                            url,
                            userAgent,
                            contentDisposition,
                            mimetype,
                            contentLength
                    ) -> {
                        // Sem download automático.
                    }
            );
        }

        // Processa deep link recebido ao abrir o app.
        tratarDeepLink(
                getIntent()
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // DEEP LINK
    // ────────────────────────────────────────────────────────────────────────

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);

        setIntent(intent);

        tratarDeepLink(intent);
    }

    private void tratarDeepLink(Intent intent) {

        if (intent == null) {
            return;
        }

        Uri uri = intent.getData();

        if (uri == null) {
            return;
        }

        tratarDeepLinkUri(uri);
    }

    private void tratarDeepLinkUri(Uri uri) {

        if (uri == null) {
            return;
        }

        String scheme = uri.getScheme();

        if (scheme == null
                || !scheme.equalsIgnoreCase("movieflix")) {
            return;
        }

        String host = uri.getHost();

        String path = uri.getPath();

        String id = null;

        if (path != null) {
            id = path.replace("/", "");
        }

        if (id == null || id.isEmpty()) {

            if (webView != null) {
                webView.loadUrl(SITE_URL);
            }

            return;
        }

        String rota;

        if ("titulo".equalsIgnoreCase(host)) {

            rota =
                    SITE_URL
                            + "/#/titulo/movie/"
                            + id;

        } else {

            String season =
                    uri.getQueryParameter(
                            "season"
                    );

            /*
             * Aceita os dois formatos:
             *
             * ?ep=1
             * ?episode=1
             */
            String ep =
                    uri.getQueryParameter(
                            "ep"
                    );

            if (ep == null) {

                ep =
                        uri.getQueryParameter(
                                "episode"
                        );
            }

            if (season != null && ep != null) {

                rota =
                        SITE_URL
                                + "/#/assistir/"
                                + id
                                + "?season="
                                + Uri.encode(season)
                                + "&ep="
                                + Uri.encode(ep);

            } else {

                rota =
                        SITE_URL
                                + "/#/assistir/"
                                + id;
            }
        }

        final String destino = rota;

        if (webView != null) {

            webView.post(
                    () -> webView.loadUrl(destino)
            );
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // NAVEGAÇÃO
    // ────────────────────────────────────────────────────────────────────────

    /**
     * MovieFlix/player:
     *     permanece dentro do WebView.
     *
     * Qualquer outro HTTP/HTTPS:
     *     abre externamente pelo Android.
     *
     * Outros esquemas:
     *     abre externamente pelo Android.
     *
     * Não existe bloqueio de domínio.
     * Não existe anti-link.
     */
    private boolean tratarNavegacao(
            WebView view,
            Uri uri,
            boolean isMainFrame
    ) {

        if (uri == null) {
            return true;
        }

        String scheme =
                uri.getScheme() == null
                        ? ""
                        : uri.getScheme().toLowerCase();

        // Deep link do próprio app.
        if (scheme.equals("movieflix")) {

            tratarDeepLinkUri(uri);

            return true;
        }

        /*
         * Subframes / iframes:
         *
         * Não interferimos no player nem em recursos carregados
         * dentro dele.
         */
        if (!isMainFrame) {
            return false;
        }

        /*
         * MovieFlix fica dentro do aplicativo.
         */
        if (ehDominioMovieFlix(uri)) {
            return false;
        }

        /*
         * Domínios conhecidos do player ficam dentro do WebView.
         */
        if (ehDominioPlayer(uri)) {
            return false;
        }

        /*
         * Qualquer HTTP/HTTPS que não seja MovieFlix/player é externo.
         *
         * Não bloqueia.
         * Não restaura.
         * Não redireciona para MovieFlix.
         */
        if (scheme.equals("http")
                || scheme.equals("https")) {

            abrirLinkExterno(uri);

            return true;
        }

        /*
         * WhatsApp, telefone, e-mail, SMS, intent:// etc.
         */
        abrirLinkExterno(uri);

        return true;
    }

    /**
     * Verifica somente o domínio EXATO do MovieFlix.
     */
    private boolean ehDominioMovieFlix(Uri uri) {

        if (uri == null) {
            return false;
        }

        String host = uri.getHost();

        if (host == null) {
            return false;
        }

        return host.equalsIgnoreCase(
                "movieflix-bszf.onrender.com"
        );
    }

    /**
     * Domínios necessários ao funcionamento dos players.
     *
     * Isso NÃO é uma proteção contra links externos.
     *
     * Apenas mantém recursos conhecidos de player dentro do WebView.
     */
    private boolean ehDominioPlayer(Uri uri) {

        if (uri == null) {
            return false;
        }

        String host = uri.getHost();

        if (host == null) {
            return false;
        }

        String h = host.toLowerCase();

        return h.equals("streambetter.shop")
                || h.endsWith(".streambetter.shop")
                || h.equals("playerflixapi.com")
                || h.endsWith(".playerflixapi.com")
                || h.equals("megaembedapi.site")
                || h.endsWith(".megaembedapi.site")
                || h.equals("embedplayapi.site")
                || h.endsWith(".embedplayapi.site")
                || h.equals("watchplayer.shop")
                || h.endsWith(".watchplayer.shop")
                || h.equals("embedplayer2.xyz")
                || h.endsWith(".embedplayer2.xyz")
                || h.equals("embed.warezcdn.link")
                || h.endsWith(".embed.warezcdn.link")
                || h.equals("superflixapi.life")
                || h.endsWith(".superflixapi.life")
                || h.equals("youtube.com")
                || h.endsWith(".youtube.com")
                || h.equals("youtu.be")
                || h.equals("youtube-nocookie.com")
                || h.endsWith(".youtube-nocookie.com")
                || h.equals("google.com")
                || h.endsWith(".google.com")
                || h.equals("googleapis.com")
                || h.endsWith(".googleapis.com")
                || h.equals("gstatic.com")
                || h.endsWith(".gstatic.com")
                || h.equals("drive.google.com")
                || h.equals("googlevideo.com")
                || h.endsWith(".googlevideo.com")
                || h.equals("ggpht.com")
                || h.endsWith(".ggpht.com");
    }

    /**
     * Abre links externos usando o Android.
     *
     * Exemplos:
     * - https://wa.me/...
     * - whatsapp://...
     * - tel:...
     * - mailto:...
     * - sms:...
     * - intent://...
     */
    private void abrirLinkExterno(Uri uri) {

        if (uri == null) {
            return;
        }

        try {

            Intent intent =
                    new Intent(
                            Intent.ACTION_VIEW,
                            uri
                    );

            intent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
            );

            startActivity(intent);

        } catch (Exception ignored) {

            /*
             * Não derruba o aplicativo caso não exista
             * um aplicativo compatível com o link.
             */
        }
    }

    /**
     * Alias utilizado pelo tratamento de window.open().
     */
    private void tratarLinkExterno(Uri uri) {

        if (uri == null) {
            return;
        }

        /*
         * movieflix:// deve ser tratado pelo próprio aplicativo.
         */
        String scheme =
                uri.getScheme() == null
                        ? ""
                        : uri.getScheme().toLowerCase();

        if (scheme.equals("movieflix")) {

            tratarDeepLinkUri(uri);

            return;
        }

        /*
         * Qualquer outro destino é aberto pelo Android.
         */
        abrirLinkExterno(uri);
    }

    // ────────────────────────────────────────────────────────────────────────
    // COMPATIBILIDADE WHATSAPP
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Mantido para compatibilidade com outras classes/plugins do projeto.
     */
    public static boolean ehWhatsAppOficial(Uri uri) {

        if (uri == null) {
            return false;
        }

        String scheme =
                uri.getScheme() == null
                        ? ""
                        : uri.getScheme().toLowerCase();

        // whatsapp://
        if (scheme.equals("whatsapp")) {

            String phone =
                    uri.getQueryParameter(
                            "phone"
                    );

            /*
             * Se não houver telefone, ainda é um esquema WhatsApp.
             */
            if (phone == null) {
                return true;
            }

            String limpo =
                    phone.replaceAll(
                            "\\D",
                            ""
                    );

            return limpo.equals(
                    WHATSAPP_NUMBER
            );
        }

        // HTTP/HTTPS.
        if (!scheme.equals("http")
                && !scheme.equals("https")) {

            return false;
        }

        String host = uri.getHost();

        if (host == null) {
            return false;
        }

        String h = host.toLowerCase();

        // wa.me/5511943750307
        if (h.equals("wa.me")) {

            String path =
                    uri.getPath() == null
                            ? ""
                            : uri.getPath()
                            .replace("/", "")
                            .replace("+", "");

            return path.equals(
                    WHATSAPP_NUMBER
            );
        }

        // api.whatsapp.com/send?phone=...
        if (h.equals("api.whatsapp.com")) {

            String phone =
                    uri.getQueryParameter(
                            "phone"
                    );

            if (phone == null) {
                return false;
            }

            String limpo =
                    phone.replaceAll(
                            "\\D",
                            ""
                    );

            return limpo.equals(
                    WHATSAPP_NUMBER
            );
        }

        // WhatsApp Web.
        return h.equals(
                "web.whatsapp.com"
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // FULLSCREEN
    // ────────────────────────────────────────────────────────────────────────

    private FrameLayout contentFrame() {

        View root =
                findViewById(
                        android.R.id.content
                );

        if (root instanceof FrameLayout) {

            return (FrameLayout) root;
        }

        return null;
    }

    private void entrarFullscreen(
            View view,
            WebChromeClient.CustomViewCallback callback
    ) {

        if (customView != null) {

            if (callback != null) {
                callback.onCustomViewHidden();
            }

            return;
        }

        customView = view;
        customViewCallback = callback;

        FrameLayout decor =
                (FrameLayout)
                        getWindow()
                                .getDecorView();

        FrameLayout content =
                contentFrame();

        originalSystemUiVisibility =
                decor.getSystemUiVisibility();

        orientationOriginal =
                getRequestedOrientation();

        FrameLayout container =
                content != null
                        ? content
                        : decor;

        container.addView(
                view,
                COVER_SCREEN_PARAMS
        );

        fullscreenAtivo = true;

        aplicarImersao();

        setRequestedOrientation(
                ActivityInfo
                        .SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        );
    }

    private void removerCustomView(
            boolean notificarWebView
    ) {

        if (customView == null) {
            return;
        }

        View view = customView;

        WebChromeClient.CustomViewCallback cb =
                customViewCallback;

        customView = null;
        customViewCallback = null;

        fullscreenAtivo = false;

        FrameLayout decor =
                (FrameLayout)
                        getWindow()
                                .getDecorView();

        FrameLayout content =
                contentFrame();

        FrameLayout container =
                content != null
                        ? content
                        : decor;

        container.removeView(view);

        decor.setSystemUiVisibility(
                originalSystemUiVisibility
        );

        restaurarFlagsJanela();

        if (orientationOriginal
                != ActivityInfo
                .SCREEN_ORIENTATION_UNSPECIFIED) {

            setRequestedOrientation(
                    orientationOriginal
            );
        }

        if (webView != null) {
            webView.requestFocus();
        }

        if (notificarWebView && cb != null) {
            cb.onCustomViewHidden();
        }
    }

    private void aplicarImersao() {

        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        FrameLayout decor =
                (FrameLayout)
                        getWindow()
                                .getDecorView();

        decor.setSystemUiVisibility(
                FLAGS_IMERSIVOS
        );
    }

    private void restaurarFlagsJanela() {

        getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
    }

    @Override
    public void onConfigurationChanged(
            Configuration newConfig
    ) {

        super.onConfigurationChanged(
                newConfig
        );

        if (fullscreenAtivo) {
            aplicarImersao();
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // BACK
    // ────────────────────────────────────────────────────────────────────────

    @Override
    public void onBackPressed() {

        // Fullscreen: primeiro sai do fullscreen.
        if (customView != null) {

            removerCustomView(true);

            return;
        }

        if (webView == null) {

            super.onBackPressed();

            return;
        }

        /*
         * Se houver histórico do WebView, volta normalmente.
         */
        if (webView.canGoBack()) {

            webView.goBack();

            webView.requestFocus();

            return;
        }

        /*
         * Sem histórico:
         * duas pulsações para sair.
         */
        long agora =
                System.currentTimeMillis();

        if (agora - ultimoBackPressionado
                < JANELA_DUPLO_BACK_MS) {

            ultimoBackPressionado = 0;

            super.onBackPressed();

            return;
        }

        ultimoBackPressionado = agora;

        /*
         * Usa o aviso do site quando disponível.
         */
        webView.evaluateJavascript(
                "window.__mfMostrarAviso ? "
                        + "(window.__mfMostrarAviso(), true) "
                        + ": false;",
                value -> {

                    if ("false".equals(value)
                            || value == null) {

                        android.widget.Toast.makeText(
                                this,
                                "Pressione voltar novamente para sair",
                                android.widget.Toast.LENGTH_SHORT
                        ).show();
                    }
                }
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // CONTROLE REMOTO
    // ────────────────────────────────────────────────────────────────────────

    @Override
    public boolean dispatchKeyEvent(
            KeyEvent event
    ) {

        try {

            android.util.Log.d(
                    "MOVIEFLIX_KEY",
                    "KEY: "
                            + event.getKeyCode()
                            + " action="
                            + event.getAction()
            );

        } catch (Exception ignored) {
        }

        /*
         * Não bloqueia DPAD/OK/BACK.
         * O WebView/site continua recebendo as teclas normalmente.
         */
        if (webView != null
                && webView.isFocused()) {

            if (event.getAction()
                    == KeyEvent.ACTION_DOWN) {

                switch (event.getKeyCode()) {

                    case KeyEvent.KEYCODE_DPAD_UP:
                    case KeyEvent.KEYCODE_DPAD_DOWN:
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_ENTER:
                    case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    case KeyEvent.KEYCODE_BACK:

                        return false;

                    default:
                        break;
                }
            }
        }

        return super.dispatchKeyEvent(event);
    }
}
