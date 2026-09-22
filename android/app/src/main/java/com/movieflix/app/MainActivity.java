package com.movieflix.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.content.pm.ActivityInfo;

import org.json.JSONObject;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import java.io.File;
import java.net.URI;
import java.net.URISyntaxException;

/**
 * MovieFlix v3.4.0 — App WebView profissional.
 *
 * Carrega o site oficial https://movieflix-bszf.onrender.com dentro de um WebView
 * configurado para que TODAS as funções do site funcionem: login/sessão,
 * player de vídeo, tela cheia, áudio, downloads, links externos e, o mais
 * importante, o WhatsApp (abre nativamente com número e mensagem pré-preenchida).
 *
 * NÃO altera o site — apenas o exibe exatamente como ele é.
 */
public class MainActivity extends AppCompatActivity {

    /** URL oficial do site (fonte única). */
    private static final String SITE_URL = "https://movieflix-bszf.onrender.com";
    /** Número oficial do WhatsApp (formato internacional, sem +). */
    private static final String WHATSAPP_NUMBER = "5511943750307";

    private WebView webView;
    private FrameLayout fullscreenContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ValueCallback<Uri[]> filePathCallback;
    private LinearLayout loadingLayout;
    private LinearLayout errorLayout;
    private TextView errorText;
    private View retryView;
    private boolean pageLoaded = false;

    private boolean isTvMode() {
        return BuildConfig.TV_MODE;
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        if (isTvMode()) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        webView = findViewById(R.id.webview);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        fullscreenContainer = findViewById(R.id.fullscreen_container);
        loadingLayout = findViewById(R.id.loading_layout);
        errorLayout = findViewById(R.id.error_layout);
        retryView = findViewById(R.id.btn_retry);
        ProgressBar progressBar = findViewById(R.id.progress_bar);

        // ===== Configuração do WebView =====
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString()
                .replace("; wv", "")
                .replace("Version/4.0", ""));

