package com.movieflix.tv

import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
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
 * Player nativo (ExoPlayer/Media3) com controles Leanback via D-pad.
 *
 * Comandos do controle remoto (todos acionam o player REAL):
 *  - OK / ENTER .......... aciona o controle que está REALMENTE focado
 *                          (por padrão o botão Play/Pause → play()/pause() reais)
 *  - SETA DIREITA (→) .... avança exatamente 30s (currentPosition + 30s, limitado à duração)
 *  - SETA ESQUERDA (←) ... volta exatamente 30s (currentPosition - 30s, limitado a 0)
 *  - SETA CIMA (↑) ....... move o foco para o controle acima
 *  - SETA BAIXO (↓) ...... move o foco para o controle abaixo
 *  - PLAY/PAUSE físico ... alterna play/pause no vídeo real
 *  - BACK ................ sai do player e volta à tela anterior
 *
 * O stream SÓ é montado após o BACKEND validar a assinatura (server-side).
 * Sem assinatura → tela de bloqueio com os planos. Erro → tela com "Tentar de novo".
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

    // Controles focáveis do player (acionados pelo controle remoto)
    private var controlsBar: LinearLayout? = null
    private var btnPlayPause: Button? = null
    private var btnRew30: Button? = null
    private var btnFwd30: Button? = null
    private var btnVoltar: Button? = null

    private var embedUrl: String = ""
    private var retomadaSegundos: Long = 0L

    /** IDs dos controles que podem receber foco (para saber se o OK deve acioná-los). */
    private val idsControles = intArrayOf(
        R.id.btnPlayPause,
        R.id.btnRew30,
        R.id.btnFwd30,
        R.id.btnVoltar,
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_playback)

        playerView = findViewById(R.id.playerView)
        layoutLoading = findViewById(R.id.layoutLoading)
        layoutErro = findViewById(R.id.layoutErro)
        layoutBloqueio = findViewById(R.id.layoutBloqueio)
        erroTexto = findViewById(R.id.lblErroPlayer)
        bloqueioTexto = findViewById(R.id.lblBloqueio)
        val btnTentar = findViewById<Button>(R.id.btnTentarNovamente)
        val btnSairErro = findViewById<Button>(R.id.btnSairErro)
        val btnSair = findViewById<Button>(R.id.btnSair)

        controlsBar = findViewById(R.id.controlsBar)
        btnPlayPause = findViewById(R.id.btnPlayPause)
        btnRew30 = findViewById(R.id.btnRew30)
        btnFwd30 = findViewById(R.id.btnFwd30)
        btnVoltar = findViewById(R.id.btnVoltar)

        // Cada controle executa a AÇÃO REAL no player (não é só estado visual).
        btnPlayPause?.setOnClickListener { alternarPlayPause() }
        btnRew30?.setOnClickListener { voltar30() }
        btnFwd30?.setOnClickListener { avancar30() }
        btnVoltar?.setOnClickListener { sair() }

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

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                atualizarBotaoPlayPause()
            }
        })
        player = exo
        pv.player = exo
        layoutLoading?.visibility = View.GONE
        layoutBloqueio?.visibility = View.GONE
        layoutErro?.visibility = View.GONE
        pv.visibility = View.VISIBLE

        // Mostra os controles e foca o Play/Pause (o OK aciona o controle focado).
        mostrarControles()

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

    // ───────────────────────── Ações REAIS no player ─────────────────────────

    /** Alterna play/pause no vídeo real (mesma ação do botão Play/Pause). */
    private fun alternarPlayPause() {
        val p = player ?: return
        if (p.isPlaying) p.pause() else p.play()
        atualizarBotaoPlayPause()
    }

    /** Avança exatamente 30s no vídeo real, sem ultrapassar a duração. */
    private fun avancar30() {
        val p = player ?: return
        val alvo = p.currentPosition + 30_000L
        val dur = p.duration
        p.seekTo(if (dur > 0) alvo.coerceAtMost(dur) else alvo)
    }

    /** Volta exatamente 30s no vídeo real, sem ficar abaixo de 0. */
    private fun voltar30() {
        val p = player ?: return
        p.seekTo((p.currentPosition - 30_000L).coerceAtLeast(0L))
    }

    /** Sai do player e retorna à tela anterior. */
    private fun sair() {
        salvarProgresso()
        player?.release()
        player = null
        finish()
    }

    private fun atualizarBotaoPlayPause() {
        val p = player
        val tocando = p?.isPlaying == true
        btnPlayPause?.text = if (tocando) "⏸ PAUSAR" else "▶ REPRODUZIR"
    }

    // ───────────────────────── Controles / foco ─────────────────────────

    private fun controlesVisiveis(): Boolean = controlsBar?.visibility == View.VISIBLE

    private fun mostrarControles() {
        controlsBar?.visibility = View.VISIBLE
        atualizarBotaoPlayPause()
        // O botão Play/Pause recebe o foco por padrão (OK = play/pause).
        btnPlayPause?.requestFocus()
    }

    private fun focoEmControle(): Boolean {
        val foco = currentFocus ?: return false
        return foco.id in idsControles
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

    // ───────────────────────── Teclas do controle remoto ─────────────────────────

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (player == null) return super.dispatchKeyEvent(event)
        val down = event.action == KeyEvent.ACTION_DOWN

        when (event.keyCode) {
            // OK / ENTER: aciona o controle REALMENTE focado (por padrão Play/Pause).
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER,
            -> {
                if (down) {
                    if (controlesVisiveis() && focoEmControle()) {
                        currentFocus?.performClick() // aciona o botão focado (ação real)
                    } else {
                        // Sem controle focado: OK age como Play/Pause real.
                        alternarPlayPause()
                    }
                }
                return true
            }

            // PLAY/PAUSE físico do controle: alterna play/pause no vídeo real.
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_SPACE,
            -> {
                if (down) alternarPlayPause()
                return true
            }

            // Teclas de mídia dedicadas (alguns controles enviam PLAY/PAUSE separados).
            KeyEvent.KEYCODE_MEDIA_PLAY -> {
                if (down) { player?.play(); atualizarBotaoPlayPause() }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                if (down) { player?.pause(); atualizarBotaoPlayPause() }
                return true
            }

            // → avança exatamente 30s no vídeo real.
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                if (down || event.repeatCount > 0) avancar30()
                return true
            }

            // ← volta exatamente 30s no vídeo real.
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                if (down || event.repeatCount > 0) voltar30()
                return true
            }

            // ↑/↓ movem o foco entre os controles (navegação real de foco).
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            -> {
                if (controlesVisiveis()) {
                    // Deixa o framework mover o foco entre os botões reais.
                    return super.dispatchKeyEvent(event)
                }
                if (down) mostrarControles()
                return true
            }

            // BACK sai do player e volta à tela anterior.
            KeyEvent.KEYCODE_BACK,
            KeyEvent.KEYCODE_MEDIA_STOP,
            -> {
                if (down) sair()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun salvarProgresso() {
        val p = player ?: return
        val pos = p.currentPosition
        val dur = p.duration
        if (dur > 0 && pos > 60_000 && pos < dur - 30_000) {
            ProgressRepository.salvar(this, movieIdAtual(), pos)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // salva posição ao sair (BACK ou tecla Home)
        salvarProgresso()
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
        job.cancel()
    }
}
