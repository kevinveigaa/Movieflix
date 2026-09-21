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

    /** Recargas feitas para sair da verificação do provedor (limite: 2). */
    private var tentativasDesafio = 0

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
        // O embed oficial do StreamBetter (mesmo do site/mobile), com a chave
        // pública do plano Creator já anexada por MediaCatalog.embedUrl().
        wv.loadUrl(embedUrl)
        atualizarProximoEpisodio()
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
        wv.evaluateJavascript(
            "(function(){" +
                "var v=document.querySelector('video')||document.querySelector('iframe');" +
                "var b=document.body?document.body.innerText:'';" +
                "var des=b.indexOf('humano')>=0||b.indexOf('Just a moment')>=0" +
                "||b.indexOf('Verificando')>=0||b.indexOf('verifying')>=0;" +
                "return (v?'player':'desafio');" +
                "})();",
        ) { resultado ->
            val texto = resultado ?: return@evaluateJavascript
            if (texto.contains("desafio") && tentativasDesafio < 2) {
                tentativasDesafio++
                // Uma recarga curta: o cookie de liberação já foi gravado.
                layoutLoading?.visibility = View.VISIBLE
                wv.postDelayed({ wv.reload() }, 1500)
            }
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
            ExoPlayer.Builder(this).build().apply {
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
        job.cancel()
    }
}