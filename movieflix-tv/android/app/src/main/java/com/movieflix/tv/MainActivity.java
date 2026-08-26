package com.movieflix.tv;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
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
 * MovieFlix TV — MainActivity.
 *
 * App Android TV / Google TV / TV Box (WebView remoto da interface TV:
 * https://movieflix-bszf.onrender.com/#/tv). Este activity configura:
 *
 * 1. WebViewClient que BLOQUEIA TOTALMENTE popups/abas novas e navegação
 *    externa de anúncios — o usuário de TV NUNCA fica preso numa página de
 *    anúncio e o player NUNCA redireciona para outra tela. Navegação interna
 *    (o próprio site) continua normal.
 * 2. Guard de redirect NATIVO: se o WebView navegar para um host de
 *    anúncio/externo, RESTAURA imediatamente a última página válida
 *    (player ou site) — silencioso, sem toast/alerta.
 * 3. Voltar (back) inteligente: se o WebView tem histórico, volta uma página
 *    (Player -> filme -> página anterior); se está na raiz, exige duplo-back.
 * 4. DPAD/controle remoto: o WebView fica focado para receber as teclas
 *    (setas/OK/Voltar) que o site usa para navegação por TV (useTvNavigation).
 * 5. Cache do WebView desabilitado no primeiro load (no-cache) para que o
 *    app SEMPRE carregue a versão mais recente do site.
 * 6. Bloqueio de download (downloads de anúncio), geolocalização e janelas
 *    múltiplas — tudo negado silenciosamente.
 */
public class MainActivity extends BridgeActivity {

    public static final String SITE_URL = "https://movieflix-bszf.onrender.com/#/tv";
    private WebView webView;
    private boolean primeiraCarga = true;
    // Última URL válida (site/player) — para restauração quando bloqueamos.
    private volatile String ultimaUrlValida = null;
    // Evita loop de restauração (máx. 5 restaurações / 3s).
    private long ultimaRestauracao = 0;
    private int restauracoesRecentes = 0;

    // Duplo-back para sair: 1ª pulsações mostra aviso (via JS), 2ª sai.
    private static final long JANELA_DUPLO_BACK_MS = 2000;
    private long ultimoBackPressionado = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fundo escuro padrão do MovieFlix (splash -> site).
        getWindow().getDecorView().setBackgroundColor(Color.rgb(10, 10, 15));

        // Configura o WebView do Capacitor para o site remoto.
        webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            // Impede downloads de anúncio (arquivos APK/desconhecidos).
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
            // Janelas múltiplas (popups) NUNCA são criadas — tudo no mesmo WebView.
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            // Mídia (áudio/vídeo) dentro do player embutido.
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

            // Cache: força sempre a versão mais recente do site.
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

            // ══ TV REAL: user-agent de Android TV ══════════════════════════════
            // Muitos TV Boxes enviam um UA genérico ("Android") que o site não
            // reconhece como TV. Forçar o UA de Android TV garante que a
            // detecção ehTelaDeTv() ative a navegação por controle remoto
            // (setas + OK + Voltar + foco visível) em QUALQUER aparelho.
            String ua = settings.getUserAgentString();
            settings.setUserAgentString(ua + " AndroidTV/1.0");

            // Foco para receber teclas do controle remoto (DPAD).
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            webView.requestFocus();

            // Bloqueia geolocalização (anúncios pedem) — nega silenciosamente.
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    callback.invoke(origin, false, false);
                }
            });

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return tratarNavegacao(view, request.getUrl(), request.isForMainFrame());
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    return tratarNavegacao(view, Uri.parse(url), true);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    rastrearUrl(url);
                    if (primeiraCarga) {
                        primeiraCarga = false;
                        view.setBackgroundColor(Color.rgb(10, 10, 15));
                        // Remove o fundo preto de carregamento.
                        FrameLayout root = findViewById(android.R.id.content);
                        for (int i = 0; i < root.getChildCount(); i++) {
                            View child = root.getChildAt(i);
                            if (child instanceof ProgressBar) {
                                child.setVisibility(View.GONE);
                            }
                        }
                    }
                    // ══ Flag do app nativo TV ════════════════════════════════════
                    // Garante que a UI TV ative o modo controle remoto SEMPRE
                    // (navegação espacial + foco visível + long-press OK), mesmo
                    // em TV Boxes cujo user-agent não é detectado como TV.
                    view.evaluateJavascript(
                            "window.__MF_TV_APP__ = true;"
                                    + "if (window.dispatchEvent) {"
                                    + "  window.dispatchEvent(new Event('mf-tv-app'));"
                                    + "}",
                            null);
                    view.requestFocus();
                }

                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    rastrearUrl(url);
                    // Garante que o WebView continue recebendo as teclas do
                    // controle remoto (DPAD) a cada nova página.
                    view.requestFocus();
                }
            });

            // Previne o download de arquivos de anúncio (APK, exe, etc.).
            webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                // Bloqueia TODOS os downloads (o app não oferece download de arquivos).
            });
        }
    }

    /** Rastreia a última URL válida (site ou player) para restauração. */
    private void rastrearUrl(String url) {
        if (url == null) return;
        if (url.startsWith("https://movieflix-bszf.onrender.com")) {
            ultimaUrlValida = url;
        }
    }

    /** Decide se uma navegação deve ser BLOQUEADA (anúncio/popup/externo). */
    private boolean shouldBlock(Uri uri) {
        if (uri == null) return true;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.equals("https")) {
            // Permite apenas https (bloqueia intent://, tel://, file://, etc.)
            return true;
        }
        String host = uri.getHost();
        if (host == null) return true;

        String h = host.toLowerCase();
        // Domínios do próprio site e do player/streaming — SEMPRE permitidos.
        if (h.equals("movieflix-bszf.onrender.com")
                || h.endsWith(".onrender.com")
                || h.endsWith("streambetter.shop")
                || h.endsWith("playerflixapi.com")
                || h.endsWith("megaembedapi.site")
                || h.endsWith("embedplayapi.site")
                || h.endsWith("watchplayer.shop")
                || h.endsWith("embedplayer2.xyz")
                || h.endsWith("embed.warezcdn.link")
                || h.endsWith("superflixapi.life")
                || h.endsWith("youtube.com")
                || h.endsWith("youtu.be")
                || h.endsWith("youtube-nocookie.com")
                || h.endsWith("google.com")
                || h.endsWith("googleapis.com")
                || h.endsWith("gstatic.com")
                || h.endsWith("drive.google.com")
                || h.endsWith("googlevideo.com")
                || h.endsWith("ggpht.com")
                || h.endsWith("wa.me")
                || h.endsWith("whatsapp.com")
                || h.endsWith("instagram.com")) {
            return false;
        }

        // Domínios de anúncio conhecidos — bloqueia (o player tenta abrir).
        if (h.contains("ads") || h.contains("adservice") || h.contains("doubleclick")
                || h.contains("adsterra") || h.contains("propeller") || h.contains("popads")
                || h.contains("exoclick") || h.contains("trafficjunky")
                || h.contains("googlesyndication") || h.contains("adnxs")
                || h.contains("outbrain") || h.contains("taboola")
                || h.contains("revcontent") || h.contains("mgid")) {
            return true;
        }

        // Qualquer outro host externo (anúncio/redirecionamento): bloqueia e
        // volta para a última página válida (antiAds.ts na janela pai é a
        // primeira linha de defesa; aqui é a última linha nativa).
        return true;
    }

    /**
     * Trata navegações do WebView. Tudo é SILENCIOSO: nenhum Toast, Dialog,
     * alerta ou notificação é mostrado ao usuário.
     */
    private boolean tratarNavegacao(WebView view, Uri uri, boolean isMainFrame) {
        if (uri == null) return true;
        if (shouldBlock(uri)) {
            restaurarUltimaPaginaValida(view);
            return true;
        }
        return false;
    }

    /** Restaura a última página válida (player ou site) com anti-loop. */
    private void restaurarUltimaPaginaValida(WebView view) {
        long agora = System.currentTimeMillis();
        if (agora - ultimaRestauracao < 3000) {
            restauracoesRecentes++;
            if (restauracoesRecentes > 5) {
                // Anti-loop: não restaura mais que 5x em 3s — para no site.
                return;
            }
        } else {
            restauracoesRecentes = 0;
            ultimaRestauracao = agora;
        }
        final String alvo = ultimaUrlValida != null ? ultimaUrlValida : SITE_URL;
        view.post(() -> view.loadUrl(alvo));
    }

    /**
     * Voltar inteligente: o site é SPA, então o histórico do WebView é curto.
     * - Se há páginas no histórico nativo, volta (equivale ao back do site).
     * - Se está na raiz, exige DUPLO-BACK: 1ª pulsações avisa (via JS no site,
     *   `window.__mfMostrarAviso()`), 2ª pulsações (≤2s) sai do app.
     */
    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        String url = webView.getUrl();
        if (url != null && !url.equals(SITE_URL) && !url.contains("#/tv")) {
            // Navegação interna: volta para a página anterior (SPA).
            webView.evaluateJavascript(
                    "window.history.length > 1 ? (window.history.back(), true) : false;",
                    value -> {
                        if ("false".equals(value) || value == null) {
                            webView.goBack();
                        }
                    });
            return;
        }

        // Na raiz do app: exige DUPLO-BACK para sair.
        long agora = System.currentTimeMillis();
        if (agora - ultimoBackPressionado < JANELA_DUPLO_BACK_MS) {
            // Segunda pulsações dentro de 2s → sai de verdade.
            ultimoBackPressionado = 0;
            super.onBackPressed();
            return;
        }

        // Primeira pulsações → aviso discreto e NÃO sai.
        ultimoBackPressionado = agora;
        webView.evaluateJavascript(
                "window.__mfMostrarAviso ? (window.__mfMostrarAviso(), true) : false;",
                value -> {
                    if ("false".equals(value) || value == null) {
                        // JS ainda não carregou: aviso local mínimo (Toast curto).
                        android.widget.Toast.makeText(
                                this, "Pressione voltar novamente para sair",
                                android.widget.Toast.LENGTH_SHORT).show();
                    }
                });
    }

    /**
     * Teclas do controle remoto (DPAD): o site já trata as setas/OK/Voltar
     * via JS (useTvNavigation). Aqui apenas garantimos que o WebView recebe
     * as teclas e que o BACK nativo não sai do app quando há navegação.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Diagnóstico: registra cada tecla do controle remoto recebida pela
        // Activity (adb logcat -s MOVIEFLIX_KEY). Não interfere na navegação.
        try {
            android.util.Log.d("MOVIEFLIX_KEY", "KEY: " + event.getKeyCode() + " action=" + event.getAction());
        } catch (Exception ignored) {
        }
        if (webView != null && webView.isFocused()) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                switch (event.getKeyCode()) {
                    case KeyEvent.KEYCODE_DPAD_UP:
                    case KeyEvent.KEYCODE_DPAD_DOWN:
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_ENTER:
                    case KeyEvent.KEYCODE_NUMPAD_ENTER:
                        // Deixa o WebView tratar (setas/OK).
                        return false;
                    case KeyEvent.KEYCODE_BACK:
                        // O BACK é tratado pelo onBackPressed (duplo-back).
                        return false;
                    default:
                        break;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
