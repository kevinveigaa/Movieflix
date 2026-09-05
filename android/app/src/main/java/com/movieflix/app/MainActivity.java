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
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

import com.getcapacitor.BridgeActivity;

/**
 * MovieFlix — MainActivity.
 *
 * O app é um WebView remoto que SEMPRE carrega a versão atual do site
 * (https://movieflix-bszf.onrender.com). Este activity configura:
 *
 * 1. WebViewClient que:
 *    - mantém no WebView a navegação interna do site e dos domínios do
 *      player/streaming;
 *    - mantém no WebView qualquer iframe/subframe (para não quebrar o
 *      player), exceto domínios conhecidos de anúncio;
 *    - abre o WhatsApp nativamente (ou navegador, como fallback);
 *    - abre QUALQUER outro link externo legítimo (http/https, tel, mailto,
 *      sms, intent, etc.) usando o Android (app correspondente ou
 *      navegador) em vez de bloquear por não estar numa whitelist.
 * 2. Guard de anúncio: apenas domínios conhecidos de anúncio/pop-up são
 *    bloqueados; ao bloquear, restaura a última página válida do player/site.
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

    public static final String SITE_URL = "https://movieflix-bszf.onrender.com";
    private WebView webView;
    private boolean primeiraCarga = true;
    // URL do player (última página de /assistir/ vista) — usada para voltar ao
    // player quando um anúncio consegue redirecionar o WebView para fora.
    private volatile String ultimaUrlPlayer = null;
    // Última URL válida (site/player) — para restauração quando bloqueamos.
    private volatile String ultimaUrlValida = null;
    // Evita loop de restauração (2 restaurações / 3s).
    private long ultimaRestauracao = 0;
    private int restauracoesRecentes = 0;

    // ── Duplo-back para sair ────────────────────────────────────────────────
    // Regra do produto: o usuário NUNCA sai do app com UM "voltar". Só sai com
    // DUAS pulsações de Voltar em ≤2s (1ª mostra o aviso discreto do site).
    private static final long JANELA_DUPLO_BACK_MS = 2000;
    private long ultimoBackPressionado = 0;
    // Flag: quando o duplo-back foi confirmado, o próximo back nativo sai.
    private boolean saidaConfirmada = false;

    // ── Fullscreen do player (vídeo) ────────────────────────────────────────
    // O botão de "tela cheia" do <video> nativo do site chama
    // WebChromeClient.onShowCustomView. Sem implementá-lo, o fullscreen NÃO
    // funciona no WebView (o vídeo fica preso no tamanho do player). Aqui
    // mostramos o vídeo em tela cheia num FrameLayout próprio, escondemos as
    // barras do sistema (modo imersivo) e giramos para paisagem; ao sair
    // (onHideCustomView / back) restauramos a UI sem recarregar o player.
    private View customView = null;
    private WebChromeClient.CustomViewCallback customViewCallback = null;
    private int originalSystemUiVisibility = 0;
    private int orientationOriginal = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private boolean fullscreenAtivo = false;
    private static final FrameLayout.LayoutParams COVER_SCREEN_PARAMS =
            new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT);
    private static final int FLAGS_IMERSIVOS =
            View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fonte escura padrão do MovieFlix (splash -> site).
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

                // ── Fullscreen do player (vídeo) ────────────────────────────
                // O botão "tela cheia" do <video> nativo chama este método.
                // Mostramos o vídeo em tela cheia num FrameLayout próprio,
                // escondemos barras do sistema (imersivo) e giramos para
                // paisagem. Ao sair, tudo é restaurado SEM recriar o iframe.
                @Override
                public void onShowCustomView(View view, WebChromeClient.CustomViewCallback callback) {
                    entrarFullscreen(view, callback);
                }

                @Override
                public void onShowCustomView(View view, int requestedOrientation, WebChromeClient.CustomViewCallback callback) {
                    // O WebView pode sugerir uma orientação para o vídeo. O
                    // player do MovieFlix é sempre usado em paisagem durante o
                    // fullscreen, independentemente da sugestão.
                    entrarFullscreen(view, callback);
                }

                @Override
                public void onHideCustomView() {
                    removerCustomView(false);
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

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return super.shouldInterceptRequest(view, request);
                }
            });

            // Previne o download de arquivos de anúncio (APK, exe, etc.).
            webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                // Bloqueia TODOS os downloads (o app não oferece download de arquivos).
            });
        }

        // Se o app foi aberto por um deep link (movieflix://...), navega direto
        // para a rota correspondente (o WebView já está configurado acima).
        tratarDeepLink(getIntent());
    }

    // ── Deep link (movieflix://) ─────────────────────────────────────────────
    // O site usa o botão "ABRIR APLICATIVO" (tela "Assista pelo aplicativo")
    // com links movieflix://assistir/{id}?season=S&ep=E e movieflix://titulo/{id}.
    // Quando o app já está aberto e recebe um desses links, navegamos o WebView
    // para a rota correspondente do site (que roda dentro do app). Se o app
    // ainda não estava aberto, o intent chega no onCreate via getIntent().
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        tratarDeepLink(intent);
    }

    /** Converte um deep link movieflix:// recebido via Intent do sistema. */
    private void tratarDeepLink(Intent intent) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null) return;
        tratarDeepLinkUri(uri);
    }

    /** Converte um deep link movieflix:// em rota do site e navega o WebView. */
    private void tratarDeepLinkUri(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme();
        if (scheme == null || !scheme.equalsIgnoreCase("movieflix")) return;

        String host = uri.getHost(); // "assistir" ou "titulo"
        String path = uri.getPath(); // "/{id}"
        String id = path != null ? path.replace("/", "") : null;
        if (id == null || id.isEmpty()) {
            // Sem id: abre a home do app.
            if (webView != null) webView.loadUrl(SITE_URL);
            return;
        }
        String rota;
        if ("titulo".equalsIgnoreCase(host)) {
            rota = SITE_URL + "/#/titulo/movie/" + id;
        } else {
            // assistir: preserva season/episode se presentes.
            String season = uri.getQueryParameter("season");
            String ep = uri.getQueryParameter("episode");
            if (season != null && ep != null) {
                rota = SITE_URL + "/#/assistir/" + id + "?season=" + season + "&ep=" + ep;
            } else {
                rota = SITE_URL + "/#/assistir/" + id;
            }
        }
        final String destino = rota;
        if (webView != null) {
            webView.post(() -> webView.loadUrl(destino));
        }
    }

    // ── Fullscreen: helpers ─────────────────────────────────────────────────

    /** FrameLayout de conteúdo da janela (onde o vídeo fullscreen é inserido). */
    private FrameLayout contentFrame() {
        View root = findViewById(android.R.id.content);
        return root instanceof FrameLayout ? (FrameLayout) root : null;
    }

    /** Entra no fullscreen do vídeo (WebChromeClient.onShowCustomView). */
    private void entrarFullscreen(View view, WebChromeClient.CustomViewCallback callback) {
        if (customView != null) {
            // Já está em fullscreen: descarta a nova solicitação sem recriar.
            if (callback != null) callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;

        FrameLayout decor = (FrameLayout) getWindow().getDecorView();
        FrameLayout content = contentFrame();

        // Captura o estado original para restaurar na saída.
        originalSystemUiVisibility = decor.getSystemUiVisibility();
        orientationOriginal = getRequestedOrientation();

        // Adiciona o vídeo por cima do WebView (o player continua vivo atrás,
        // sem reload/recriação do iframe).
        (content != null ? content : decor).addView(view, COVER_SCREEN_PARAMS);

        fullscreenAtivo = true;
        aplicarImersao();
        // Player fullscreen = paisagem (assim como o player no site/browser).
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    /** Sai do fullscreen (onHideCustomView ou BACK) e restaura a UI. */
    private void removerCustomView(boolean notificarWebView) {
        if (customView == null) return;

        View view = customView;
        WebChromeClient.CustomViewCallback cb = customViewCallback;
        customView = null;
        customViewCallback = null;
        fullscreenAtivo = false;

        FrameLayout decor = (FrameLayout) getWindow().getDecorView();
        FrameLayout content = contentFrame();
        (content != null ? content : decor).removeView(view);

        // Restaura barras do sistema, flags da janela e orientação original.
        decor.setSystemUiVisibility(originalSystemUiVisibility);
        restaurarFlagsJanela();
        if (orientationOriginal != ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED) {
            setRequestedOrientation(orientationOriginal);
        }

        if (webView != null) webView.requestFocus();
        if (notificarWebView && cb != null) cb.onCustomViewHidden();
    }

    /** Aplica as flags de janela + barras imersivas durante o fullscreen. */
    private void aplicarImersao() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout decor = (FrameLayout) getWindow().getDecorView();
        decor.setSystemUiVisibility(FLAGS_IMERSIVOS);
    }

    /** Remove as flags de janela que adicionamos no fullscreen. */
    private void restaurarFlagsJanela() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /** Ao girar durante o fullscreen, o sistema pode resetar as barras — reaplica. */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (fullscreenAtivo) {
            aplicarImersao();
        }
    }

    // ── WhatsApp: abre no app nativo e NUNCA navega o WebView ───────────────

    /** Número oficial do WhatsApp do MovieFlix (formato internacional, sem +). */
    public static final String WHATSAPP_NUMBER = "5511943750307";

    /** O link é de WhatsApp (wa.me / whatsapp.com / whatsapp://)? */
    private boolean ehWhatsApp(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        // Deep link nativo whatsapp://send?phone=... (app instalado).
        if (scheme.equals("whatsapp")) return true;
        if (!scheme.equals("https") && !scheme.equals("http")) return false;
        String host = uri.getHost();
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.equals("wa.me") || h.endsWith("whatsapp.com");
    }

    /**
     * O link é o WhatsApp OFICIAL do MovieFlix (wa.me / whatsapp.com com o
     * número configurado)? Usado pela ponte nativa (MovieFlixPlugin) para
     * validar a URL antes de abrir o intent — só o número oficial é aceito.
     */
    public static boolean ehWhatsAppOficial(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        // Deep link nativo whatsapp://send?phone=... — confere o número.
        if (scheme.equals("whatsapp")) {
            String phone = uri.getQueryParameter("phone");
            if (phone != null) {
                String limpo = phone.replaceAll("\\D", "");
                return limpo.equals(WHATSAPP_NUMBER);
            }
            return false;
        }
        if (!scheme.equals("https") && !scheme.equals("http")) return false;
        String host = uri.getHost();
        if (host == null) return false;
        String h = host.toLowerCase();
        if (!h.equals("wa.me") && !h.endsWith("whatsapp.com")) return false;
        // wa.me/{numero} — confere o número exato.
        if (h.equals("wa.me")) {
            String path = uri.getPath() == null ? "" : uri.getPath().replace("/", "").replace("+", "");
            return path.equals(WHATSAPP_NUMBER);
        }
        // api.whatsapp.com/send?phone=... — confere o parâmetro phone.
        String phone = uri.getQueryParameter("phone");
        if (phone != null) {
            String limpo = phone.replaceAll("\\D", "");
            return limpo.equals(WHATSAPP_NUMBER);
        }
        // web.whatsapp.com (sem número) — permite apenas o domínio oficial.
        return h.equals("web.whatsapp.com");
    }

    /** Abre o WhatsApp nativo (ou o navegador, se não instalado) via intent. */
    private void abrirWhatsApp(Uri uri) {
        // 1) Tenta o deep link nativo whatsapp://send?phone=... (app instalado).
        //    Se o WhatsApp estiver instalado, abre direto a conversa.
        try {
            String phone = null;
            String text = null;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            if (scheme.equals("whatsapp")) {
                phone = uri.getQueryParameter("phone");
                text = uri.getQueryParameter("text");
            } else {
                phone = uri.getQueryParameter("phone");
                text = uri.getQueryParameter("text");
            }
            if (phone != null) {
                String limpo = phone.replaceAll("\\D", "");
                if (limpo.equals(WHATSAPP_NUMBER)) {
                    StringBuilder sb = new StringBuilder("whatsapp://send?phone=").append(WHATSAPP_NUMBER);
                    if (text != null && !text.isEmpty()) {
                        sb.append("&text=").append(Uri.encode(text));
                    }
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(sb.toString()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return; // abriu o app nativo
                }
            }
        } catch (Exception ignored) {
            // Sem app que trate whatsapp:// → cai no fallback abaixo.
        }

        // 2) Fallback: abre o link https (wa.me / api.whatsapp.com) no navegador
        //    (WhatsApp Web) se o app não estiver instalado.
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
            // Sem app que trate o link: não navega o WebView para fora do site.
        }
    }

    /** Rastreia a última URL válida (site ou player) para restauração. */
    private void rastrearUrl(String url) {
        if (url == null) return;
        if (url.contains("/assistir/")) {
            ultimaUrlPlayer = url;
        }
        // Qualquer página do site é "válida" para restauração.
        if (url.startsWith("https://movieflix-bszf.onrender.com")) {
            ultimaUrlValida = url;
        }
    }

    // ── Classificação de domínios ────────────────────────────────────────────

    /** O host é o domínio principal do MovieFlix? */
    private boolean ehDominioInterno(Uri uri) {
        String host = uri.getHost();
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.equals("movieflix-bszf.onrender.com") || h.endsWith(".onrender.com");
    }

    /** O host é um dos domínios usados pelo player/streaming embutido? */
    private boolean ehDominioPlayer(Uri uri) {
        String host = uri.getHost();
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.endsWith("streambetter.shop")
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
                || h.endsWith("ggpht.com");
    }

    /** O host é um domínio conhecido de anúncio/pop-up? */
    private boolean ehDominioAnuncio(Uri uri) {
        String host = uri.getHost();
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.contains("ads") || h.contains("adservice") || h.contains("doubleclick")
                || h.contains("adsterra") || h.contains("propeller") || h.contains("popads")
                || h.contains("exoclick") || h.contains("trafficjunky")
                || h.contains("googlesyndication") || h.contains("adnxs")
                || h.contains("outbrain") || h.contains("taboola")
                || h.contains("revcontent") || h.contains("mgid");
    }

    /**
     * Tenta abrir uma URI externa usando o Android (app correspondente ou
     * navegador). Usado tanto para http(s) externos legítimos quanto para
     * outros esquemas (tel:, mailto:, sms:, intent:, etc.). Se não houver
     * aplicativo compatível instalado, a exceção é tratada silenciosamente
     * sem derrubar o app nem navegar o WebView para fora do site.
     */
    private void tentarAbrirExterno(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
            // Sem app compatível para tratar o link — ignora silenciosamente.
        }
    }

    /**
     * Trata navegações do WebView. Tudo é SILENCIOSO: nenhum Toast, Dialog,
     * alerta ou notificação é mostrado ao usuário (exceto o duplo-back).
     *
     * Prioridade:
     * 1. URI inválida → bloqueia com segurança.
     * 2. WhatsApp no frame principal → abre externamente no WhatsApp.
     * 3. movieflix:// → trata como Deep Link do aplicativo.
     * 4. iframe/subframe → continua no WebView, exceto anúncios conhecidos.
     * 5. MovieFlix/player (frame principal) → continua no WebView.
     * 6. Domínio de anúncio conhecido → bloqueia e restaura a última página válida.
     * 7. Qualquer outro link (http/https externo legítimo, tel:, mailto:,
     *    sms:, intent:, etc.) → abre externamente pelo Android. NÃO é mais
     *    bloqueado apenas por não estar numa lista de domínios permitidos.
     */
    private boolean tratarNavegacao(WebView view, Uri uri, boolean isMainFrame) {
        if (uri == null) return true; // 1. URI inválida.

        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();

        // 2. WhatsApp no frame principal: abre no app nativo e o WebView
        // fica onde está.
        if (isMainFrame && ehWhatsApp(uri)) {
            abrirWhatsApp(uri);
            return true;
        }

        // 3. Deep link do próprio app (movieflix://), caso apareça dentro do WebView.
        if (scheme.equals("movieflix")) {
            tratarDeepLinkUri(uri);
            return true;
        }

        // 4. iframe/subframe do player: continua no WebView, exceto anúncio.
        if (!isMainFrame) {
            if (ehDominioAnuncio(uri)) {
                return true; // bloqueia apenas o subframe de anúncio.
            }
            return false; // permite o WebView continuar carregando o player.
        }

        // 5. MovieFlix e domínios do player no frame principal: continuam no WebView.
        if (ehDominioInterno(uri) || ehDominioPlayer(uri)) {
            return false;
        }

        // 6. Anúncio conhecido no frame principal: bloqueia e restaura o player/site.
        if (ehDominioAnuncio(uri)) {
            restaurarUltimaPaginaValida(view);
            return true;
        }

        // 7. Qualquer outro link (http/https externo legítimo ou outro
        // protocolo como tel:/mailto:/sms:/intent:): abre pelo Android.
        tentarAbrirExterno(uri);
        return true;
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
        final String alvo = ultimaUrlPlayer != null ? ultimaUrlPlayer
                : (ultimaUrlValida != null ? ultimaUrlValida : SITE_URL);
        view.post(() -> view.loadUrl(alvo));
    }

    /**
     * Voltar inteligente: o site é SPA, então o histórico do WebView é curto.
     * - Se há páginas no histórico nativo, volta (equivale ao back do site).
     * - Se está na raiz, exige DUPLO-BACK: 1ª pulsação avisa (via JS no site,
     *   `window.__mfMostrarAviso()`), 2ª pulsação (≤2s) sai do app.
     */
    @Override
    public void onBackPressed() {
        // Se o vídeo está em tela cheia, o Voltar sai do fullscreen primeiro
        // (nunca sai do app nem navega para trás enquanto estiver em fullscreen).
        if (customView != null) {
            removerCustomView(true);
            return;
        }

        if (webView == null) {
            super.onBackPressed();
            return;
        }

        // Se o duplo-back foi confirmado pelo site, o próximo back sai de vez.
        if (saidaConfirmada) {
            saidaConfirmada = false;
            super.onBackPressed();
            return;
        }

        String url = webView.getUrl();
        if (url != null && !url.equals(SITE_URL) && !url.endsWith("/#/") && !url.endsWith("/#")) {
            // Navegação interna: volta para a página anterior (SPA) usando o
            // próprio botão do site se possível; caso contrário, histórico.
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
            // Segunda pulsação dentro de 2s → sai de verdade.
            ultimoBackPressionado = 0;
            super.onBackPressed();
            return;
        }

        // Primeira pulsação → aviso discreto e NÃO sai.
        ultimoBackPressionado = agora;
        webView.evaluateJavascript(
                "window.__mfMostrarAviso ? (window.__mfMostrarAviso(), true) : false;",
                value -> {
                    if ("false".equals(value) || value == null) {
                        // JS ainda não carregou: aviso local mínimo (Toast curto,
                        // sem "bloqueado" — apenas orientação de dupla pulsação).
                        android.widget.Toast.makeText(
                                this, "Pressione voltar novamente para sair",
                                android.widget.Toast.LENGTH_SHORT).show();
                    }
                });
    }

    /**
     * Teclas do controle remoto (DPAD): o site já trata as setas/OK/Voltar
     * via JS (useTvNavigation). Aqui apenas garantimos que o WebView recebe
     * as teclas (não deixa o sistema engolir) e que o BACK nativo não sai do
     * app quando o site tem navegação para voltar.
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

