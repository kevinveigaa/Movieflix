package com.movieflix.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * MovieFlix TV 4.0.1 — shell de Android TV / Google TV / TV Box.
 *
 * O app É o MovieFlix. Ele carrega a EXPERIÊNCIA DE TELEVISÃO do site oficial
 * ({@code https://movieflix-bszf.onrender.com/#/tv}) dentro de um WebView.
 *
 * Por que assim (e não uma reescrita nativa):
 *  - a experiência de TV do site já usa a MESMA fonte de dados e a MESMA lógica
 *    de negócio do mobile/web: mesmos hooks de catálogo (filmes, séries),
 *    mesma autenticação/Supabase, mesmos planos, mesmos favoritos, mesmo
 *    histórico e mesmo embed do provedor de vídeo (StreamBetter) montado em
 *    iframe. Reescrever isso em Kotlin criaria um catálogo paralelo — que é
 *    exatamente o que NÃO se quer aqui;
 *  - com WebView, a TV recebe qualquer correção de catálogo/UI/player sem
 *    precisar de um novo APK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CORREÇÕES DE CLOUDFLARE / TURNSTILE NESTA VERSÃO (tela "Confirmando que você
 * é uma pessoa de verdade antes de carregar o vídeo..." / loop de verificação)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O conteúdo travava na verificação na TV enquanto funcionava no celular. Três
 * causas foram corrigidas aqui:
 *
 *  1. USER-AGENT COM `; wv)`. Todo WebView Android se identifica com o token
 *     `wv`. O Cloudflare/Turnstile usa esse token para classificar o cliente
 *     como "webview / automação" e então serve um desafio que NUNCA conclui
 *     sozinho (o usuário fica vendo "confirmando que você é uma pessoa de
 *     verdade" para sempre). Removemos o token `; wv)` — o WebView passa a se
 *     apresentar como o Chrome real que ele é por baixo. O UA original é
 *     PRESERVADO em `MovieFlixTV/4.0.1` como sufixo próprio do app;
 *     NÃO alteramos o resto da string (versão do Chrome, modelo do aparelho).
 *
 *  2. MÚLTIPLAS JANELAS DESLIGADAS. O plugin do desafio abre a verificação
 *     numa janela nova (`target="_blank"`). Sem `setSupportMultipleWindows`,
 *     o WebView IGNORA o pedido silenciosamente e o desafio nunca aparece —
 *     o vídeo fica preso. Agora as janelas são suportadas e a nova janela é
 *     carregada DENTRO do próprio WebView (`onCreateWindow`), no mesmo
 *     domínio oficial — nada de abrir navegador externo.
 *
 *  3. FOCO DE D-PAD PERDIDO. O desafio roda dentro de iframes aninhados; sem
 *     foco alcançável o usuário não consegue marcar a caixa do Turnstile com o
 *     controle remoto. O WebView é focável, `onPageStarted/onPageFinished`
 *     devolvem o foco, e o seletores de TV do site já incluem `iframe`.
 *
 * IMPORTANTE — o que NÃO foi feito: não escondemos a tela do Cloudflare, não
 * criamos botão falso, não bloqueamos os domínios de verificação. O antiAds do
 * site (`src/lib/antiAds.ts`) trata `challenges.cloudflare.com`, `cloudflare.com`
 * e `turnstile` como domínios intocáveis, para o desafio concluir UMA vez e
 * seguir para o conteúdo.
 *
 * O que este arquivo faz:
 *  1. abre a experiência TV em landscape, tela cheia, com mídia liberada;
 *  2. expõe a MESMA ponte JS do app mobile ({@code window.MovieFlixApp}) para
 *     que a detecção de shell nativo e a abertura do WhatsApp funcionem igual;
 *  3. mantém URL externa/aplicativo fora do WebView (WhatsApp, tel:, mailto:,
 *     intents de player externo) via {@code shouldOverrideUrlLoading} — mas
 *     mantém o domínio oficial E os domínios de verificação dentro;
 *  4. garante que o controle remoto funcione: o WebView tem foco de D-pad e o
 *     BACK navega dentro do app antes de sair;
 *  5. suporta vídeo em tela cheia (onShowCustomView/onHideCustomView);
 *  6. repassa as TECLAS DE MÍDIA do controle remoto para o player do site como
 *     o evento `mf-media-key`, que o player TV escuta (play/pause, próximo,
 *     parar, avançar/retroceder).
 */
public class MainActivity extends Activity {

    /** URL da experiência de TV (mesma origem/dados do site e do app mobile). */
    private static final String TV_URL = "https://movieflix-bszf.onrender.com/#/tv";

    /** Host do MovieFlix: navegação para cá fica DENTRO do WebView. */
    private static final String HOST_OFICIAL = "movieflix-bszf.onrender.com";

    /**
     * Domínios que NUNCA podem ser expulsos do WebView: o desafio de verificação
     * (Cloudflare/Turnstile) roda em iframes aninhados no player. Expulsá-los
     * quebra a reprodução — era uma das causas do loop de verificação.
     */
    private static final String[] HOSTS_VERIFICACAO = {
            "challenges.cloudflare.com",
            "cloudflare.com",
            "turnstile",
    };

    /** Marcador de versão no User-Agent (diagnóstico e futuros ajustes de UI). */
    private static final String TV_UA_SUFIXO = " MovieFlixTV/4.0.1";

    private WebView webView;
    private FrameLayout raiz;
    private View telaCheia;
    private WebChromeClient.CustomViewCallback callbackTelaCheia;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // TV: tela sempre acesa e sem barra de status (experiência de cinema).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }

        setContentView(R.layout.activity_main);

        raiz = findViewById(android.R.id.content);
        webView = findViewById(R.id.webview);
        configurarWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(TV_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

        // O foco precisa estar no WebView para o D-pad chegar ao site.
        webView.requestFocus();
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configurarWebView() {
        WebSettings s = webView.getSettings();

        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        // ── CORREÇÃO 2: janelas novas (desafio de verificação) ────────────────
        // O Turnstile/Cloudflare abre a verificação em uma nova janela. Sem isso
        // o pedido é ignorado em silêncio e o vídeo nunca carrega.
        s.setSupportMultipleWindows(true);

        // ── CORREÇÃO 1: User-Agent sem o token `wv` ───────────────────────────
        // O token `wv` faz o Cloudflare classificar o cliente como WebView e
        // servir um desafio que não conclui (loop de "confirmando que você é
        // uma pessoa de verdade"). Removemos APENAS esse token.
        String ua = s.getUserAgentString();
        if (ua != null) {
            ua = ua.replace("; wv)", ")");
            if (!ua.contains("MovieFlixTV/")) {
                ua = ua + TV_UA_SUFIXO;
            }
            s.setUserAgentString(ua);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // O embed do provedor é servido por HTTPS; aceitamos requisitos mistos
            // para não perder fontes que usam iframes intermediários.
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Cookies de terceiros: o desafio e o próprio player dependem deles.
        android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cm.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setBackgroundColor(0xFF0A0A0F);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus(View.FOCUS_DOWN);

        // Ponte JS com a MESMA API do app mobile, para a detecção de shell
        // nativo (useIsApp) e a abertura do WhatsApp funcionarem igual.
        webView.addJavascriptInterface(new PonteNativa(), "MovieFlixApp");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                view.requestFocus();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // CORREÇÃO 3: devolve o foco ao WebView depois de cada navegação
                // (inclusive as do desafio) para o D-pad continuar alcançando a
                // caixa de verificação dentro dos iframes.
                view.requestFocus();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return tratarUrl(request.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return tratarUrl(url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                request.grant(request.getResources());
            }

            /**
             * CORREÇÃO 2 (continuação): carrega a janela pedida pelo desafio
             * DENTRO deste mesmo WebView — nunca em navegador externo.
             */
            @Override
            public boolean onCreateWindow(
                    WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView nova = new WebView(MainActivity.this);
                copiarConfiguracao(view, nova);
                nova.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        // A URL pedida é carregada no WebView principal do app.
                        webView.loadUrl(request.getUrl().toString());
                        return true;
                    }

                    @SuppressWarnings("deprecation")
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        webView.loadUrl(url);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(nova);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (telaCheia != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                telaCheia = view;
                callbackTelaCheia = callback;
                view.setBackgroundColor(0xFF000000);
                ((ViewGroup) raiz).addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (telaCheia == null) return;
                ((ViewGroup) raiz).removeView(telaCheia);
                telaCheia = null;
                webView.setVisibility(View.VISIBLE);
                webView.requestFocus();
                if (callbackTelaCheia != null) {
                    callbackTelaCheia.onCustomViewHidden();
                    callbackTelaCheia = null;
                }
            }
        });
    }

    /** Copia as configurações essenciais do WebView principal para uma janela nova. */
    @SuppressLint("SetJavaScriptEnabled")
    private void copiarConfiguracao(WebView origem, WebView destino) {
        WebSettings o = origem.getSettings();
        WebSettings d = destino.getSettings();
        d.setJavaScriptEnabled(o.getJavaScriptEnabled());
        d.setDomStorageEnabled(true);
        d.setJavaScriptCanOpenWindowsAutomatically(true);
        d.setUserAgentString(o.getUserAgentString());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            d.setMixedContentMode(o.getMixedContentMode());
        }
        destino.setBackgroundColor(0xFF0A0A0F);
    }

    /** O host pertence à verificação (Cloudflare/Turnstile)? Nunca expulsar. */
    private boolean ehHostVerificacao(String host) {
        String h = host == null ? "" : host.toLowerCase();
        for (String dominio : HOSTS_VERIFICACAO) {
            if (h.equals(dominio) || h.endsWith("." + dominio) || h.contains(dominio)) return true;
        }
        return false;
    }

    /**
     * Decide onde uma URL é aberta.
     *
     * - Domínio do MovieFlix → fica no WebView (é o próprio app).
     * - Domínios de VERIFICAÇÃO (Cloudflare/Turnstile) → ficam no WebView:
     *   expulsá-los quebrava a reprodução (loop de verificação).
     * - Esquemas externos (whatsapp, tel, mailto, intent, market...) → app
     *   externo, com fallback em navegador. Dentro do WebView eles falhariam.
     *
     * @return true quando a navegação foi tratada fora do WebView.
     */
    private boolean tratarUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

        if (host.endsWith(HOST_OFICIAL)) return false;
        // Verificação roda dentro do app (iframe do player).
        if (ehHostVerificacao(host)) return false;

        if (scheme.equals("http") || scheme.equals("https")) {
            // Outro site: mantém o usuário no MovieFlix (abre no navegador).
            abrirIntent(new Intent(Intent.ACTION_VIEW, uri), "Não foi possível abrir este link");
            return true;
        }

        if (scheme.equals("whatsapp") || scheme.equals("tel") || scheme.equals("mailto")
                || scheme.equals("market") || scheme.equals("intent")) {
            abrirIntent(new Intent(Intent.ACTION_VIEW, uri), "Nenhum app disponível para abrir este link");
            return true;
        }

        return false;
    }

    private void abrirIntent(Intent intent, String avisoFalha) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, avisoFalha, Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * BACK: primeiro navega dentro do app (a própria TV usa o back do histórico);
     * só encerra quando não há mais o que voltar — comportamento previsível e
     * igual ao de qualquer app de TV.
     */
    @Override
    public void onBackPressed() {
        if (telaCheia != null) {
            webView.evaluateJavascript("document.exitFullscreen && document.exitFullscreen();", null);
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    /**
     * O controle remoto entrega as teclas de mídia ao WebView. Aqui garantimos
     * que o foco volte ao WebView (para o D-pad não "desaparecer") e que as
     * teclas de mídia cheguem até a página.
     *
     * O player TV escuta o evento `mf-media-key` (ver src/tv/TvPlayerPage.tsx):
     *   togglePlay → play/pause na ponte do provedor
     *   next       → próximo episódio (só quando existe)
     *   stop       → parar/sair da reprodução
     *   seek       → avançar/retroceder 10s (direção pelo keyCode)
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (webView != null && !webView.hasFocus() && event.getAction() == KeyEvent.ACTION_DOWN) {
            webView.requestFocus();
        }

        int code = event.getKeyCode();
        boolean midia = code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                || code == KeyEvent.KEYCODE_MEDIA_PLAY
                || code == KeyEvent.KEYCODE_MEDIA_PAUSE
                || code == KeyEvent.KEYCODE_MEDIA_STOP
                || code == KeyEvent.KEYCODE_MEDIA_NEXT
                || code == KeyEvent.KEYCODE_MEDIA_PREVIOUS
                || code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
                || code == KeyEvent.KEYCODE_MEDIA_REWIND;

        if (midia) {
            if (webView != null && event.getAction() == KeyEvent.ACTION_DOWN) {
                String tipo;
                if (code == KeyEvent.KEYCODE_MEDIA_PLAY || code == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                    tipo = "togglePlay";
                } else if (code == KeyEvent.KEYCODE_MEDIA_STOP) {
                    tipo = "stop";
                } else if (code == KeyEvent.KEYCODE_MEDIA_NEXT || code == KeyEvent.KEYCODE_MEDIA_PREVIOUS) {
                    tipo = "next";
                } else if (code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
                        || code == KeyEvent.KEYCODE_MEDIA_REWIND) {
                    // Direção do salto: o player soma/subtrai 10s.
                    tipo = code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD ? "seekFwd" : "seekBack";
                } else {
                    tipo = "togglePlay";
                }
                webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('mf-media-key',{detail:'" + tipo + "'}));",
                        null);
            }
            // Consome a tecla para não sair do app por engano.
            return true;
        }

        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.requestFocus();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            ((ViewGroup) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * Ponte exposta ao site como {@code window.MovieFlixApp} — a MESMA API do
     * app mobile, para que a detecção de shell nativo e a abertura do WhatsApp
     * se comportem igual aqui.
     */
    private class PonteNativa {

        /** O site está rodando dentro do app MovieFlix TV. */
        @JavascriptInterface
        public boolean isApp() {
            return true;
        }

        /** Identifica o shell (útil para a página decidir mostrar dicas de TV). */
        @JavascriptInterface
        public String plataforma() {
            return "tv";
        }

        /** Abre o WhatsApp oficial no app externo (mesma regra do mobile). */
        @JavascriptInterface
        public void abrirWhatsApp(String url) {
            if (url == null) return;
            final String alvo = url.trim();
            if (!(alvo.startsWith("https://wa.me/") || alvo.startsWith("https://api.whatsapp.com/")
                    || alvo.startsWith("whatsapp://"))) {
                return;
            }
            runOnUiThread(() -> abrirIntent(
                    new Intent(Intent.ACTION_VIEW, Uri.parse(alvo)),
                    "WhatsApp não instalado nesta TV"));
        }

        /** Abre uma URL no navegador externo (sai do WebView). */
        @JavascriptInterface
        public void abrirNoNavegador(final String url) {
            if (url == null) return;
            runOnUiThread(() -> abrirIntent(
                    new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim())),
                    "Não foi possível abrir este link"));
        }
    }
}
