package com.movieflix.tv

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import java.util.concurrent.Executors

/**
 * PLAYER da TV.
 *
 * Duas camadas, como o site:
 *  1. NATIVO (ExoPlayer/Media3): quando o backend devolve uma fonte direta
 *     (HLS/MP4), toca com controles de TV e SALVA O PROGRESSO real.
 *  2. WEB (WebView): fallback para os embeds que dependem de JavaScript,
 *     iframe, verificacao/Cloudflare/Turnstile. Preserva a compatibilidade
 *     exata do player web — nada e reescrito.
 *
 * Controle remoto:
 *  OK / DPAD_CENTER  -> mostrar/ocultar controles e dar play
 *  PLAY/PAUSE        -> play/pause
 *  ESQUERDA/DIREITA  -> retroceder/avancar 10s (ou focar botao)
 *  MEDIA_NEXT        -> proximo episodio
 *  MEDIA_STOP / BACK -> sair
 */
@UnstableApi
class PlayerActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())

    private var movie: Movie? = null
    private var embedUrl: String = ""
    private var season: Int? = null
    private var episode: Int? = null
    private var posicaoInicial: Int = 0

    private lateinit var raizFrame: FrameLayout
    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var webView: WebView? = null
    private lateinit var controles: LinearLayout
    private lateinit var tituloOverlay: TextView
    private lateinit var tempoOverlay: TextView
    private lateinit var botaoProximo: TextView

    private var controlesVisiveis = true
    private var modoWeb = false
    private var ultimoSalvo = 0L

    private val salvador = object : Runnable {
        override fun run() {
            salvarProgresso()
            handler.postDelayed(this, 10_000L)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        telaCheia()

        val id = intent.getStringExtra("movie_id")
        movie = id?.let { CatalogRepository.porId(this, it) }
        embedUrl = intent.getStringExtra("embed_url") ?: ""
        val s = intent.getIntExtra("season", -1)
        val e = intent.getIntExtra("episode", -1)
        season = if (s > 0) s else null
        episode = if (e > 0) e else null
        posicaoInicial = intent.getIntExtra("posicao", 0)

        raizFrame = FrameLayout(this)
        raizFrame.setBackgroundColor(Color.BLACK)
        conteudo(raizFrame)

        montarOverlay()
        carregarTitulo()
        tentarNativo()
    }

    private fun telaCheia() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }

    private fun carregarTitulo() {
        val m = movie
        tituloOverlay.text = m?.title ?: "Reproduzindo"
    }

    // ── Camada NATIVA ──

    private fun tentarNativo() {
        val fonte = embedUrl
        if (fonte.isBlank()) { abrirModoWeb("Este titulo nao possui fonte de video configurada."); return }

        val pv = PlayerView(this)
        pv.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        pv.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
        pv.useController = false
        raizFrame.addView(pv, 0)
        playerView = pv

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(androidx.media3.exoplayer.source.DefaultMediaSourceFactory(StreamResolver.dataSourceFactory()))
            .build()
        player = exo
        pv.player = exo

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) { aoTerminar() }
            }
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                // Fonte direta falhou: cai para o modo WEB (embed original).
                abrirModoWeb(error.message ?: "Falha ao reproduzir a fonte direta.")
            }
        })

        handler.post { atualizarTempo() }
        handler.postDelayed(salvador, 10_000L)

        executor.execute {
            val token = AuthRepository.validToken(this)
            val r = StreamResolver.resolve(fonte, token)
            runOnUiThread {
                if (r.success && !r.url.isNullOrBlank()) {
                    val item = MediaItem.fromUri(r.url!!)
                    exo.setMediaItem(item)
                    if (posicaoInicial > 0) exo.seekTo(posicaoInicial * 1000L)
                    exo.prepare()
                    exo.playWhenReady = true
                } else {
                    abrirModoWeb(r.erro ?: "Nenhuma fonte direta disponivel para este titulo.")
                }
            }
        }
    }

    // ── Camada WEB (embeds com JavaScript / verificacao) ──

    @SuppressLint("SetJavaScriptEnabled")
    private fun abrirModoWeb(motivo: String) {
        if (modoWeb) return
        modoWeb = true

        try { player?.release() } catch (_: Exception) {}
        player = null
        playerView?.let { raizFrame.removeView(it) }
        playerView = null

        val wv = WebView(this)
        wv.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        wv.setBackgroundColor(Color.BLACK)

        val s: WebSettings = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.javaScriptCanOpenWindowsAutomatically = true
        s.setSupportMultipleWindows(false)
        s.userAgentString = s.userAgentString + " MovieFlixTV/4.0"
        if (android.os.Build.VERSION.SDK_INT >= 21) s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        android.webkit.CookieManager.getInstance().setAcceptCookie(true)
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)

        wv.webChromeClient = WebChromeClient()
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // Links externos (WhatsApp/telefone/e-mail) abrem FORA do player; o
                // restante da navegacao do embed segue normalmente dentro do WebView.
                if (url.startsWith("whatsapp://") || url.startsWith("tel:") || url.startsWith("mailto:") ||
                    url.startsWith("intent:") || url.contains("wa.me")
                ) {
                    try {
                        startActivity(
                            android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    } catch (_: Exception) { }
                    return true
                }
                return false
            }
        }

        raizFrame.addView(wv, 0)
        webView = wv

        if (embedUrl.isNotBlank()) {
            // CAUSA RAIZ CORRIGIDA (erro "Este link so funciona dentro de um iframe"):
            // o provedor de embed so entrega o video quando a pagina e carregada
            // DENTRO DE UM IFRAME. O site faz exatamente isso
            // (StreamBetterEmbed.tsx -> <iframe src={embedUrl}>); a TV carregava a
            // URL NO TOPO do WebView, e por isso o provedor respondia com a tela de
            // bloqueio "Copiar codigo do iframe". Aqui reproduzimos a MESMA condicao
            // do site: a URL entra como `src` de um <iframe> do tamanho da tela e o
            // documento base e a propria URL do embed (mesma origem => o provedor
            // reconhece o enquadramento).
            wv.loadDataWithBaseURL(embedUrl, paginaComIframe(embedUrl), "text/html", "UTF-8", null)
        } else {
            val html = "<html><body style='background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center'><div><h2>Nao foi possivel reproduzir</h2><p>$motivo</p></div></body></html>"
            wv.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        }
        mostrarControles()
    }

    // ── Overlay de controles (controle remoto) ──

    /**
     * Documento minimo que carrega o embed DENTRO DE UM IFRAME — a mesma estrutura
     * usada pelo player do site. Sem isto o provedor devolve a tela de bloqueio
     * "Este link so funciona dentro de um iframe" e o usuario nao assiste nada.
     */
    private fun paginaComIframe(url: String): String {
        val alvo = url.replace("\"", "%22")
        return """<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body><iframe src="$alvo" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></body></html>"""
    }

    private fun montarOverlay() {
        controles = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.BOTTOM
            setPadding(TvUi.dp(this@PlayerActivity, 34), TvUi.dp(this@PlayerActivity, 20), TvUi.dp(this@PlayerActivity, 34), TvUi.dp(this@PlayerActivity, 24))
            background = TvUi.gradiente(0x00000000, 0xE6050505.toInt())
        }
        val lp = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.gravity = Gravity.BOTTOM
        controles.layoutParams = lp

        tituloOverlay = TvUi.texto(this, "", 20f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        controles.addView(tituloOverlay)

        tempoOverlay = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_gray_light))
        tempoOverlay.setPadding(0, TvUi.dp(this, 4), 0, TvUi.dp(this, 10))
        controles.addView(tempoOverlay)

        val linhaBotoes = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

        val bRetroceder = TvUi.botao(this, "⏪  10s")
        bRetroceder.setOnClickListener { retroceder() }
        linhaBotoes.addView(bRetroceder)

        val bPlay = TvUi.botao(this, "⏯  Play/Pause", primario = true)
        bPlay.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@PlayerActivity, 12) }
        bPlay.setOnClickListener { playPause() }
        linhaBotoes.addView(bPlay)

        val bAvancar = TvUi.botao(this, "10s  ⏩")
        bAvancar.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@PlayerActivity, 12) }
        bAvancar.setOnClickListener { avancar() }
        linhaBotoes.addView(bAvancar)

        botaoProximo = TvUi.botao(this, "⏭  Proximo")
        botaoProximo.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@PlayerActivity, 12) }
        botaoProximo.setOnClickListener { proximoEpisodio() }
        botaoProximo.visibility = if (movie?.ehSerie == true) View.VISIBLE else View.GONE
        linhaBotoes.addView(botaoProximo)

        val bSair = TvUi.botao(this, "⏹  Sair")
        bSair.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@PlayerActivity, 12) }
        bSair.setOnClickListener { sair() }
        linhaBotoes.addView(bSair)

        controles.addView(linhaBotoes)
        raizFrame.addView(controles)
    }

    private fun mostrarControles() {
        controlesVisiveis = true
        controles.visibility = View.VISIBLE
        controles.animate().alpha(1f).setDuration(150).start()
        controles.post { garantiFocoBotao() }
    }

    private fun esconderControles() {
        controlesVisiveis = false
        controles.animate().alpha(0f).setDuration(200).withEndAction { controles.visibility = View.GONE }.start()
    }

    private fun alternarControles() {
        if (controlesVisiveis) esconderControles() else mostrarControles()
    }

    private fun garantiFocoBotao() {
        if (controles.childCount >= 3) {
            val linha = controles.getChildAt(2) as? LinearLayout
            linha?.getChildAt(1)?.requestFocus()
        }
    }

    private fun atualizarTempo() {
        val p = player
        if (p == null) { handler.postDelayed({ atualizarTempo() }, 1000L); return }
        val pos = (p.currentPosition / 1000).toInt()
        val dur = (p.duration.coerceAtLeast(0L) / 1000).toInt()
        tempoOverlay.text = "${fmt(pos)} / ${if (dur > 0) fmt(dur) else "--:--"}" + if (modoWeb) "  •  modo web" else ""
        handler.postDelayed({ atualizarTempo() }, 1000L)
    }

    private fun fmt(seg: Int): String {
        val h = seg / 3600
        val m = (seg % 3600) / 60
        val s = seg % 60
        return if (h > 0) String.format("%d:%02d:%02d", h, m, s) else String.format("%02d:%02d", m, s)
    }

    // ── Acoes ──

    private fun playPause() {
        val p = player ?: run { alternarControles(); return }
        if (p.isPlaying) p.pause() else p.play()
        mostrarControles()
    }

    private fun avancar() {
        val p = player ?: return mostrarControles()
        p.seekTo((p.currentPosition + 10_000L).coerceAtMost(p.duration.coerceAtLeast(0L)))
        mostrarControles()
    }

    private fun retroceder() {
        val p = player ?: return mostrarControles()
        p.seekTo((p.currentPosition - 10_000L).coerceAtLeast(0L))
        mostrarControles()
    }

    private fun proximoEpisodio() {
        val m = movie
        if (m == null || !m.ehSerie) { TvUi.aviso(this, "Nao ha proximo episodio."); return }
        val temporadas = MediaCatalog.temporadas(m)
        val epsAtual = MediaCatalog.episodios(m, season ?: 1)
        val prox = EpisodeNavigation.proximo(temporadas, epsAtual, season ?: 1, episode ?: 1) ?: run {
            TvUi.aviso(this, "Fim da serie."); return
        }
        val epsDestino = MediaCatalog.episodios(m, prox.season)
        persistirProgressoFinal()
        startActivity(
            android.content.Intent(this, PlayerActivity::class.java)
                .putExtra("movie_id", m.id)
                .putExtra("embed_url", MediaCatalog.embedUrl(m, prox.season, prox.episode))
                .putExtra("season", prox.season)
                .putExtra("episode", prox.episode),
        )
        finish()
    }

    private fun aoTerminar() {
        persistirProgressoFinal()
        val autoNext = getSharedPreferences("mf_settings", MODE_PRIVATE).getBoolean(SettingsActivity.CHAVE_AUTO_NEXT, true)
        if (autoNext && movie?.ehSerie == true) proximoEpisodio() else finish()
    }

    private fun sair() {
        persistirProgressoFinal()
        finish()
    }

    private fun salvarProgresso() {
        val p = player ?: return
        val m = movie ?: return
        val pos = (p.currentPosition / 1000).toInt()
        val dur = (p.duration.coerceAtLeast(0L) / 1000).toInt()
        if (pos < 5) return
        WatchHistoryRepository.upsert(
            this,
            WatchHistoryRepository.UpsertArgs(m, pos, dur, season, episode),
        )
        ultimoSalvo = System.currentTimeMillis()
    }

    private fun persistirProgressoFinal() {
        salvarProgresso()
    }

    // ── Teclas ──

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                if (controlesVisiveis) {
                    val focado = controles.findFocus()
                    if (focado == null) { playPause(); return true }
                    return super.onKeyDown(keyCode, event)
                }
                mostrarControles(); return true
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                if (controlesVisiveis && controles.findFocus() != null) return super.onKeyDown(keyCode, event)
                retroceder(); return true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                if (controlesVisiveis && controles.findFocus() != null) return super.onKeyDown(keyCode, event)
                avancar(); return true
            }
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (!controlesVisiveis) { mostrarControles(); return true }
                return super.onKeyDown(keyCode, event)
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun aoPlayPause(): Boolean { playPause(); return true }
    override fun aoProximo(): Boolean { if (movie?.ehSerie == true) { proximoEpisodio(); return true }; return false }
    override fun aoAnterior(): Boolean { retroceder(); return true }
    override fun aoParar(): Boolean { sair(); return true }

    override fun onResume() { super.onResume(); telaCheia() }

    override fun onPause() {
        super.onPause()
        player?.pause()
        salvarProgresso()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
        salvarProgresso()
        try { player?.release() } catch (_: Exception) {}
        player = null
        try {
            webView?.let { wv ->
                wv.loadUrl("about:blank")
                (wv.parent as? ViewGroup)?.removeView(wv)
                wv.destroy()
            }
        } catch (_: Exception) {}
        webView = null
    }
}
