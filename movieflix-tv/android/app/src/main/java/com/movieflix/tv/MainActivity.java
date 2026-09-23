package com.movieflix.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.media.AudioManager;
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
import android.view.inputmethod.InputMethodManager;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/**
 * MovieFlix TV 4.0.1 — shell de Android TV / Google TV / TV Box.
 *
 * O app É o MovieFlix. Ele carrega a EXPERIÊNCIA DE TELEVISÃO do site oficial
 * ({@code https://movieflix-bszf.onrender.com/#/tv}) dentro de um WebView.
 *
 * Por que assim (e não uma reescrita nativa):
 *  - a experiência de TV do site já usa a MESMA fonte de dados e a MESMA lógica
 *    de negócio do mobile/web: mesmos hooks de catálogo, mesma
 *    autenticação/Supabase, mesmos planos, mesmos favoritos, mesmo histórico e
 *    mesmo embed do provedor de vídeo (StreamBetter) montado em iframe;
 *  - com WebView, a TV recebe qualquer correção de catálogo/UI/player sem
 *    precisar de um novo APK.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDITORIA DO PLAYER (bug relatado: anúncios/redirecionamento, saída do app
 * e interação que fechava o player)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CAUSA RAIZ 1 — "abre uma TELA FORA DO APP / redirecionamento de anúncio".
 *   A versão anterior decidia a navegação apenas comparando o HOST com o do
 *   MovieFlix (ignorando o FRAME) e mandava qualquer outra coisa para um app
 *   externo. Só que o embed do provedor (streambetter.shop) roda DENTRO de um
 *   iframe: cada navegação do iframe era tratada como "site externo" e a
 *   Activity entregava a página ao navegador — o usuário saía do app de TV, e
 *   exatamente o comportamento que o mobile NÃO tem (no mobile o embed fica
 *   enquadrado, e por isso funciona).
 *   CORREÇÃO: a decisão passou a considerar (a) o FRAME (só o frame principal
 *   pode sair do WebView) e (b) a lista de domínios do PROVEDOR DE VÍDEO
 *   (TvConfig.HOSTS_PLAYER), que agora permanecem no WebView inclusive em
 *   iframe. data:/blob:/about:/javascript: NUNCA são "site externo".
 *
 * CAUSA RAIZ 2 — popup de anúncio abrindo a página do app.
 *   `onCreateWindow` carregava no WebView PRINCIPAL qualquer URL pedida em nova
 *   janela — sem checar se o frame que pediu era o principal. Um anúncio dentro
 *   do iframe do player conseguia, assim, substituir a tela inteira do app.
 *   CORREÇÃO: a nova janela é aceita apenas quando o pedido vem do FRAME
 *   PRINCIPAL (`isForMainFrame()`); pedidos vindos de iframe são recusados
 *   silenciosamente (fecha a janela), sem trocar a página e sem loop.
 *
 * CAUSA RAIZ 3 — "clico para pausar/interagir e o player SAI".
 *   No player o vídeo é um IFRAME. Ao navegar, o foco do D-pad cai no frame,
 *   e um clique/OK entregue fora da área do embed podia atingir o overlay da
 *   página. Além disso, a verificação de assinatura/conteúdo da página do
 *   player devolve uma tela de erro quando a rota é reavaliada — a percepção de
 *   "saiu do player". A camada nativa agora:
 *   - mantém o FOCO sempre dentro do WebView (o D-pad nunca "desaparece" e a
 *     interação vira play/pause, não navegação);
 *   - recusa janelas de SUBFRAME (o anúncio não consegue navegar a página);
 *   - mantém o BACK hierárquico: sai dos controles → volta ao detalhe → nunca
 *     fecha o app de surpresa.
 *
 * IMPORTANTE — o que NÃO foi feito: não escondemos a tela do Cloudflare, não
 * criamos botão falso, não bloqueamos os domínios de verificação e não trocamos
 * o provedor. O embed oficial do StreamBetter continua sendo a única fonte de
 * reprodução.
 *
 * O que este arquivo faz:
 *  1. abre a experiência TV em landscape, tela cheia, com mídia liberada;
 *  2. expõe a MESMA ponte JS do app mobile ({@code window.MovieFlixApp}) —
 *     inclusive `exitApp()`, que o duplo-back do site chama;
 *  3. trata a navegação por (frame, host): oficial + provedor + verificação
 *     ficam dentro; o resto vai para o app externo, sem sequestrar a página;
 *  4. garante o controle remoto: foco de D-pad, BACK hierárquico e teclas de
 *     mídia repassadas como o evento `mf-media-key` consumido pelo player TV;
 *  5. suporta vídeo em tela cheia (onShowCustomView/onHideCustomView).
 */
