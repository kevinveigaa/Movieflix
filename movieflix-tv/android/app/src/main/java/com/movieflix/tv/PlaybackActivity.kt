package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
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
 * PLAYER do MovieFlix TV — reprodução nativa (ExoPlayer/Media3), nunca
 * navegador/WebView/iframe.
 *
 * Lógica funcional idêntica à do site/mobile:
 *  - a URL do embed é montada pela MESMA regra (`MediaCatalog.embedUrl` →
 *    StreamBetter filme/série com lang=pt-BR, usando o tmdb_id do catálogo);
 *  - a resolução do stream passa pelo MESMO backend (`/api/streambetter-resolve`)
 *    com o token da sessão, com o mesmo fallback direto;
 *  - o progresso é gravado em `watch_history` com as MESMAS regras de progresso
 *    real do site (`watchProgress.ts`);
 *  - o limite de telas simultâneas usa a MESMA tabela `playback_sessions`.
 *
 * Interface específica de TV (referência visual aprovada):
 *  - vídeo em tela cheia, fundo preto, sem UI do sistema;
 *  - overlay acionado pelo OK com título display, botões-pílula grandes
 *    (retroceder / play-pausar / avançar), barra de progresso em gradiente,
 *    tempos, "Próximo episódio" (séries) e "Sair";
 *  - D-pad: OK mostra/esconde e aciona o botão focado; ←/→ = ±15s;
 *    ↑/↓ navegam pelos controles; BACK fecha o overlay (ou sai).
 */
class PlaybackActivity : AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
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

    // ── Limite de telas (mesma tabela/regra do site) ───────────────────────
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
                val motivo = resolucao.motivo ?: ""
                if (motivo.contains("402") || motivo.contains("assinatura")) {
                    mostrarBloqueio(
                        "Você precisa de uma assinatura ativa para assistir.\n" +
                            "Assine pelo site ou app do MovieFlix e volte aqui.",
                    )
                } else {
                    mostrarErro(
                        "Não foi possível carregar o vídeo agora.\n" +
                            (resolucao.erro ?: motivo.ifBlank { "Erro de rede" }),
                    )
                }
                return@launch
            }
            val u = resolucao.url
            if (!u.startsWith("http://") && !u.startsWith("https://")) {
                mostrarErro("Fonte de vídeo inválida. Tente outro título.")
                return@launch
            }
            iniciarPlayer(u)
        }
    }

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
            mostrarErro("Não foi possível iniciar o player. Tente novamente.")
            return
        }
        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                exo.release()
                player = null
                mostrarErro("Falha na reprodução (${error.errorCodeName}). Tente novamente.")
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

    // ── Progresso: local + watch_history (paridade com o site) ─────────────
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

    // ── Barra de progresso e controles ─────────────────────────────────────
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

    // ── Controles D-pad ────────────────────────────────────────────────────
    private fun toggleOverlay(mostrar: Boolean? = null) {
        val ov = overlay ?: return
        overlayVisivel = mostrar ?: !overlayVisivel
        ov.visibility = if (overlayVisivel) View.VISIBLE else View.GONE
        if (overlayVisivel) {
            atualizarBarra()
            btnPlayPause?.requestFocus()
        } else {
            playerView?.requestFocus()
        }
    }

    private fun seekRelativo(deltaMs: Long) {
        val p = player ?: return
        val destino = (p.currentPosition + deltaMs).coerceAtLeast(0L)
        p.seekTo(destino)
        atualizarBarra()
    }

    private fun alternarPlayPause() {
        val p = player ?: return
        if (p.isPlaying) p.pause() else p.play()
        atualizarBarra()
    }

    private fun salvarAgora() {
        val p = player ?: return
        salvarProgresso(p.currentPosition, p.duration)
    }

    private fun sair() {
        salvarAgora()
        finish()
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

        if (p == null) return super.onKeyDown(keyCode, event)

        return when (keyCode) {
            // OK: mostra o overlay; se já estiver aberto, deixa o botão focado agir
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                if (!overlayVisivel) {
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
                    p.volume = (p.volume + delta).coerceIn(0f, 1f)
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

    // ── Estados ────────────────────────────────────────────────────────────
    private fun mostrarBloqueio(msg: String) {
        layoutLoading?.visibility = View.GONE
        playerView?.visibility = View.GONE
        overlay?.visibility = View.GONE
        layoutErro?.visibility = View.GONE
        layoutBloqueio?.visibility = View.VISIBLE
        bloqueioTexto?.text = msg
        findViewById<TextView>(R.id.btnVerPlanos)?.requestFocus()
    }

    private fun mostrarErro(msg: String) {
        layoutLoading?.visibility = View.GONE
        playerView?.visibility = View.GONE
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
        job.cancel()
    }
}
