package com.movieflix.tv

import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.leanback.app.PlaybackSupportFragment
import androidx.leanback.widget.Action
import androidx.leanback.widget.ArrayObjectAdapter
import androidx.leanback.widget.ClassPresenterSelector
import androidx.leanback.widget.ControlButtonPresenterSelector
import androidx.leanback.widget.OnActionClickedListener
import androidx.leanback.widget.PlaybackControlsRow
import androidx.leanback.widget.PlaybackSeekUi
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
 * OK = play/pause, ←/→ = seek, ↑/↓ = volume, BACK = sair.
 * O stream só é montado após o BACKEND validar a assinatura
 * (server-side). Sem assinatura → tela de bloqueio com os planos.
 */
class PlaybackActivity : AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var bloqueio: View? = null
    private var progresso: ProgressBar? = null
    private var erroTexto: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_playback)

        playerView = findViewById(R.id.playerView)
        bloqueio = findViewById(R.id.layoutBloqueio)
        progresso = findViewById(R.id.progresso)
        erroTexto = findViewById(R.id.lblErroPlayer)
        val btnAssinar = findViewById<android.widget.Button>(R.id.btnAssinar)
        val btnSair = findViewById<android.widget.Button>(R.id.btnSair)

        val movieId = intent.getStringExtra("movie_id")
        val movie = movieId?.let { CatalogRepository.porId(this, it) }

        if (movie == null) {
            mostrarBloqueio("Título não encontrado no catálogo.")
            return
        }

        btnAssinar.setOnClickListener { finish() } // volta para navegar; assinatura é feita no site/app normal
        btnSair.setOnClickListener { finish() }

        val embed = movie.embedUrl
        if (embed.isBlank()) {
            mostrarBloqueio("Este título ainda não possui fonte de vídeo.")
            return
        }

        // 1) Tenta resolver o stream no backend (valida assinatura no servidor)
        scope.launch {
            val token = withContext(Dispatchers.IO) { AuthRepository.loadToken(this@PlaybackActivity) }
            if (token.isNullOrBlank()) {
                mostrarBloqueio("Faça login para assistir. Use a mesma conta do site.")
                return@launch
            }
            val resolucao = withContext(Dispatchers.IO) {
                StreamResolver.resolve(embed, token)
            }
            if (!resolucao.success || resolucao.url.isNullOrBlank()) {
                mostrarBloqueio(
                    "Você precisa de uma assinatura ativa para assistir. " +
                        "Assine pelo site ou app do MovieFlix e volte aqui.",
                )
                return@launch
            }
            iniciarPlayer(resolucao.url)
        }
    }

    private fun iniciarPlayer(url: String) {
        val pv = playerView ?: return
        val exo = ExoPlayer.Builder(this).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            playWhenReady = true
            prepare()
        }
        player = exo
        pv.player = exo
        progresso?.visibility = View.GONE
        bloqueio?.visibility = View.GONE
        pv.visibility = View.VISIBLE
        pv.requestFocus()
    }

    private fun mostrarBloqueio(msg: String) {
        progresso?.visibility = View.GONE
        playerView?.visibility = View.GONE
        bloqueio?.visibility = View.VISIBLE
        erroTexto?.text = msg
    }

    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        val p = player ?: return super.onKeyDown(keyCode, event)
        return when (keyCode) {
            android.view.KeyEvent.KEYCODE_DPAD_LEFT -> {
                p.seekTo((p.currentPosition - 15000).coerceAtLeast(0)); true
            }
            android.view.KeyEvent.KEYCODE_DPAD_RIGHT -> {
                p.seekTo(p.currentPosition + 15000); true
            }
            android.view.KeyEvent.KEYCODE_DPAD_UP -> {
                p.volume = (p.volume + 0.1f).coerceAtMost(1f); true
            }
            android.view.KeyEvent.KEYCODE_DPAD_DOWN -> {
                p.volume = (p.volume - 0.1f).coerceAtLeast(0f); true
            }
            android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            android.view.KeyEvent.KEYCODE_SPACE,
            android.view.KeyEvent.KEYCODE_DPAD_CENTER,
            android.view.KeyEvent.KEYCODE_ENTER,
            -> {
                if (p.isPlaying) p.pause() else p.play()
                true
            }
            android.view.KeyEvent.KEYCODE_MEDIA_STOP,
            android.view.KeyEvent.KEYCODE_BACK,
            -> {
                p.release()
                player = null
                finish()
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
        job.cancel()
    }
}