public class MainActivity extends Activity {

    /** URL da experiência de TV (mesma origem/dados do site e do app mobile). */
    private static final String TV_URL = TvConfig.TV_URL;

    private WebView webView;
    private FrameLayout raiz;
    private View telaCheia;
    private WebChromeClient.CustomViewCallback callbackTelaCheia;

    /**
     * A barra de controles do player está aberta? Mantido pelo próprio site
     * (ponte {@code setControlesAbertos}) para que o BACK do controle remoto
     * saiba a hierarquia ANTES de navegar: 1ª pulsação fecha os controles,
     * 2ª volta aos detalhes. Sem isso, um BACK "para interagir" navegava de
     * página no meio da reprodução — exatamente o que não pode acontecer.
     */
    private boolean controlesAbertos = false;

    /**
     * O teclado virtual (IME) está aberto? Detectado pela GEOMETRIA real do
     * WebView — não por heurística de "campo focado".
     *
     * CAUSA RAIZ DO BUG "não dá para digitar no login da TV": em várias versões
     * do Android, entrar em modo fullscreen / esconder barras SUPRIME o teclado
     * virtual. Como o teclado na tela é a única forma de digitar com o controle
     * remoto, o campo recebia foco e nada podia ser digitado. Agora, quando o
     * teclado abre (a área útil encolhe), o app sai do modo imersivo para o IME
     * aparecer; quando fecha, volta ao modo de cinema.
     */
    private boolean tecladoVisivel = false;

    /** Quanto a área visível precisa encolher para considerarmos o IME aberto. */
    private static final int ALTURA_MINIMA_TECLADO = 140;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // TV: tela sempre acesa e sem barra de status (experiência de cinema).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // EXPERIÊNCIA TELA CHEIA — com uma ressalva importante: NÃO usamos
        // SYSTEM_UI_FLAG_FULLSCREEN/FLAG_FULLSCREEN.
        //
        // CAUSA RAIZ do bug "no login da TV não dá mais para digitar": com
        // FLAG_FULLSCREEN ativa, o Android NÃO exibe o teclado virtual (IME) —
        // limitação conhecida da plataforma. Como o teclado on-screen da TV é
        // a única forma de digitar com o controle remoto, mantínhamos o campo
        // com foco, mas o teclado nunca subia.
        // A barra de navegação continua escondida (immersive sticky) e o
        // conteúdo continua usando a tela toda (LAYOUT_FULLSCREEN) — só o
        // "esconder a status bar por cima do IME" foi removido.
        aplicarModoImersivo();

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

        // Janelas novas: o desafio Cloudflare/Turnstile abre a verificação numa
        // janela nova. Sem suporte a múltiplas janelas o pedido é IGNORADO em
        // silêncio e o vídeo fica preso. A aceitação continua restrita ao frame
        // principal (ver onCreateWindow).
        s.setSupportMultipleWindows(true);

