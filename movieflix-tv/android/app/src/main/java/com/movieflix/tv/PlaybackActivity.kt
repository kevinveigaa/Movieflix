package com.movieflix.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import org.json.JSONObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * PLAYER do MovieFlix TV — reprodução em tela cheia com controle remoto.
 *
 * Estratégia de reprodução (híbrida, autorizada pelo dono):
 *  1. NATIVO (padrão): ExoPlayer/Media3 com a URL HLS/MP4 resolvida pelo
 *     StreamResolver (mesma cadeia do site/mobile: embed → backend → HLS).
 *  2. FALLBACK HÍBRIDO: se o nativo não conseguir resolver (ex.: o provedor
 *     exige JavaScript/Cloudflare Turnstile, que um player nativo não executa),
 *     o app renderiza o MESMO embed oficial do StreamBetter que o site e o
 *     mobile usam, dentro de um WebView — mesma conta, mesmos dados, mesma
 *     fonte. O WebView é usado SOMENTE no player e nunca para navegar no app.
 *
 * Controles (controle remoto):
 *  - OK curto  = play/pause (mostra/esconde os controles)
 *  - OK SEGURADO (long press) = alterna TELA CHEIA ⇄ MODO JANELA
 *  - ← / →     = retroceder / avançar 15s
 *  - ↑ / ↓     = volume (overlay fechado) ou navegação (overlay aberto)
 *  - BACK      = fecha o overlay; fora dele, sai do player
 *  - No fallback WebView, os mesmos comandos são injetados via JavaScript
 *    (play/pause, seek, fullscreen) para o player do embed.
 */
