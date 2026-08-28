package com.movieflix.tv

import android.os.Bundle
import android.view.KeyEvent
import android.view.View
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
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Player nativo (ExoPlayer/Media3) com controles Leanback via D-pad:
 * OK = play/pause, ←/→ = seek ±15s, ↑/↓ = volume, BACK = sair.
 *
 * O stream SÓ é montado após o BACKEND validar a assinatura (server-side).
 * Sem assinatura → tela de bloqueio com os planos. Erro → tela com "Tentar de novo".
 * A barra de controles nativa do Media3 (progresso, play/pause, seek) é
 * acionada pelo botão OK central.
 */
class PlaybackActivity : AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var layoutLoading: View? = null
    private var layoutErro: View? = null
    private var layoutBloqueio: View? = null
    private var erroTexto: TextView? = null
    private var bloqueioTexto: TextView? = null

    private var embedUrl: String = ""
    private var retomadaSegundos: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_playback)

        playerView = findViewById(R.id.playerView)
        layoutLoading = findViewById(R.id.layoutLoading)
        layoutErro = findViewById(R.id.layoutErro)
        layoutBloqueio = findViewById(R.id.layoutBloqueio)
        erroTexto = findViewById(R.id.lblErroPlayer)
        bloqueioTexto = findViewById(R.id.lblBloqueio)
        val btnTentar = findViewById<android.widget.Button>(R.id.btnTentarNovamente)
        val btnSairErro = findViewById<android.widget.Button>(R.id.btnSairErro)
        val btnSair = findViewById<android.widget.Button>(R.id.btnSair)

        val movieId = intent.getStringExtra("movie_id")
        val movie = movieId?.let { CatalogRepository.porId(this, it) }

        if (movie == null) {
            mostrarBloqueio("Título não encontrado no catálogo.")
            return
        }

        // retomada local (posição salva em execuções anteriores)
        retomadaSegundos = ProgressRepository.carregar(this, movie.id)

        // monta embed: filme usa video_url/tmdb; série usa tmdb_id + temporada/episódio
        embedUrl = montarEmbed(movie)
        if (embedUrl.isBlank()) {
            mostrarBloqueio("Este título ainda não possui fonte de vídeo.")
            return
        }

        btnTentar.setOnClickListener { resolverEIniciar(movie.id) }
        btnSairErro.setOnClickListener { finish() }
        btnSair.setOnClickListener { finish() }

        resolverEIniciar(movie.id)
    }

    /** Monta a URL do embed StreamBetter (mesma regra do site). */
    private fun montarEmbed(movie: Movie): String {
        if (movie.ehSerie) {
            val tmdb = movie.tmdbIdNumerico ?: return ""
            val s = intent.getIntExtra("season", 1).coerceAtLeast(1)
            val e = intent.getIntExtra("episode", 1).coerceAtLeast(1)
            return "https://streambetter.shop/serie/$tmdb/$s/$e?lang=pt-BR"
        }
        if (movie.video_url.isNotBlank()) return movie.video_url
        val tmdb = movie.tmdbIdNumerico ?: return ""
        return "https://streambetter.shop/filme/$tmdb?lang=pt-BR"
    }

    private fun resolverEIniciar(movieId: String) {
        if (embedUrl.isBlank()) return
        layoutErro?.visibility = View.GONE
        layoutBloqueio?.visibility = View.GONE
        layoutLoading?.visibility = View.VISIBLE
        playerView?.visibility = View.GONE

        scope.launch {
            val token = withContext(Dispatchers.IO) { AuthRepository.loadToken(this@PlaybackActivity) }
            if (token.isNullOrBlank()) {
                mostrarBloqueio("Faça login para assistir. Use a mesma conta do site.")
                return@launch
            }
            val resolucao = withContext(Dispatchers.IO) {
                StreamResolver.resolve(embedUrl, token)
            }
            if (!resolucao.success || resolucao.url.isNullOrBlank()) {
                if (resolucao.motivo == "http_402" || resolucao.motivo?.contains("assinatura") == true) {
                    mostrarBloqueio(
                        "Você precisa de uma assinatura ativa para assistir.\n" +
                            "Assine pelo site ou app do MovieFlix e volte aqui.",
                    )
                } else {
                    mostrarErro(
                        "Não foi possível carregar o vídeo agora.\n" +
                            (resolucao.erro ?: resolucao.motivo ?: "Erro de rede"),
                    )
                }
                return@launch
            }
            // Garantia: só reproduz se for HLS/MP4 direto. Nunca abre navegador/WebView.
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
            // Nunca sai do app: qualquer falha na criação do player vira tela de erro.
            mostrarErro("Não foi possível iniciar o player. Tente novamente.")
            return
        }
        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                exo.release()
                player = null
                mostrarErro("Falha na reprodução (${error.errorCodeName}). Tente novamente.")
            }
        })
        player = exo
        pv.player = exo
        layoutLoading?.visibility = View.GONE
        layoutBloqueio?.visibility = View.GONE
        layoutErro?.visibility = View.GONE
        pv.visibility = View.VISIBLE
        pv.requestFocus()

        // salva retomada (posição) periodicamente enquanto assiste
        scope.launch {
            while (true) {
                kotlinx.coroutines.delay(10_000)
                val p = player ?: break
                val pos = p.currentPosition
                val dur = p.duration
                if (dur > 0 && pos > 60_000 && pos < dur - 30_000) {
                    ProgressRepository.salvar(this@PlaybackActivity, movieIdAtual(), pos)
                }
            }
        }
    }

    private fun movieIdAtual(): String = intent.getStringExtra("movie_id") ?: ""

    private fun mostrarBloqueio(msg: String) {
        layoutLoading?.visibility = View.GONE
        playerView?.visibility = View.GONE
        layoutErro?.visibility = View.GONE
        layoutBloqueio?.visibility = View.VISIBLE
        bloqueioTexto?.text = msg
    }

    private fun mostrarErro(msg: String) {
        layoutLoading?.visibility = View.GONE
        playerView?.visibility = View.GONE
        layoutBloqueio?.visibility = View.GONE
        layoutErro?.visibility = View.VISIBLE
        erroTexto?.text = msg
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        val p = player ?: return super.onKeyDown(keyCode, event)
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                p.seekTo((p.currentPosition - 15000).coerceAtLeast(0)); true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                p.seekTo(p.currentPosition + 15000); true
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                p.volume = (p.volume + 0.1f).coerceAtMost(1f); true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                p.volume = (p.volume - 0.1f).coerceAtLeast(0f); true
            }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_SPACE,
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            -> {
                if (p.isPlaying) p.pause() else p.play()
                true
            }
            KeyEvent.KEYCODE_MEDIA_STOP,
            KeyEvent.KEYCODE_BACK,
            -> {
                p.release()
                player = null
                finish()
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // salva posição ao sair (BACK ou tecla Home)
        val p = player ?: return
        val pos = p.currentPosition
        val dur = p.duration
        if (dur > 0 && pos > 60_000 && pos < dur - 30_000) {
            ProgressRepository.salvar(this, movieIdAtual(), pos)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
        job.cancel()
    }
}