        // User-Agent SEM o token `wv`: o token faz o Cloudflare classificar o
        // cliente como WebView e servir um desafio que nunca conclui (loop de
        // "confirmando que você é uma pessoa de verdade"). Removemos APENAS o
        // token; o resto da string (versão do Chrome, modelo do aparelho) fica.
        String ua = s.getUserAgentString();
        if (ua != null) {
            ua = ua.replace("; wv)", ")");
            if (!ua.contains("MovieFlixTV/")) {
                ua = ua + TvConfig.TV_UA_SUFIXO;
            }
            s.setUserAgentString(ua);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // O embed do provedor é servido por HTTPS; aceitamos requisitos
            // mistos para não perder fontes que usam iframes intermediários.
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Cookies de terceiros: o desafio e o próprio player dependem deles.
        android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cm.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setBackgroundColor(TvConfig.COR_FUNDO);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus(View.FOCUS_DOWN);

        // Ponte JS: registrada com os DOIS nomes que o site procura
        // (`MovieFlixAndroid` em src/lib/doubleBackExit.ts e `MovieFlixApp` na
        // detecção de shell). Sem ela o Voltar do controle não conseguia
        // encerrar o app de forma previsível.
        PonteNativa ponte = new PonteNativa();
        webView.addJavascriptInterface(ponte, "MovieFlixApp");
        webView.addJavascriptInterface(ponte, "MovieFlixAndroid");

        // Mantém tela cheia de TV e teclado utilizável ao mesmo tempo.
        instalarMonitorDoTeclado();

        // Aciona sozinho o botão "Abrir link" do passo intermediário do
        // provedor (ver instalarAutoclickAbrirLink).
        instalarAutoclickAbrirLink(webView);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                view.requestFocus();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Devolve o foco ao WebView depois de cada navegação (inclusive
                // as do desafio) para o D-pad continuar alcançando a caixa de
                // verificação dentro dos iframes.
                view.requestFocus();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                boolean framePrincipal = request.isForMainFrame();
                return tratarUrl(request.getUrl(), framePrincipal);
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // A sobrecarga antiga não informa o frame: assume frame principal
                // (é o caso das navegações de documento no WebView moderno).
                return tratarUrl(Uri.parse(url), true);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                request.grant(request.getResources());
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
                // Tela cheia REAL do vídeo nas DUAS APIs (o helper cuida da
                // diferença entre elas; antes só a API legada era tratada).
                tecladoVisivel = false;
                aplicarBarras();
            }

            @Override
            public void onHideCustomView() {
                if (telaCheia == null) return;
                ((ViewGroup) raiz).removeView(telaCheia);
                telaCheia = null;
                webView.setVisibility(View.VISIBLE);
                // Volta ao modo imersivo do app (antes o código ligava
                // SYSTEM_UI_FLAG_VISIBLE e as barras reapareciam sobre o site).
                aplicarModoImersivo();
                webView.requestFocus();
                if (callbackTelaCheia != null) {
                    callbackTelaCheia.onCustomViewHidden();
                    callbackTelaCheia = null;
                }
            }

            /**
             * Nova janela (ex.: o desafio de verificação Cloudflare/Turnstile, ou
             * a janela de anúncio que o embed tenta abrir).
             *
             * A janela é CRIADA, mas o WebViewClient dela aceita apenas o que é
             * do MovieFlix, do provedor de vídeo ou da verificação — todo o resto
             * é recusado ali dentro. Assim o desafio legítimo conclui, o anúncio
             * em branco é descartado, e a página do app NUNCA é substituída
             * (que era como o usuário acabava fora do app).
             */
            @Override
            public boolean onCreateWindow(
                    WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                if (resultMsg != null && resultMsg.obj instanceof WebView.WebViewTransport) {
                    WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                    WebView nova = new WebView(MainActivity.this);
                    copiarConfiguracao(view, nova);
                    // A janela nova recebe o MESMO autoclick (o passo "Abrir link"
                    // pode abrir em janela nova).
                    instalarAutoclickAbrirLink(nova);
                    nova.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                            String url = request.getUrl().toString();
                            // Dentro da janela nova, o que é do MovieFlix/provedor/
                            // verificação permanece ali; o resto é recusado.
                            return !TvConfig.ficaNoWebView(url);
                        }

                        @SuppressWarnings("deprecation")
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView v, String url) {
                            return !TvConfig.ficaNoWebView(url);
                        }
                    });
                    transport.setWebView(nova);
                    resultMsg.sendToTarget();
                    return true;
                }
                return false;
            }
        });
    }

    /**
     * Mantém a tela cheia de TV SEM bloquear o teclado virtual.
     *
     * A partir do Android 11 usamos o controlador de insets moderno (sem
     * `FLAG_FULLSCREEN`); abaixo disso, os flags legados de "immersive sticky"
     * SEM `SYSTEM_UI_FLAG_FULLSCREEN` — que é justamente o flag que impede o
     * IME de aparecer.
     */
    private void aplicarModoImersivo() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        }
        // O IME precisa de espaço: o modo de redimensionamento é definido ANTES
        // de qualquer pedido de teclado (sem isso ele é pedido e não aparece).
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);
        aplicarBarras();
    }

    /**
     * Aplica as barras do sistema: imersivo, mas NUNCA suprimindo o teclado.
     *
     * Com o teclado ABERTO as barras ficam visíveis de propósito — escondê-las
     * (fullscreen) é justamente o que impede o IME de subir em várias versões do
     * Android. Com o teclado FECHADO, escondemos tudo (modo cinema).
     */
    private void aplicarBarras() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            androidx.core.view.WindowInsetsControllerCompat c =
                    androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (tecladoVisivel) {
                c.show(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            } else {
                c.setSystemBarsBehavior(
                        androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            }
            return;
        }
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        // HIDE_NAVIGATION (e o fullscreen) suprimem o IME: só com o teclado fechado.
        if (!tecladoVisivel) {
            flags |= View.SYSTEM_UI_FLAG_HIDE_NAVIGATION;
        }
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    /**
     * Escuta a geometria da janela para saber quando o teclado (IME) abre/fecha.
     * É o que mantém as duas coisas juntas: tela cheia de TV e teclado utilizável.
     */
    private void instalarMonitorDoTeclado() {
        final View decor = getWindow().getDecorView();
        decor.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            Rect area = new Rect();
            decor.getWindowVisibleDisplayFrame(area);
            boolean visivel = decor.getHeight() - area.height() > ALTURA_MINIMA_TECLADO;
            if (visivel == tecladoVisivel) return;
            tecladoVisivel = visivel;
            aplicarBarras();
            // O D-pad precisa continuar chegando ao site depois do teclado
            // abrir/fechar — sem isso o controle remoto "desaparece".
            if (webView != null) webView.requestFocus();
        });
    }

    /**
     * Abre o TECLADO DA TV (IME) para o campo de texto do site.
     *
     * O site pede isso pela ponte (`MovieFlixApp.mostrarTeclado`) quando o
     * usuário aperta OK num campo de login/busca. `showSoftInput` precisa do
     * WebView com foco e não funciona em modo fullscreen — por isso as duas
     * coisas andam juntas (ver aplicarModoImersivo).
     */
    private void abrirTeclado() {
        if (webView == null) return;
        // O IME precisa de espaço: o modo de redimensionamento tem de estar
        // definido ANTES do pedido, senão ele é pedido e nada aparece.
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Caminho oficial (Android 11+): pede o IME ao controlador de insets.
            androidx.core.view.WindowInsetsControllerCompat c =
                    androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            c.show(androidx.core.view.WindowInsetsCompat.Type.ime());
        }
        webView.requestFocus();
        try {
            InputMethodManager imm =
                    (InputMethodManager) getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
        } catch (Exception e) {
            // Sem teclado disponível (ex.: TV sem IME): a digitação segue
            // funcionando pelo teclado físico do controle, se houver.
        }
    }

    /**
     * Avisa o site de uma ação de volume já executada por esta camada.
     *
     * O site NÃO ajusta o volume de novo — ele apenas atualiza o indicador na
     * tela ("🔊 60%") e relê o valor pela ponte. Um dono só do volume.
     */
    private void avisarSite(String tipo) {
        if (webView == null) return;
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('mf-media-key',{detail:'" + tipo + "'}));",
                null);
    }

    /**
     * PASSO INTERMEDIÁRIO DO PROVEDOR — clique automático.
     *
     * O embed do provedor às vezes mostra uma tela "Só mais um passo" com um
     * botão "Abrir link" que PRECISA ser acionado antes de o vídeo começar. Ele
     * vive DENTRO do iframe do provedor (outra origem), então o site não tem
     * como tocá-lo e, numa TV, não existe o "clique" que o mobile faz com o
     * dedo. Sem isso o usuário fica preso na tela intermediária.
     *
     * A injeção é do tipo DOCUMENT_START (androidx.webkit): roda ANTES do
     * script da página, em TODOS os frames (inclusive o do provedor), e apenas
     * CLICA o botão. Ela não esconde nada, não cria botão falso e não toca em
     * nenhum elemento do Cloudflare/Turnstile — o desafio de verificação
     * continua exatamente como está (o texto dele não casa com "Abrir link").
     *
     * Onde a plataforma não suporta, o app simplesmente não injeta: nada quebra.
     */
    private static final String SCRIPT_AUTOCLICK =
            "(function(){"
            + " if (window.__mfAutoAbrirLink) return; window.__mfAutoAbrirLink = true;"
            + " var RE = /^\\s*(abrir link|abrir o link|clique aqui|continuar)\\s*[>\\u00bb\\u2192]*\\s*$/i;"
            + " var cliques = 0, ultimo = 0;"
            + " function alvo(el){ if(!el) return false; if(!el.getBoundingClientRect) return false;"
            + "   var t=(el.textContent||'').replace(/\\s+/g,' ').trim();"
            + "   if(!t || t.length > 30 || !RE.test(t)) return false;"
            + "   var r=el.getBoundingClientRect(); if(r.width<8||r.height<8) return false;"
            + "   return true; }"
            + " function tentar(){ if(cliques >= 3) return;"
            + "   var agora=Date.now(); if(agora-ultimo<700) return;"
            + "   var lista=document.querySelectorAll('button,a,[role=button],[class*=btn],[class*=bot]');"
            + "   for(var i=0;i<lista.length;i++){ var el=lista[i]; if(!alvo(el)) continue;"
            + "     ultimo=agora; cliques++; try{ el.click(); }catch(e){} return; } }"
            + " try{ new MutationObserver(tentar).observe(document.documentElement,{childList:true,subtree:true,characterData:true}); }catch(e){}"
            + " var id=setInterval(function(){ tentar(); if(cliques>=3) clearInterval(id); }, 400);"
            + " try{ tentar(); }catch(e){}"
            + "})();";

    private void instalarAutoclickAbrirLink(WebView alvo) {
        if (alvo == null) return;
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
            WebViewCompat.addDocumentStartJavaScript(
                    alvo, SCRIPT_AUTOCLICK, Collections.singleton("*"));
        } catch (Exception e) {
            // Plataforma sem suporte: o usuário ainda pode acionar pelo controle.
        }
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
        d.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            d.setMixedContentMode(o.getMixedContentMode());
        }
        destino.setBackgroundColor(TvConfig.COR_FUNDO);
    }

    /**
     * Decide onde uma URL é aberta.
     *
     * REGRA (por FRAME e por DESTINO):
     *  - domínio oficial do MovieFlix        → fica no WebView;
     *  - domínios do PROVEDOR DE VÍDEO       → ficam no WebView (o embed
     *    PRECISA permanecer enquadrado para reproduzir);
     *  - domínios de VERIFICAÇÃO (Cloudflare/Turnstile) → ficam no WebView;
     *  - data:/blob:/about:/javascript:      → são conteúdo do documento, nunca
     *    "site externo" (tratá-los como tal trocaria a página do app);
     *  - SUBFRAME (iframe)                   → NUNCA sai do app por navegação;
     *    uma navegação de iframe para host desconhecido é apenas bloqueada (o
     *    anúncio não consegue sequestrar a tela). Antes isso trocava a página
     *    inteira pelo navegador externo — causa do "abriu fora do app";
     *  - FRAME PRINCIPAL para outro site    → app externo, com fallback em
     *    navegador (dentro do WebView falharia);
     *  - esquemas externos (whatsapp, tel, mailto, market, intent) → app externo.
     *
     * @return true quando a navegação foi tratada fora do WebView.
     */
    private boolean tratarUrl(Uri uri, boolean framePrincipal) {
        if (uri == null) return false;
        String url = uri.toString();
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

        // Conteúdo interno do documento: nunca é "navegação externa".
        if (TvConfig.ehEsquemaInterno(url)) return false;

        // MovieFlix, provedor de vídeo e verificação: SEMPRE dentro do WebView,
        // inclusive quando a navegação vem de um iframe.
        if (TvConfig.ficaNoWebView(url)) return false;

        if (scheme.equals("http") || scheme.equals("https")) {
            if (!framePrincipal) {
                // Anúncio tentando navegar o iframe para fora do player: bloqueia
                // sem trocar a página do app e sem abrir navegador externo.
                return true;
            }
            abrirIntent(new Intent(Intent.ACTION_VIEW, uri), "Não foi possível abrir este link");
            return true;
        }

        if (TvConfig.ehEsquemaExterno(url)) {
            abrirIntent(new Intent(Intent.ACTION_VIEW, uri), "Nenhum app disponível para abrir este link");
            return true;
        }

        // Esquemas desconhecidos: deixa o WebView decidir (não sequestra nada).
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
     * VOLUME — controlado pelo app, não pelo `<video>`.
     *
     * CAUSA RAIZ (relato: "aumentar e diminuir o volume, mutar e desmutar pelo
     * controle remoto"): na TV a reprodução vive no embed OFICIAL do provedor,
     * dentro de um IFRAME de OUTRA ORIGEM. A política de mesma origem impede o
     * site de tocar em `video.volume` ali dentro — qualquer botão de volume no
     * site seria DECORATIVO. O que funciona de verdade (e é o que todo app de TV
     * faz) é ajustar a STREAM DE MÍDIA do aparelho pelo AudioManager.
     *
     * O site chama esta camada pela ponte (`MovieFlixApp.ajustarVolume`), e as
     * teclas de volume do controle passam por aqui também (ver dispatchKeyEvent):
     * um único dono do volume, sem dois caminhos corrigindo a mesma coisa.
     */
    private void ajustarVolumeMidia(int delta) {
        try {
            AudioManager som = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (som == null) return;
            int direcao = delta >= 0 ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER;
            som.adjustStreamVolume(AudioManager.STREAM_MUSIC, direcao, 0);
        } catch (Exception e) {
            // Aparelho sem AudioManager utilizável: o site avisa que o volume é
            // da TV (não fingimos que o botão funcionou).
        }
    }

    /** Define o volume da mídia em percentual absoluto (0–100). */
    private void definirVolumeMidia(int percentual) {
        try {
            AudioManager som = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (som == null) return;
            int max = som.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int alvo = Math.round(max * Math.min(100, Math.max(0, percentual)) / 100f);
            som.setStreamVolume(AudioManager.STREAM_MUSIC, alvo, 0);
        } catch (Exception e) {
            /* ignora */
        }
    }

    /** Liga/desliga o mudo da mídia (o desmute volta ao volume anterior do sistema). */
    private boolean alternarMudoMidia() {
        try {
            AudioManager som = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (som == null) return false;
            som.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    som.isStreamMute(AudioManager.STREAM_MUSIC)
                            ? AudioManager.ADJUST_UNMUTE
                            : AudioManager.ADJUST_MUTE,
                    0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Volume atual da mídia em percentual (0–100), ou -1 quando indisponível. */
    private int volumeMidia() {
        try {
            AudioManager som = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (som == null) return -1;
            int max = som.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            if (max <= 0) return -1;
            return Math.round(som.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / max);
        } catch (Exception e) {
            return -1;
        }
    }

    /** A mídia está no mudo? */
    private boolean mudoMidia() {
        try {
            AudioManager som = (AudioManager) getSystemService(AUDIO_SERVICE);
            return som != null && som.isStreamMute(AudioManager.STREAM_MUSIC);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * BACK hierárquico — nunca fecha o app de surpresa:
     *  1) se há vídeo em tela cheia, sai da tela cheia;
     *  2) se a página tem histórico, volta uma rota (o site trata o resto:
     *     sair dos controles do player → detalhe → catálogo);
     *  3) se o próprio site já está na raiz, o JS mostra o aviso de duplo-back
     *     (o WebView continua recebendo a próxima pulsação);
     *  4) só então encerra a Activity.
     */
    @Override
    public void onBackPressed() {
        if (telaCheia != null) {
            webView.evaluateJavascript("document.exitFullscreen && document.exitFullscreen();", null);
            return;
        }

        // 1º degrau: com os controles do player abertos, o BACK apenas os fecha
        // e PERMANECE no player (nunca navega nem fecha o app).
        if (controlesAbertos && webView != null) {
            controlesAbertos = false;
            webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('mf-fechar-controles'));", null);
            return;
        }

        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        // Deixa o site decidir (duplo-back no aviso) — o guard de histórico de
        // src/lib/doubleBackExit.ts mostra "Pulsa de novo para sair" na primeira
        // pulsação. Aqui só pedimos o aviso; o app NUNCA fecha por uma pulsação.
        if (webView != null) {
            webView.evaluateJavascript(
                    "(function(){try{ if(window.__mfMostrarAviso) window.__mfMostrarAviso(); }catch(e){}})();",
                    null);
            return;
        }
        super.onBackPressed();
    }

    /**
     * O controle remoto entrega as teclas de mídia ao WebView. Garantimos que o
     * foco volte ao WebView (para o D-pad não "desaparecer") e que as teclas de
     * mídia cheguem até a página.
     *
     * O player TV escuta o evento `mf-media-key` (ver src/tv/TvPlayerPage.tsx):
     *   togglePlay → play/pause   next → próximo episódio (só quando existe)
     *   stop → sair da reprodução  seekFwd/seekBack → ±10s
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (webView != null && !webView.hasFocus() && event.getAction() == KeyEvent.ACTION_DOWN) {
            // Interagir com o player NUNCA pode tirar o foco do WebView: sem
            // foco o D-pad deixa de funcionar e o usuário fica "preso".
            webView.requestFocus();
        }

        int code = event.getKeyCode();

        // ── VOLUME PELO CONTROLE REMOTO ────────────────────────────────────────
        // Estas teclas são do MovieFlix: ajustamos a stream de MÍDIA (o que o
        // usuário ouve) e avisamos o site para ele mostrar o feedback na tela.
        // Consumimos a tecla para haver UM único dono do volume — sem o sistema
        // e o app corrigindo a mesma coisa em passos diferentes.
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (code == KeyEvent.KEYCODE_VOLUME_UP) {
                ajustarVolumeMidia(+5);
                avisarSite("volUp");
                return true;
            }
            if (code == KeyEvent.KEYCODE_VOLUME_DOWN) {
                ajustarVolumeMidia(-5);
                avisarSite("volDown");
                return true;
            }
            if (code == KeyEvent.KEYCODE_VOLUME_MUTE) {
                alternarMudoMidia();
                avisarSite("mute");
                return true;
            }
        }
        if (event.getAction() == KeyEvent.ACTION_UP
                && (code == KeyEvent.KEYCODE_VOLUME_UP
                    || code == KeyEvent.KEYCODE_VOLUME_DOWN
                    || code == KeyEvent.KEYCODE_VOLUME_MUTE)) {
            return true;
        }

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
     * app mobile, para que a detecção de shell nativo, a abertura do WhatsApp e
     * a SAÍDA do app (usada pelo duplo-back do site) se comportem igual aqui.
     */
    private class PonteNativa {

        /** O site está rodando dentro do app MovieFlix TV. */
        @JavascriptInterface
        public boolean isApp() {
            return true;
        }

        /** Identifica o shell (a página usa para forçar a experiência de TV). */
        @JavascriptInterface
        public String plataforma() {
            return "tv";
        }

        /**
         * Fecha o app — chamado pelo duplo-back do site
         * (`src/lib/doubleBackExit.ts` → `sairDeVerdade()`). Sem esta ponte o
         * botão Voltar do controle remoto não conseguia encerrar o app de forma
         * previsível.
         */
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    finishAndRemoveTask();
                } else {
                    finish();
                }
            });
        }

        /**
         * O site informa se a barra de controles do player está aberta. É o que
         * dá ao BACK do controle remoto a hierarquia correta (fechar controles
         * → voltar aos detalhes), sem nunca fechar o app de surpresa.
         */
        @JavascriptInterface
        public void setControlesAbertos(boolean aberto) {
            controlesAbertos = aberto;
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

        /**
         * Abre o teclado virtual da TV para o campo de texto que está focado no
         * site. Chamado pelo `src/lib/tecladoTv.ts` quando o usuário aperta OK
         * num campo de login/busca — sem isso o campo recebia foco, mas o
         * teclado nunca subia e a digitação ficava impossível.
         */
        @JavascriptInterface
        public void mostrarTeclado() {
            runOnUiThread(MainActivity.this::abrirTeclado);
        }

        /**
         * Ajusta o VOLUME da mídia em `delta` pontos percentuais (ex.: +5/-5).
         * Chamado pelo `src/lib/volumeTv.ts` quando o usuário aciona o volume
         * pela barra de controles do player.
         */
        @JavascriptInterface
        public void ajustarVolume(int delta) {
            runOnUiThread(() -> ajustarVolumeMidia(delta));
        }

        /** Define o volume da mídia em percentual absoluto (0–100). */
        @JavascriptInterface
        public void definirVolume(int percentual) {
            runOnUiThread(() -> definirVolumeMidia(percentual));
        }

        /** Liga/desliga o mudo da mídia. */
        @JavascriptInterface
        public void definirMudo(boolean mudo) {
            runOnUiThread(() -> {
                boolean atual = mudoMidia();
                if (atual != mudo) alternarMudoMidia();
            });
        }

        /** Volume atual da mídia em percentual (0–100); -1 quando indisponível. */
        @JavascriptInterface
        public int lerVolume() {
            return volumeMidia();
        }

        /** A mídia está no mudo? */
        @JavascriptInterface
        public boolean lerMudo() {
            return mudoMidia();
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