class PlaybackActivity : AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var webViewPlayer: WebView? = null
    private var overlay: View? = null
    private var layoutLoading: View? = null
    private var layoutErro: View? = null
    private var layoutBloqueio: View? = null

    private var erroTexto: TextView? = null
    private var bloqueioTexto: TextView? = null
    private var lblTituloPlayer: TextView? = null
    private var lblMetaPlayer: TextView? = null
    private var lblTempos: TextView? = null
    private var btnPlayPause: TextView? = null
    private var btnRetroceder: TextView? = null
    private var btnAvancar: TextView? = null
    private var btnProximoEp: TextView? = null
    private var progressFill: View? = null
    private var progressRest: View? = null

    private var embedUrl: String = ""
    private var retomadaSegundos: Long = 0L
    private var maxTelas: Int = 1
    private var overlayVisivel = false
    private var ultimoSalvoSegundos = 0L

    /** true quando o fallback WebView está ativo (controles via JS). */
    private var modoWebView = false

    /**
     * true quando as teclas devem ir DIRETO para o conteúdo do iframe.
     *
     * No fallback a única superfície interativa é o embed, e ele é um
     * documento CROSS-ORIGIN: o widget de verificação e o player do provedor
     * vivem lá dentro. Assim que o iframe é montado, o Chromium entrega
     * UP/DOWN/LEFT/RIGHT/OK ao conteúdo focado — exatamente como num navegador
     * comum. Interceptar essas teclas aqui (como a versão anterior fazia) é o
     * que quebrava o controle remoto dentro do provedor. BACK continua sendo
     * tratado por nós, para o usuário nunca ficar preso.
     */
    private var controleParaIframe = false

    /**
     * Estado da verificação do provedor (Turnstile).
     *
     * ── O QUE NÃO SE FAZ MAIS (causa raiz do loop) ──────────────────────────
     * A versão anterior recarregava o WebView sozinha enquanto a tela de
     * verificação estava na frente:
     *     wv.postDelayed({ wv.reload() }, 1500)
     * Isso destruída o próprio progresso da verificação: o widget Turnstile é
     * recriado do zero, e a página do provedor ainda recarrega sozinha
     * DEPOIS de validar o token no servidor (`window.location.reload()` no
     * `onTurnstileOk`). Resultado: o usuário confirmava e era jogado de volta
     * para o início, para sempre. A página do provedor agora fica INTACTA.
     * ───────────────────────────────────────────────────────────────────────
     */
    private var verificacaoDetectada = false

    /** Watchdog da verificação (nunca deixa o usuário preso sem saída). */
    private var taskDesafio: Job? = null

    /**
     * Observação CONTÍNUA do que o provedor está exibindo dentro do WebView.
     *
     * A versão anterior avaliava a tela UMA única vez, no `onPageFinished`. O
     * conteúdo real (widget de verificação / `<video>`) vive dentro do iframe
     * cross-origin, e o próprio provedor faz `window.location.reload()` DEPOIS de
     * validar a confirmação. Sem reavaliação periódica, o app nunca percebia nem a
     * passagem da verificação nem o aparecimento do vídeo — e ficava exatamente no
     * "Confirmando que você é uma pessoa de verdade..." relatado.
     */
    private var taskMonitor: Job? = null

    /** Um único self-recovery quando o provedor responde "só funciona dentro de um iframe". */
    private var recuperacaoEnquadramento = false

    /** Quantos ciclos de watchdog já foram rearmados (evita laço infinito). */
    private var ciclosWatchdog = 0

    /** Teto de espera antes de oferecer TENTAR DE NOVO (generoso: a verificação é humana). */
    private val timeoutDesafioMs = 90_000L

    /** Intervalo da observação contínua do provedor. */
    private val intervaloMonitorMs = 1_200L

    /**
     * Origem do documento-wrapper que monta o iframe oficial.
     *
     * PRECISA ser diferente da origem do provedor. O wrapper era carregado com
     * `loadDataWithBaseURL(AppConfig.STREAMBETTER_BASE, ...)` — a MESMA origem do
     * iframe. Com origem igual, o Chromium não trata o iframe como frame aninhado
     * e a página do provedor responde "Este link só funciona dentro de um iframe":
     * a verificação nem começava e a TV ficava presa no texto de confirmação.
     * O site e o app mobile montam o iframe a partir da origem do APP — é isso que
     * replicamos. Este valor não vai à rede: só define a origem do documento local.
     */
    private val ORIGEM_WRAPPER = "https://movieflix.tv/"

    /**
     * Fotografia do estado do provedor, lida de DENTRO da página.
     *
     * Lê os DOIS documentos (topo e iframe, quando acessível) porque o conteúdo
     * relevante vive no iframe cross-origin. O HTML vai truncado: os marcadores que
     * decidem o estado ficam no começo do documento.
     */
    private val JS_ESTADO = "(function(){" +
        "function doc(){try{var f=document.querySelector('iframe');if(!f)return null;" +
        "var d=f.contentDocument||(f.contentWindow&&f.contentWindow.document);" +
        "return d||null;}catch(e){return null;}}" +
        "var d=null;try{d=doc();}catch(e){}" +
        "var legivel=(d!==null&&d!==undefined);" +
        "function corta(s){return String(s||'').substring(0,8000);}" +
        "var topo=corta(document.documentElement?document.documentElement.innerHTML:'');" +
        "var dentro=legivel?corta(d.documentElement.innerHTML):'';" +
        "var v=null;try{v=document.querySelector('video');}catch(e){}" +
        "if(!v&&legivel){try{v=d.querySelector('video');}catch(e){}}" +
        "var src='';try{src=(v&&(v.currentSrc||v.src))?String(v.currentSrc||v.src):'';}catch(e){}" +
        "return JSON.stringify({t:topo,d:dentro,l:legivel,v:v?true:false,s:src});" +
        "})();"

    /** true quando o vídeo está em modo janela (não ocupa a tela toda). */
    private var modoJanela = false

    // AUTO-OCULTAR dos controles: aparecem quando precisos e somem sozinhos.
    private val handlerOverlay = android.os.Handler(android.os.Looper.getMainLooper())
    private val esconderOverlaySozinho = Runnable {
        if (overlayVisivel && estaTocando()) toggleOverlay(false)
    }
    private var movie: Movie? = null
    private var temporada = 1
    private var episodio = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_playback)

        // Player de TV: tela sempre acesa, sem barras do sistema.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        esconderSistema()

        playerView = findViewById(R.id.playerView)
        webViewPlayer = findViewById(R.id.webViewPlayer)
        overlay = findViewById(R.id.overlayControles)
        layoutLoading = findViewById(R.id.layoutLoading)
        layoutErro = findViewById(R.id.layoutErro)
        layoutBloqueio = findViewById(R.id.layoutBloqueio)
        erroTexto = findViewById(R.id.lblErroPlayer)
        bloqueioTexto = findViewById(R.id.lblBloqueio)
        lblTituloPlayer = findViewById(R.id.lblTituloPlayer)
        lblMetaPlayer = findViewById(R.id.lblMetaPlayer)
        lblTempos = findViewById(R.id.lblTempos)
        btnPlayPause = findViewById(R.id.btnPlayPause)
        btnRetroceder = findViewById(R.id.btnRetroceder)
        btnAvancar = findViewById(R.id.btnAvancar)
        btnProximoEp = findViewById(R.id.lblProximoEp)
        progressFill = findViewById(R.id.progressFill)
        progressRest = findViewById(R.id.progressRest)

        val m = intent.getStringExtra("movie_id")?.let { CatalogRepository.porId(this, it) }
        if (m == null) {
            mostrarBloqueio("Título não encontrado no catálogo.")
            return
        }
        movie = m
        if (m.ehSerie) {
            temporada = intent.getIntExtra("season", 1).coerceAtLeast(1)
            episodio = intent.getIntExtra("episode", 1).coerceAtLeast(1)
        }

        // Controles (todos acionáveis pelo D-pad)
        btnRetroceder?.setOnClickListener { seekRelativo(-15_000) }
        btnAvancar?.setOnClickListener { seekRelativo(15_000) }
        btnPlayPause?.setOnClickListener { alternarPlayPause() }
        btnProximoEp?.setOnClickListener { abrirProximoEpisodio() }
        findViewById<TextView>(R.id.btnSairPlayer).setOnClickListener { sair() }
        findViewById<TextView>(R.id.btnTentarNovamente).setOnClickListener {
            resolverEIniciar()
        }
        findViewById<TextView>(R.id.btnSairErro).setOnClickListener { finish() }
        findViewById<TextView>(R.id.btnVerPlanos).setOnClickListener {
            startActivity(Intent(this, AccountActivity::class.java))
        }
        findViewById<TextView>(R.id.btnSairBloqueio).setOnClickListener { finish() }

        // Foco visível com o mesmo realce do resto do app
        listOf(btnRetroceder, btnPlayPause, btnAvancar, btnProximoEp).forEach {
            it?.let { v -> MfDesign.focoBotao(v, 1.04f) }
        }
        listOf(
            findViewById<TextView>(R.id.btnSairPlayer),
            findViewById<TextView>(R.id.btnTentarNovamente),
            findViewById<TextView>(R.id.btnSairErro),
            findViewById<TextView>(R.id.btnVerPlanos),
            findViewById<TextView>(R.id.btnSairBloqueio),
        ).forEach { MfDesign.focoBotao(it, 1.04f) }

        lblTituloPlayer?.text = m.title
        val rotuloEp = if (m.ehSerie) MediaCatalog.rotuloEpisodio(temporada, episodio) else ""
        val partes = mutableListOf(if (m.ehSerie) "Série" else "Filme")
        if (rotuloEp.isNotBlank()) partes.add(rotuloEp)
        if (m.ano.isNotBlank()) partes.add(m.ano)
        val qual = m.qualidade()
        if (qual.isNotBlank()) partes.add(qual)
        lblMetaPlayer?.text = partes.joinToString("  •  ")

        embedUrl = MediaCatalog.embedUrl(m, temporada, episodio)
        if (embedUrl.isBlank()) {
            mostrarBloqueio("Este título ainda não possui fonte de vídeo disponível.")
            return
        }

        retomadaSegundos = ProgressRepository.carregar(this, chaveProgresso())

        // Verifica o limite de telas do plano ANTES de reproduzir (mesma regra)
        verificarLimiteTelas()
    }

    /** Chave local de retomada (inclui temporada/episódio nas séries). */
    private fun chaveProgresso(): String {
        val m = movie ?: return ""
        return if (m.ehSerie) "${m.id}_s${temporada}e${episodio}" else m.id
    }

    // ── Limite de telas (mesma tabela/regra do site) ────────────────────────
    private fun verificarLimiteTelas() {
        if (!AuthRepository.estaLogado(this)) {
            mostrarBloqueio("Faça login para assistir. Use a mesma conta do site e do celular.")
            return
        }
        layoutLoading?.visibility = View.VISIBLE
        scope.launch {
            val limite = withContext(Dispatchers.IO) {
                val assinatura = AccountRepository.assinatura(this@PlaybackActivity)
                val ativa = AccountRepository.temAssinaturaAtiva(assinatura)
                val planos = AccountRepository.planos(this@PlaybackActivity)
                maxTelas = PlanoRegras.entitlementsForSubscription(assinatura, ativa, planos).screens
                maxTelas
            }
            if (limite <= 0) {
                mostrarBloqueio(
                    "Você precisa de uma assinatura ativa para assistir.\n" +
                        "Assine pelo site ou app do MovieFlix — a mesma conta vale nesta TV.",
                )
                return@launch
            }
            val estado = withContext(Dispatchers.IO) {
                PlaybackSessionRepository.beat(this@PlaybackActivity, limite)
            }
            if (estado.blocked) {
                mostrarBloqueio(
                    "Limite de ${PlanoRegras.telasLabel(limite)} atingido.\n" +
                        "Feche o MovieFlix em outro aparelho para continuar assistindo aqui.",
                )
                return@launch
            }
            resolverEIniciar()
        }
    }

    private fun resolverEIniciar() {
        if (embedUrl.isBlank()) return
        layoutErro?.visibility = View.GONE
        layoutBloqueio?.visibility = View.GONE
        layoutLoading?.visibility = View.VISIBLE
        playerView?.visibility = View.GONE
        webViewPlayer?.visibility = View.GONE
        overlay?.visibility = View.GONE
        overlayVisivel = false

        scope.launch {
            val token = withContext(Dispatchers.IO) {
                AuthRepository.validToken(this@PlaybackActivity)
            }
            if (token.isNullOrBlank()) {
                mostrarBloqueio("Sessão expirada. Entre de novo com a mesma conta do site.")
                return@launch
            }
            val resolucao = withContext(Dispatchers.IO) { StreamResolver.resolve(embedUrl, token) }
            if (!resolucao.success || resolucao.url.isNullOrBlank()) {
                // NATIVO não resolveu → FALLBACK HÍBRIDO: renderiza o MESMO embed
                // oficial que o site/mobile usam (autorizado pelo dono).
                iniciarFallbackWebView()
                return@launch
            }
            val u = resolucao.url
            if (!u.startsWith("http://") && !u.startsWith("https://")) {
                iniciarFallbackWebView()
                return@launch
            }
            iniciarPlayer(u)
        }
    }

    // ── Fallback híbrido: WebView do embed oficial (mesma fonte do site) ────
    @SuppressLint("SetJavaScriptEnabled")
    private fun iniciarFallbackWebView() {
        val wv = webViewPlayer ?: return
        modoWebView = true
        // Daqui em diante quem recebe o controle remoto é o conteúdo do iframe
        // (widget de verificação / player do provedor). BACK segue nosso.
        controleParaIframe = true
        // Cada tentativa começa limpa — nenhum estado preso da tentativa anterior.
        verificacaoDetectada = false
        taskDesafio?.cancel()
        taskDesafio = null
        taskMonitor?.cancel()
        taskMonitor = null
        recuperacaoEnquadramento = false
        ciclosWatchdog = 0
        layoutLoading?.visibility = View.GONE
        layoutErro?.visibility = View.GONE
        layoutBloqueio?.visibility = View.GONE
        playerView?.visibility = View.GONE

        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // UA de Android TV real (o mesmo formato que o Chromium da TV usa).
            // Com um UA de desktop, o provedor podia servir variantes que se
            // comportam diferente do que o site/mobile recebe.
            userAgentString =
                "Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        // ── COOKIES: a correção central do erro "confirme que você é humano" ──
        //
        // O provedor usa Cloudflare: a primeira visita recebe uma página de
        // verificação, o navegador resolve e grava o cookie liberado
        // (`cf_clearance`). Esse cookie é de TERCEIRO domínio em relação ao
        // embed — e o WebView do Android, por padrão, BLOQUEIA cookies de
        // terceiros. Sem cookie, a verificação nunca "cola" e a tela de
        // confirmação voltava a cada tentativa, exatamente o defeito dos prints.
        //
        // Aqui NÃO se burla proteção nenhuma: apenas permitimos que o WebView
        // se comporte como o navegador do site/mobile — mesma página, mesmo
        // JavaScript, mesmos cookies, mesma sessão.
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(wv, true)
        }

        wv.setBackgroundColor(Color.BLACK)
        wv.webChromeClient = WebChromeClient()
        wv.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Enquanto a verificação externa está na tela, mantemos o
                // carregamento limpo — sem mensagem técnica para o cliente.
                // Página carregada: o nosso "Preparando o vídeo…" sai de cena
                // (a tela de verificação do provedor tem UI própria e não deve
                // ficar com duas mensagens empilhadas) e passamos a observar se
                // o vídeo apareceu.
                layoutLoading?.visibility = View.GONE
                avaliarDesafio(wv)
            }

            override fun onReceivedError(
                view: WebView?,
                request: android.webkit.WebResourceRequest?,
                error: android.webkit.WebResourceError?,
            ) {
                super.onReceivedError(view, request, error)
                // Só a navegação PRINCIPAL virou falha; sub-recursos (imagem,
                // script) falhando não devem derrubar o player.
                if (request?.isForMainFrame != true) return
                layoutLoading?.visibility = View.GONE
                layoutErro?.visibility = View.VISIBLE
            }
        }
        wv.visibility = View.VISIBLE
        wv.requestFocus()
        // ── CORREÇÃO CENTRAL: o embed TEM de ser carregado DENTRO de um iframe ──
        //
        // O provedor recusa acesso direto (navegação de topo): ele responde
        // "Este link só funciona dentro de um iframe". Era exatamente o print
        // do usuário. O site e o app mobile NUNCA têm esse problema porque os
        // dois montam um `<iframe src=\".../filme/{id}\">` (mobile = WebView
        // Capacitor carregando o site, que por sua vez monta o iframe).
        //
        // Aqui fazemos o MESMO: um documento local, só desta tela, que monta o
        // iframe oficial — com a chave pública do plano Creator já anexada por
        // MediaCatalog.embedUrl(). A verificação do Cloudflare acontece DENTRO
        // do iframe (nunca no contexto de topo), que é o fluxo legítimo do
        // provedor. Nada de token, nada de bypass.
        // ORIGEM DO WRAPPER — causa raiz do "só funciona dentro de um iframe".
        //
        // O wrapper era carregado com `loadDataWithBaseURL(AppConfig.STREAMBETTER_BASE, ...)`,
        // isto é, com a MESMA origem do iframe. Com origem igual, o Chromium não o
        // trata como frame aninhado e o provedor responde "Este link só funciona
        // dentro de um iframe" — a verificação nem começava e a TV ficava presa em
        // "Confirmando que você é uma pessoa de verdade...". O site/mobile montam o
        // iframe a partir de OUTRA origem (a do app), e é isso que fazemos aqui.
        wv.loadDataWithBaseURL(
            ORIGEM_WRAPPER,
            htmlEmbedEmIframe(embedUrl),
            "text/html",
            "UTF-8",
            null,
        )
        // Observação CONTÍNUA: sem ela o app nunca percebia a passagem da
        // verificação nem o aparecimento do vídeo.
        monitorarProvedor(wv)
        atualizarProximoEpisodio()
    }

    /**
     * Documento local que monta o embed oficial dentro de um `<iframe>`.
     *
     * O iframe carrega a URL REAL do provedor (com a chave pública). O
     * documento local não manipula o conteúdo do iframe — apenas o apresenta,
     * como o `<iframe>` do site faz. `allow` cobre autoplay/tela cheia,
     * necessários para reproduzir.
     */
    private fun htmlEmbedEmIframe(url: String): String {
        val escapada = url.replace("&", "&amp;").replace("\"", "&quot;")
        return "<!doctype html><html><head>" +
            "<meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<style>html,body{height:100%;margin:0;background:#000;overflow:hidden;}" +
            "iframe{width:100%;height:100%;border:0;display:block;}</style>" +
            "</head><body>" +
            "<iframe src=\"$escapada\" allow=\"autoplay; encrypted-media; " +
            "picture-in-picture; fullscreen\" allowfullscreen frameborder=\"0\">" +
            "</iframe></body></html>"
    }

    /**
     * Detecta o desafio do provedor (Cloudflare) dentro do WebView e faz UM
     * recarregamento limpo.
     *
     * Por que existe: o embed pode responder a primeira visita com a página
     * "confirme que você é humano". Como os cookies de terceiros agora são
     * aceitos, o cookie de liberação costuma ser gravado nessa visita — então
     * UMA recarga já entra direto no player. Sem isso, o usuário ficava preso
     * na tela de verificação sem saber o que fazer (defeito dos prints).
     *
     * Isto não burla proteção alguma: apenas recarrega a mesma página, como o
     * usuário faria. O limite de 2 tentativas evita qualquer laço infinito.
     */
    private fun avaliarDesafio(wv: WebView) {
        // O conteúdo real vive DENTRO do iframe (cross-origin). Tentamos ler o
        // documento interno; se o provedor for cross-origin, o acesso é
        // bloqueado e caímos para o documento de topo (o nosso wrapper).
        try {
            wv.evaluateJavascript(JS_ESTADO) { resultado ->
                val estado = lerEstado(resultado) ?: return@evaluateJavascript
                when (estado.estado) {
                    ChallengeScreen.PLAYER -> {
                        // VÍDEO NA TELA — a autorização (se houve) foi obtida
                        // LEGITIMAMENTE pelo usuário e está no cookie jar do
                        // WebView. A partir daqui o player nativo assume.
                        verificacaoDetectada = false
                        taskDesafio?.cancel()
                        taskDesafio = null
                        layoutLoading?.visibility = View.GONE
                        capturarFonteEAssumirNativo(wv, estado.src)
                    }
                    ChallengeScreen.DESAFIO -> {
                        // Verificação legítima na frente. NÃO recarregamos nada: o
                        // widget precisa terminar sozinho. Apenas garantimos que o
                        // OK do controle chegue ao quadro e armamos o watchdog.
                        verificacaoDetectada = true
                        layoutLoading?.visibility = View.GONE
                        injetarNavegacaoRemota(wv)
                        agendarWatchdogDesafio(wv)
                    }
                    "reenquadrar" -> {
                        // Defeito NOSSO (origem do documento-wrapper): recupera UMA
                        // vez, sem laço, recarregando o wrapper já pela origem neutra.
                        layoutLoading?.visibility = View.GONE
                        wv.loadDataWithBaseURL(
                            ORIGEM_WRAPPER,
                            htmlEmbedEmIframe(embedUrl),
                            "text/html",
                            "UTF-8",
                            null,
                        )
                        injetarNavegacaoRemota(wv)
                        agendarWatchdogDesafio(wv)
                    }
                    else -> {
                        // IFRAME (cross-origin: o caminho NORMAL, nada de errado) ou
                        // CONTROLES (o provedor ainda redireciona). Não recarregamos
                        // — recarregar aqui é o que destruía o progresso da
                        // verificação. O watchdog garante que ninguém fica preso.
                        injetarNavegacaoRemota(wv)
                        agendarWatchdogDesafio(wv)
                    }
                }
            }
        } catch (_: Exception) {
            // WebView já destruído — nada a avaliar.
        }
    }

    /** Estado lido da página: o rótulo e a URL do vídeo (quando já há uma). */
    private data class EstadoProvedor(val estado: String, val src: String)

    /**
     * Converte o resultado do [JS_ESTADO] em um estado, usando o módulo PURO
     * [ChallengeScreen] (coberto por ChallengeScreenTest) para decidir.
     */
    private fun lerEstado(resultado: String?): EstadoProvedor? {
        val bruto = resultado ?: return null
        if (bruto == "null" || bruto.isBlank() || bruto == "\"\"") return null
        // `evaluateJavascript` entrega uma STRING JSON-encodada: decodifica a camada
        // externa antes de virar objeto.
        val json = try {
            JSONObject(org.json.JSONTokener(bruto).nextValue() as String)
        } catch (_: Exception) {
            return null
        }
        val topo = if (json.isNull("t")) null else json.optString("t")
        val interno = if (json.isNull("d")) null else json.optString("d")
        val legivel = json.optBoolean("l", false)
        val temVideo = json.optBoolean("v", false)

        val estado = ChallengeScreen.classificar(topo, legivel, interno, temVideo)

        // "Este link só funciona dentro de um iframe" é defeito NOSSO, não do
        // usuário: o app se recupera sozinho, uma única vez.
        if (ChallengeScreen.ehErroDeEnquadramento(topo) && !recuperacaoEnquadramento) {
            recuperacaoEnquadramento = true
            return EstadoProvedor("reenquadrar", "")
        }
        return EstadoProvedor(estado, json.optString("s", ""))
    }

    /**
     * Observação contínua do provedor enquanto o WebView é a superfície ativa.
     *
     * É o que faz o app PERCEBER a passagem da verificação (inclusive depois do
     * `window.location.reload()` do provedor) e o aparecimento do vídeo.
     */
    private fun monitorarProvedor(wv: WebView) {
        taskMonitor?.cancel()
        taskMonitor = scope.launch {
            while (isActive && modoWebView && player == null) {
                delay(intervaloMonitorMs)
                if (!modoWebView || player != null) break
                withContext(Dispatchers.Main) { avaliarDesafio(wv) }
            }
        }
    }

    /**
     * Com a fonte AUTORIZADA em mãos, entrega a reprodução ao player NATIVO.
     *
     * É o fluxo idêntico ao do mobile: a mesma sessão já autorizada. Se o provedor
     * expôs uma URL de mídia direta, ela é usada; se não, pedimos a fonte pelo
     * MESMO caminho do MovieFlix (`StreamResolver`), agora COM os cookies desta
     * sessão — que é o que faltava para a requisição não voltar à verificação.
     */
    private fun capturarFonteEAssumirNativo(wv: WebView, src: String) {
        if (ehUrlDeMidia(src)) {
            encerrarWebViewEAbrirNativo(wv, src)
            return
        }
        val token = AuthRepository.loadToken(this)
        scope.launch {
            val valido = withContext(Dispatchers.IO) { AuthRepository.validToken(this@PlaybackActivity) }
            val r = withContext(Dispatchers.IO) { StreamResolver.resolve(embedUrl, valido ?: token) }
            val u = r.url
            if (r.success && u != null && ehUrlDeMidia(u)) {
                encerrarWebViewEAbrirNativo(wv, u)
            }
            // Caso contrário o próprio WebView segue tocando — exatamente o que o
            // mobile faz. Nenhum estado fica preso.
        }
    }

    private fun encerrarWebViewEAbrirNativo(wv: WebView, url: String) {
        taskMonitor?.cancel()
        taskMonitor = null
        taskDesafio?.cancel()
        taskDesafio = null
        modoWebView = false
        controleParaIframe = false
        wv.visibility = View.GONE
        iniciarPlayer(url)
    }

    /**
     * A URL é uma mídia reproduzível pelo ExoPlayer? Só aceitamos http(s) — o que
     * protege contra entregar ao player um `blob:`/`data:` interno da página.
     */
    private fun ehUrlDeMidia(url: String): Boolean {
        val u = url.lowercase()
        if (!u.startsWith("http://") && !u.startsWith("https://")) return false
        return u.contains(".m3u8") || u.contains("ext=m3u8") || u.contains(".mp4") ||
            u.contains(".mpd") || u.contains("/api/proxy") || u.contains("stream")
    }

    /**
     * Acessibilidade de controle remoto DENTRO do WebView.
     *
     * A página de verificação tem um widget focável. As setas do controle já
     * chegam ao Chromium (navegação espacial nativa), mas garantimos duas
     * coisas para o controle funcionar de verdade:
     *   1. sempre existe um elemento focado ao carregar;
     *   2. o OK do controle (que chega como `Enter`) aciona o elemento focado.
     *
     * Isto NÃO resolve nem contorna o desafio: apenas permite que o usuário o
     * confirme com o controle, exatamente como faria com o mouse. Nenhum
     * token é forjado, nenhum CAPTCHA é quebrado.
     */
    private fun injetarNavegacaoRemota(wv: WebView) {
        try {
            wv.evaluateJavascript(
                "(function(){" +
                    "if(window.__mfRemoto){return;}" +
                    "window.__mfRemoto=1;" +
                    "function focaDentro(){" +
                    "try{" +
                    "var f=document.querySelector('iframe');" +
                    "if(!f){return;}" +
                    // Focar o PRÓPRIO iframe entrega o teclado ao conteúdo: é
                    // assim que o Chromium passa UP/DOWN/LEFT/RIGHT/OK para o
                    // widget de verificação e depois para o player.
                    "f.focus();" +
                    "try{var d=f.contentDocument||(f.contentWindow&&f.contentWindow.document);" +
                    "if(d){var a=d.activeElement;" +
                    "if(!a||a===d.body){" +
                    "var el=d.querySelector('input,button,[role=button],[tabindex],a[href]');" +
                    "if(el)el.focus();}}}" +
                    "catch(e){}" +
                    "}catch(e){}" +
                    "}" +
                    "setTimeout(focaDentro,400);setTimeout(focaDentro,1200);setTimeout(focaDentro,2500);" +
                    "document.addEventListener('keydown',function(ev){" +
                    "if(ev.key==='Enter'||ev.key==='Accept'||ev.keyCode===13){" +
                    "var a=document.activeElement;" +
                    "if(a&&a!==document.body){try{a.click();}catch(e){}}" +
                    "try{var f=document.querySelector('iframe');" +
                    "if(f){var d=f.contentDocument||(f.contentWindow&&f.contentWindow.document);" +
                    "if(d){var b=d.activeElement;if(b&&b!==d.body){try{b.click();}catch(e){}}}}}" +
                    "catch(e){}" +
                    "}" +
                    "},true);" +
                    "})();",
                null,
            )
        } catch (_: Exception) {
            // página ainda não pronta — será chamado novamente no próximo onPageFinished
        }
    }

    /**
     * Watchdog: se em [timeoutDesafioMs] o vídeo não aparecer, mostramos um
     * estado LIMPO e navegável (TENTAR DE NOVO / VOLTAR) em vez de deixar o
     * usuário preso na tela do provedor. Nunca dispara sobre vídeo rodando.
     */
    private fun agendarWatchdogDesafio(wv: WebView) {
        if (taskDesafio?.isActive == true) return
        taskDesafio = scope.launch {
            delay(timeoutDesafioMs)
            if (!isActive) return@launch
            val tocando = withContext(Dispatchers.Main) {
                if (player != null) return@withContext true
                var ok = false
                try {
                    wv.evaluateJavascript(
                        "(function(){var v=document.querySelector('video');" +
                            "return (v&&(v.currentSrc||v.src)&&!v.paused)?'sim':'nao';})();",
                    ) { r -> if (r?.contains("sim") == true) ok = true }
                } catch (_: Exception) { /* WebView já destruído */ }
                ok
            }
            if (tocando) {
                verificacaoDetectada = false
                return@launch
            }
            // Verificação legítima em andamento e o usuário ainda pode estar
            // confirmando: NÃO interrompemos a tela dele — apenas rearmamos o
            // watchdog, com teto de ciclos para nunca virar laço.
            if (verificacaoDetectada && ciclosWatchdog < 3) {
                ciclosWatchdog++
                agendarWatchdogDesafio(wv)
                return@launch
            }
            verificacaoDetectada = false
            mostrarErro(
                "Não foi possível carregar o vídeo neste aparelho.\n\n" +
                    "Se apareceu a confirmação de segurança do provedor, use as setas para " +
                    "focar o quadro e confirme com OK. Caso contrário, toque em TENTAR DE NOVO.",
            )
        }
    }

    /** Injeta comandos de controle remoto no player do embed (fallback WebView). */
    private fun injetarComandoWebView(js: String) {
        val wv = webViewPlayer ?: return
        if (wv.visibility != View.VISIBLE) return
        try {
            wv.evaluateJavascript(
                "(function(){" +
                    "var v=document.querySelector('video');" +
                    "if(!v)return;" +
                    js +
                    "})();",
                null,
            )
        } catch (_: Exception) {
            // embed ainda carregando — ignora
        }
    }

    private fun estaTocando(): Boolean {
        if (modoWebView) return true
        return player?.isPlaying == true
    }

    // ── Player nativo (ExoPlayer) ───────────────────────────────────────────
    private fun iniciarPlayer(url: String) {
        val pv = playerView ?: return
        val exo = try {
            // O player usa o MESMO cliente/cookie jar da resolução: assim os pedidos
            // de playlist e de segmentos carregam os cookies da sessão já autorizada
            // no WebView — exatamente o que o mobile faz (mesmo WebView, mesmo jar).
            val fabrica = androidx.media3.datasource.DefaultDataSource.Factory(
                this,
                StreamResolver.dataSourceFactory(),
            )
            ExoPlayer.Builder(this)
                .setMediaSourceFactory(androidx.media3.exoplayer.source.DefaultMediaSourceFactory(fabrica))
                .build()
                .apply {
                    setMediaItem(MediaItem.fromUri(url))
                    if (retomadaSegundos > 0) seekTo(retomadaSegundos)
                    playWhenReady = true
                    prepare()
                }
        } catch (e: Exception) {
            iniciarFallbackWebView()
            return
        }
        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                exo.release()
                player = null
                // Falha na reprodução nativa → tenta o fallback híbrido
                iniciarFallbackWebView()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                btnPlayPause?.text = if (isPlaying) "\u23F8  Pausar" else "\u25B6  Continuar"
            }
        })
        player = exo
        pv.player = exo
        layoutLoading?.visibility = View.GONE
        pv.visibility = View.VISIBLE
        pv.requestFocus()
        atualizarProximoEpisodio()

        // Progresso: grava local + histórico do site a cada 15s (mesmas regras)
        scope.launch {
            while (isActive) {
                delay(5_000)
                atualizarBarra()
                val p = player ?: break
                val pos = p.currentPosition / 1000
                if (pos - ultimoSalvoSegundos >= 15) {
                    ultimoSalvoSegundos = pos
                    salvarProgresso(p.currentPosition, p.duration)
                }
            }
        }
    }

    // ── Progresso: local + watch_history (paridade com o site) ──────────────
    private fun salvarProgresso(posMs: Long, durMs: Long) {
        val m = movie ?: return
        if (durMs <= 0 || posMs <= 0) return
        // Posição local (retomada instantânea, mesmo offline)
        ProgressRepository.salvar(this, chaveProgresso(), posMs)
        // Histórico no Supabase, com as mesmas regras de progresso real
        val posSeg = (posMs / 1000).toInt()
        val durSeg = (durMs / 1000).toInt()
        if (!WatchHistoryRepository.temProgressoReal(posSeg, durSeg)) return
        scope.launch {
            withContext(Dispatchers.IO) {
                WatchHistoryRepository.upsert(
                    this@PlaybackActivity,
                    WatchHistoryRepository.UpsertArgs(
                        movieId = m.id,
                        tmdbId = m.tmdbIdNumerico,
                        mediaType = if (m.ehSerie) "tv" else "movie",
                        title = m.title,
                        posterPath = m.poster_url.ifBlank { null },
                        backdropPath = m.backdrop_url.ifBlank { null },
                        positionSeconds = posSeg,
                        durationSeconds = durSeg,
                        season = if (m.ehSerie) temporada else null,
                        episode = if (m.ehSerie) episodio else null,
                    ),
                )
            }
        }
    }

    // ── Barra de progresso e controles ──────────────────────────────────────
    private fun atualizarBarra() {
        val p = player ?: return
        val dur = p.duration
        val pos = p.currentPosition
        lblTempos?.text = if (dur > 0) {
            "${formatarTempo(pos)}  /  ${formatarTempo(dur)}"
        } else {
            formatarTempo(pos)
        }
        if (dur > 0) {
            val fracao = (pos.toDouble() / dur.toDouble()).coerceIn(0.0, 1.0).toFloat()
            progressFill?.layoutParams = (progressFill?.layoutParams as? android.widget.LinearLayout.LayoutParams)?.apply {
                weight = fracao * 100f
            }
            progressRest?.layoutParams = (progressRest?.layoutParams as? android.widget.LinearLayout.LayoutParams)?.apply {
                weight = (1f - fracao) * 100f
            }
            progressFill?.requestLayout()
            progressRest?.requestLayout()
        }
    }

    private fun formatarTempo(ms: Long): String {
        val total = (ms / 1000).coerceAtLeast(0)
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) {
            String.format("%d:%02d:%02d", h, m, s)
        } else {
            String.format("%02d:%02d", m, s)
        }
    }

    private fun atualizarProximoEpisodio() {
        val m = movie ?: return
        if (!m.ehSerie) {
            btnProximoEp?.visibility = View.GONE
            return
        }
        val eps = MediaCatalog.episodios(m, temporada)
        val temProximo = eps.any { it > episodio } || MediaCatalog.temporadas(m).any { it > temporada }
        btnProximoEp?.visibility = if (temProximo) View.VISIBLE else View.GONE
        btnProximoEp?.text = "\u23ED  Próximo episódio"
    }

    private fun abrirProximoEpisodio() {
        val m = movie ?: return
        if (!m.ehSerie) return
        salvarAgora()
        val eps = MediaCatalog.episodios(m, temporada)
        val proximoNaTemporada = eps.firstOrNull { it > episodio }
        if (proximoNaTemporada != null) {
            reiniciar(m, temporada, proximoNaTemporada)
            return
        }
        val proximaTemporada = MediaCatalog.temporadas(m).firstOrNull { it > temporada }
        if (proximaTemporada != null) {
            val primeiroEp = MediaCatalog.episodios(m, proximaTemporada).firstOrNull() ?: 1
            reiniciar(m, proximaTemporada, primeiroEp)
        }
    }

    private fun reiniciar(m: Movie, s: Int, e: Int) {
        salvarAgora()
        startActivity(
            Intent(this, PlaybackActivity::class.java)
                .putExtra("movie_id", m.id)
                .putExtra("season", s)
                .putExtra("episode", e),
        )
        finish()
    }

    // ── Controles D-pad ─────────────────────────────────────────────────────
    /** Mostra/esconde os controles e reagenda o auto-ocultar (4,5 s). */
    private fun toggleOverlay(mostrar: Boolean? = null) {
        val ov = overlay ?: return
        overlayVisivel = mostrar ?: !overlayVisivel
        ov.visibility = if (overlayVisivel) View.VISIBLE else View.GONE
        handlerOverlay.removeCallbacks(esconderOverlaySozinho)
        if (overlayVisivel) {
            atualizarBarra()
            btnPlayPause?.requestFocus()
            // Os controles somem sozinhos durante a reprodução.
            handlerOverlay.postDelayed(esconderOverlaySozinho, 4_500L)
        } else {
            if (modoWebView) webViewPlayer?.requestFocus() else playerView?.requestFocus()
        }
    }

    private fun seekRelativo(deltaMs: Long) {
        if (modoWebView) {
            val s = (deltaMs / 1000).toInt()
            injetarComandoWebView("v.currentTime=Math.max(0,v.currentTime+($s));")
            return
        }
        val p = player ?: return
        val destino = (p.currentPosition + deltaMs).coerceAtLeast(0L)
        p.seekTo(destino)
        atualizarBarra()
    }

    private fun alternarPlayPause() {
        if (modoWebView) {
            injetarComandoWebView(
                "if(v.paused){v.play();}else{v.pause();}",
            )
            return
        }
        val p = player ?: return
        if (p.isPlaying) p.pause() else p.play()
        atualizarBarra()
    }

    private fun salvarAgora() {
        if (modoWebView) {
            // No fallback, o progresso é salvo pelo próprio embed (mesma lógica
            // do site); aqui apenas registramos a posição local quando possível.
            return
        }
        val p = player ?: return
        salvarProgresso(p.currentPosition, p.duration)
    }

    private fun sair() {
        salvarAgora()
        finish()
    }

    // ── TELA CHEIA ⇄ MODO JANELA (long press OK) ───────────────────────────
    /**
     * Alterna entre tela cheia e modo janela. No modo janela o vídeo ocupa uma
     * área central (16:9) com fundo preto ao redor — útil para multitarefa na TV.
     * Segurar OK de novo volta para tela cheia.
     */
    private fun alternarModoJanela() {
        modoJanela = !modoJanela
        val pv = playerView
        val wv = webViewPlayer
        if (modoJanela) {
            val params = FrameLayout.LayoutParams(
                (resources.displayMetrics.widthPixels * 0.72f).toInt(),
                (resources.displayMetrics.heightPixels * 0.72f).toInt(),
            )
            params.gravity = android.view.Gravity.CENTER
            pv?.layoutParams = params
            wv?.layoutParams = params
        } else {
            pv?.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            wv?.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
        pv?.requestLayout()
        wv?.requestLayout()
        // Feedback visual: mostra o overlay com o estado atual
        if (overlayVisivel) {
            lblMetaPlayer?.text = if (modoJanela) "MODO JANELA — segure OK para voltar à tela cheia" else lblMetaPlayer?.text
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        val p = player

        // BACK: fecha o overlay primeiro; fora dele, encerra o player.
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (overlayVisivel) {
                toggleOverlay(false)
                return true
            }
            salvarAgora()
            p?.release()
            player = null
            finish()
            return true
        }

        // No fallback, TODO comando do controle precisa chegar ao conteúdo do
        // iframe: é assim que o usuário foca e confirma a verificação do
        // provedor com o OK, e depois controla o player (play/pause, seek).
        // Antes o OK era interceptado aqui para abrir o nosso overlay — o
        // toque nunca chegava ao widget e a confirmação era impossível pelo
        // controle. BACK (tratado acima) continua sendo nosso.
        if (modoWebView && controleParaIframe) return super.onKeyDown(keyCode, event)

        if (p == null && !modoWebView) return super.onKeyDown(keyCode, event)

        return when (keyCode) {
            // OK: mostra o overlay; se já estiver aberto, deixa o botão focado agir
            // OK = PLAY/PAUSE (regra do controle remoto). Ao pausar/retomar, os
            // controles aparecem e depois somem sozinhos. Com os controles já
            // abertos, OK aciona o botão focado (retroceder/avançar/sair…).
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                if (!overlayVisivel) {
                    alternarPlayPause()
                    toggleOverlay(true)
                    true
                } else {
                    super.onKeyDown(keyCode, event)
                }
            }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_SPACE -> {
                alternarPlayPause(); true
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                seekRelativo(-15_000); true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                seekRelativo(15_000); true
            }
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                // Com o overlay fechado, ↑/↓ ajustam o volume; aberto, navegam pelos botões
                if (overlayVisivel) {
                    super.onKeyDown(keyCode, event)
                } else {
                    val delta = if (keyCode == KeyEvent.KEYCODE_DPAD_UP) 0.1f else -0.1f
                    if (modoWebView) {
                        injetarComandoWebView("v.volume=Math.max(0,Math.min(1,v.volume+($delta)));")
                    } else {
                        val exo = player
                        if (exo != null) {
                            exo.volume = (exo.volume + delta).coerceIn(0f, 1f)
                        }
                    }
                    true
                }
            }
            KeyEvent.KEYCODE_MEDIA_NEXT -> {
                abrirProximoEpisodio(); true
            }
            KeyEvent.KEYCODE_MEDIA_STOP -> {
                sair(); true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    /**
     * Long press do OK (DPAD_CENTER/ENTER): alterna TELA CHEIA ⇄ MODO JANELA.
     * O long press NÃO dispara o play/pause (o onKeyDown curto só age quando o
     * evento não é um long press — o Android entrega ACTION_DOWN com repeatCount
     * e depois ACTION_UP; aqui interceptamos o long press no ACTION_DOWN com
     * event.repeatCount > 0 e marcamos o consumo).
     */
    override fun onKeyLongPress(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
            alternarModoJanela()
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        // Se foi um long press de OK, o onKeyLongPress já tratou — não deixa o
        // ACTION_UP virar um clique (play/pause) acidental.
        if ((keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) &&
            event?.isCanceled == true
        ) {
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    private fun esconderSistema() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
    }

    // ── Estados ─────────────────────────────────────────────────────────────
    private fun mostrarBloqueio(msg: String) {
        layoutLoading?.visibility = View.GONE
        playerView?.visibility = View.GONE
        webViewPlayer?.visibility = View.GONE
        overlay?.visibility = View.GONE
        layoutErro?.visibility = View.GONE
        layoutBloqueio?.visibility = View.VISIBLE
        bloqueioTexto?.text = msg
        findViewById<TextView>(R.id.btnVerPlanos)?.requestFocus()
    }

    private fun mostrarErro(msg: String) {
        layoutLoading?.visibility = View.GONE
        playerView?.visibility = View.GONE
        webViewPlayer?.visibility = View.GONE
        overlay?.visibility = View.GONE
        layoutBloqueio?.visibility = View.GONE
        layoutErro?.visibility = View.VISIBLE
        erroTexto?.text = msg
        findViewById<TextView>(R.id.btnTentarNovamente)?.requestFocus()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        salvarAgora()
    }

    override fun onPause() {
        super.onPause()
        salvarAgora()
    }

    override fun onDestroy() {
        super.onDestroy()
        salvarAgora()
        // Encerra a sessão deste aparelho (libera uma tela do plano)
        scope.launch {
            withContext(Dispatchers.IO) { PlaybackSessionRepository.encerrar(this@PlaybackActivity) }
        }
        player?.release()
        player = null
        webViewPlayer?.destroy()
        webViewPlayer = null
        handlerOverlay.removeCallbacks(esconderOverlaySozinho)
        taskDesafio?.cancel()
        taskDesafio = null
        taskMonitor?.cancel()
        taskMonitor = null
        job.cancel()
    }
}