        // Cookies (sessão/login persistente)
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        // ===== WebViewClient: intercepta links (WhatsApp / externo / interno) =====
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (!pageLoaded) {
                    loadingLayout.setVisibility(View.VISIBLE);
                    errorLayout.setVisibility(View.GONE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;
                loadingLayout.setVisibility(View.GONE);
                errorLayout.setVisibility(View.GONE);
                if (isTvMode()) {
                    aplicarExperienciaTv();
                    webView.requestFocus(View.FOCUS_DOWN);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    pageLoaded = false;
                    loadingLayout.setVisibility(View.GONE);
                    errorLayout.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request.isForMainFrame()) {
                    pageLoaded = false;
                    loadingLayout.setVisibility(View.GONE);
                    errorLayout.setVisibility(View.VISIBLE);
                }
            }
        });

        // ===== WebChromeClient: fullscreen + popups + permissões + upload =====
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                fullscreenContainer.setVisibility(View.VISIBLE);
                fullscreenContainer.addView(customView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                fullscreenContainer.removeView(customView);
                customView = null;
                customViewCallback = null;
                webView.setVisibility(View.VISIBLE);
                fullscreenContainer.setVisibility(View.GONE);
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                WebView newWebView = new WebView(MainActivity.this);
                newWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        return handleUrl(url);
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newWebView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                } else {
                    progressBar.setVisibility(View.VISIBLE);
                }
            }

            // Upload de arquivos (se o site precisar)
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, 1);
                } catch (ActivityNotFoundException e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // ===== Downloads =====
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                // Se for o APK do MovieFlix, abre no navegador externo (instalação)
                if (url.contains("movieflix") && url.endsWith(".apk")) {
                    startExternal(url);
                    return;
                }
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setMimeType(mimetype);
                    String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    request.addRequestHeader("User-Agent", userAgent);
                    request.setDescription("Baixando " + filename);
                    request.setTitle(filename);
                    request.allowScanningByMediaScanner();
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    dm.enqueue(request);
                    Toast.makeText(MainActivity.this, "Download iniciado: " + filename, Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                }
            }
        });

        // ===== Ponte nativa para o site (MovieFlixApp) =====
        webView.addJavascriptInterface(new MovieFlixBridge(), "MovieFlixApp");

        // ===== Botão Tentar novamente =====
        retryView.setOnClickListener(v -> {
            errorLayout.setVisibility(View.GONE);
            loadingLayout.setVisibility(View.VISIBLE);
            webView.loadUrl(SITE_URL);
        });

        // ===== Carrega o site =====
        if (savedInstanceState == null) {
            webView.loadUrl(SITE_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    /**
     * Encaminha o D-pad para a mesma camada de navegação do site.
     * No modo TV o evento original é consumido para evitar dupla execução;
     * a página recebe um KeyboardEvent compatível com o hook existente.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (isTvMode() && event.getAction() == KeyEvent.ACTION_DOWN
                && deveEncaminharParaTv(event.getKeyCode()) && webView != null) {
            String key = chaveTv(event.getKeyCode());
            String code = codigoTv(event.getKeyCode());
            int keyCode = event.getKeyCode();
            String js = "(function(){var t=document.activeElement||document.body;"
                    + "var e=new KeyboardEvent('keydown',{key:" + JSONObject.quote(key)
                    + ",code:" + JSONObject.quote(code)
                    + ",keyCode:" + keyCode + ",which:" + keyCode
                    + ",bubbles:true,cancelable:true});"
                    + "t.dispatchEvent(e);document.dispatchEvent(e);window.dispatchEvent(e);})();";
            webView.evaluateJavascript(js, null);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private boolean deveEncaminharParaTv(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_DPAD_UP
                || keyCode == KeyEvent.KEYCODE_DPAD_DOWN
                || keyCode == KeyEvent.KEYCODE_DPAD_LEFT
                || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
                || keyCode == KeyEvent.KEYCODE_DPAD_CENTER
                || keyCode == KeyEvent.KEYCODE_ENTER
                || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
                || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND
                || keyCode == KeyEvent.KEYCODE_MENU;
    }

    private String chaveTv(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP: return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: return "Enter";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "MediaFastForward";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "MediaRewind";
            case KeyEvent.KEYCODE_MENU: return "ContextMenu";
            default: return "Unidentified";
        }
    }

    private String codigoTv(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP: return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: return "Enter";
            default: return "MediaKey";
        }
    }

    /** Mantém a identidade visual e acrescenta foco legível para 720p/1080p/4K. */
    private void aplicarExperienciaTv() {
        if (!isTvMode()) return;
        String css = "body.movieflix-tv{background:#0a0a0f!important;}"
                + "body.movieflix-tv :focus{outline:3px solid #a970ff!important;"
                + "outline-offset:5px!important;box-shadow:0 0 0 5px rgba(169,112,255,.22)!important;}"
                + "body.movieflix-tv button,body.movieflix-tv a,body.movieflix-tv input,"
                + "body.movieflix-tv select,body.movieflix-tv [role=button],body.movieflix-tv [tabindex]{"
                + "scroll-margin:12vh;transition:transform .12s ease,outline .12s ease;}"
                + "body.movieflix-tv :focus{transform:scale(1.025);z-index:5;}";
        String js = "(function(){document.body.classList.add('movieflix-tv');"
                + "var s=document.getElementById('movieflix-tv-style');"
                + "if(!s){s=document.createElement('style');s.id='movieflix-tv-style';"
                + "document.head.appendChild(s);}s.textContent=" + JSONObject.quote(css) + ";})();";
        webView.evaluateJavascript(js, null);
    }

    /** Ponte nativa exposta ao site (MovieFlixApp). */
    private class MovieFlixBridge {
        @JavascriptInterface
        public boolean isApp() {
            return true;
        }

        @JavascriptInterface
        public void abrirWhatsApp(String url) {
            runOnUiThread(() -> handleUrl(url));
        }

        @JavascriptInterface
        public void abrirNoNavegador(String url) {
            runOnUiThread(() -> startExternal(url));
        }
    }

    /**
     * Intercepta TODOS os links e navegações do WebView (camada nativa).
     *
     * Regras (silenciosas — nenhum Toast/Alert/Snackbar):
     *  - WhatsApp (whatsapp://, wa.me, api.whatsapp.com, chat.whatsapp.com,
     *    web.whatsapp.com) → abre nativamente (nunca bloqueado).
     *  - URLs internas do MovieFlix → continuam no WebView.
     *  - Domínios do player/verificação (StreamBetter, Cloudflare, fontes) →
     *    continuam no WebView (nunca abrem navegador externo).
     *  - intent:// e demais schemes customizados → BLOQUEADOS (não abrem outro app).
     *  - Domínios externos legítimos (Instagram, YouTube, Drive) → navegador
     *    externo (ação explícita do usuário, igual ao comportamento atual).
     *  - Qualquer outro HTTP/HTTPS (anúncio/redirecionamento do StreamBetter) →
     *    BLOQUEADO silenciosamente: não abre Chrome, não troca a Activity e o
     *    MovieFlix/player permanece em primeiro plano.
     */

    /** Domínios do player e da verificação — NUNCA abrem navegador externo. */
    private static final String[] DOMINIOS_PLAYER = {
            "streambetter.shop",
            "yapgrid.com",
            "playerflixapi.com",
            "megaembedapi.site",
            "embedplayapi.site",
            "watchplayer.shop",
            "embedplayer2.xyz",
            "embed.warezcdn.link",
            "superflixapi.life",
            "challenges.cloudflare.com",
            "cloudflare.com",
            "turnstile",
    };

    /** Domínios externos legítimos (links do rodapé/trailers) — navegador externo. */
    private static final String[] DOMINIOS_EXTERNOS_LEGITIMOS = {
            "youtube.com",
            "youtu.be",
            "youtube-nocookie.com",
            "drive.google.com",
            "instagram.com",
    };

    /** É um link do WhatsApp (deep link nativo ou domínios oficiais)? */
    private boolean ehUrlWhatsApp(String lower) {
        return lower.startsWith("whatsapp://")
                || lower.startsWith("wa.me")
                || lower.contains("api.whatsapp.com")
                || lower.contains("chat.whatsapp.com")
                || lower.contains("web.whatsapp.com");
    }

    /** É uma URL interna do MovieFlix (deve continuar no WebView)? */
    private boolean ehUrlInterna(String lower) {
        return lower.startsWith(SITE_URL)
                || lower.startsWith("https://movieflix-bszf.onrender.com")
                || lower.startsWith("http://movieflix-bszf.onrender.com")
                || lower.startsWith("/")
                || lower.startsWith("#");
    }

    /** O host da URL pertence à lista informada? */
    private boolean hostEstaNaLista(String url, String[] dominios) {
        String host;
        try {
            host = Uri.parse(url).getHost();
        } catch (Exception e) {
            return false;
        }
        if (host == null) return false;
        String h = host.toLowerCase();
        for (String d : dominios) {
            if (h.equals(d) || h.endsWith("." + d)) return true;
        }
        return false;
    }

    private boolean handleUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase();

        // 1) WhatsApp — abre nativamente (nunca bloqueado).
        if (ehUrlWhatsApp(lower)) {
            abrirWhatsAppNativo(url);
            return true;
        }

        // 2) Interno do MovieFlix → mantém no WebView.
        if (ehUrlInterna(lower)) {
            return false;
        }

        // 3) intent:// e schemes que tentam abrir OUTRO aplicativo → bloqueia.
        if (lower.startsWith("intent:")) {
            return true;
        }

        // 4) Domínios do player/verificação → mantém no WebView (não abre navegador).
        if (hostEstaNaLista(url, DOMINIOS_PLAYER)) {
            return false;
        }

        // 5) Domínios externos legítimos (Instagram/YouTube/Drive) → navegador externo.
        if (hostEstaNaLista(url, DOMINIOS_EXTERNOS_LEGITIMOS)) {
            startExternal(url);
            return true;
        }

        // 6) Qualquer outro HTTP/HTTPS (anúncio/redirecionamento) → BLOQUEIA
        //    silenciosamente: não abre Chrome, não troca a Activity, o player
        //    permanece em primeiro plano.
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            return true;
        }

        // 7) Demais schemes customizados (tel:, mailto:, sms:, movieflix: etc.)
        //    → bloqueia silenciosamente (não abre outro aplicativo).
        return true;
    }

    /**
     * Abre o WhatsApp nativamente com o número e a mensagem pré-preenchida.
     * Usa o deep link nativo whatsapp://send e fallback para api.whatsapp.com.
     */
    private void abrirWhatsAppNativo(String url) {
        // Extrai phone e text da URL original (se vierem)
        String phone = WHATSAPP_NUMBER;
        String text = "";
        try {
            Uri uri = Uri.parse(url);
            String p = uri.getQueryParameter("phone");
            if (p != null && !p.isEmpty()) {
                phone = p.replace("+", "").replaceAll("\\D", "");
            }
            String t = uri.getQueryParameter("text");
            if (t != null) text = t;
        } catch (Exception e) {
            // ignora
        }

        // Garante o número oficial
        if (phone.isEmpty()) phone = WHATSAPP_NUMBER;

        // Monta o deep link nativo
        String deepLink = "whatsapp://send?phone=" + phone;
        if (!text.isEmpty()) {
            deepLink += "&text=" + Uri.encode(text);
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink));
            intent.setPackage("com.whatsapp");
            startActivity(intent);
            return;
        } catch (ActivityNotFoundException e) {
            // WhatsApp não instalado → fallback
        }

        // Fallback: api.whatsapp.com (abre no navegador/WhatsApp Web)
        String fallback = "https://api.whatsapp.com/send?phone=" + phone;
        if (!text.isEmpty()) {
            fallback += "&text=" + Uri.encode(text);
        }
        startExternal(fallback);
    }

    /** Abre uma URL no navegador externo (fora do WebView). */
    private void startExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Não foi possível abrir o link", Toast.LENGTH_SHORT).show();
        }
    }

    /** Verifica se há conexão com a internet. */
    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        }
        return cm.getActiveNetworkInfo() != null && cm.getActiveNetworkInfo().isConnected();
    }

    // ===== Botão voltar: fullscreen → página → sair =====
    @Override
    public void onBackPressed() {
        if (customView != null) {
            // 1. Em tela cheia → sai da tela cheia
            webView.getWebChromeClient().onHideCustomView();
        } else if (webView.canGoBack()) {
            // 2. Tem página anterior → volta
            webView.goBack();
        } else {
            // 3. Na página inicial → comportamento normal de saída
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
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
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}