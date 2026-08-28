package com.movieflix.tv

import android.content.Intent
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.bumptech.glide.request.RequestOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Detalhes do título — tela NATIVA customizada (sem o frágil
 * FullWidthDetailsOverviewRowPresenter do Leanback, que causava crash
 * ao clicar em um filme).
 *
 * Layout: backdrop + poster + título + meta + sinopse + botões
 * [ASSISTIR] e [MINHA LISTA] (e seletor de temporada/episódio p/ séries).
 * Navegação 100% D-pad: ↑↓ rola, ←→ entre botões, OK ativa, Voltar retorna.
 */
class DetailsActivity : AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var movie: Movie

    // estado do seletor de episódio
    private var temporadas: List<Int> = emptyList()
    private var temporadaAtual: Int = 1
    private var episodiosTemporada: List<Int> = emptyList()
    private var episodioAtual: Int = 1
    private var naLista: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val movieId = intent.getStringExtra("movie_id")
        val m = movieId?.let { CatalogRepository.porId(this, it) }
        if (m == null) {
            finish()
            return
        }
        movie = m
        setContentView(R.layout.activity_details)

        val btnAssistir = findViewById<Button>(R.id.btnAssistir)
        val btnLista = findViewById<Button>(R.id.btnMinhaLista)
        val btnTempAnt = findViewById<Button>(R.id.btnTempAnt)
        val btnTempProx = findViewById<Button>(R.id.btnTempProx)
        val btnEpAnt = findViewById<Button>(R.id.btnEpAnt)
        val btnEpProx = findViewById<Button>(R.id.btnEpProx)

        preencherDados()

        btnAssistir.setOnClickListener { abrirPlayer() }
        btnLista.setOnClickListener { alternarLista() }
        btnTempAnt.setOnClickListener { trocarTemporada(-1) }
        btnTempProx.setOnClickListener { trocarTemporada(+1) }
        btnEpAnt.setOnClickListener { trocarEpisodio(-1) }
        btnEpProx.setOnClickListener { trocarEpisodio(+1) }

        // Botão Voltar (topo esquerdo, como o site)
        findViewById<View>(R.id.btnVoltar)?.setOnClickListener { finish() }

        // Foco inicial no botão ASSISTIR (controle remoto)
        btnAssistir.requestFocus()

        carregarEstadoLista()
    }

    private fun preencherDados() {
        val titulo = findViewById<TextView>(R.id.detTitulo)
        val meta = findViewById<TextView>(R.id.detMeta)
        val sinopse = findViewById<TextView>(R.id.detSinopse)
        val poster = findViewById<ImageView>(R.id.detPoster)
        val backdrop = findViewById<ImageView>(R.id.detBackdrop)
        val badge = findViewById<TextView>(R.id.detBadge)

        titulo.text = movie.title

        val tipo = if (movie.ehSerie) "Série" else "Filme"
        val ano = movie.ano.ifBlank { "—" }
        val nota = movie.nota
        val qual = movie.qualidade()
        val idioma = movie.language.ifBlank { "pt-BR" }
        val genero = movie.categorias.firstOrNull()?.takeIf { it != "Outros" } ?: ""
        val dur = if (!movie.ehSerie && movie.duration != null && movie.duration!! > 0) {
            " • ${movie.duration!! / 60} min"
        } else ""

        val partes = mutableListOf<String>()
        partes.add(tipo)
        partes.add(ano)
        if (genero.isNotBlank()) partes.add(genero)
        if (nota != "—") partes.add("★ $nota")
        partes.add(qual)
        partes.add(idioma)
        meta.text = partes.joinToString("  •  ") + dur

        sinopse.text = movie.description.ifBlank { "Sem descrição disponível." }

        badge.visibility = if (movie.dublado_ptbr == true) View.VISIBLE else View.GONE

        val posterUrl = movie.poster_url.ifBlank { movie.backdrop_url }
        if (posterUrl.isNotBlank()) {
            Glide.with(this)
                .load(posterUrl)
                .apply(
                    RequestOptions()
                        .transform(RoundedCorners(14))
                        .placeholder(ColorDrawable(0xFF16161F.toInt()))
                        .error(ColorDrawable(0xFF1F1F2A.toInt()))
                        .centerCrop(),
                )
                .into(poster)
        }

        val backdropUrl = movie.backdrop_url.ifBlank { movie.poster_url }
        if (backdropUrl.isNotBlank()) {
            Glide.with(this)
                .load(backdropUrl)
                .apply(
                    RequestOptions()
                        .placeholder(ColorDrawable(0xFF0A0A0F.toInt()))
                        .error(ColorDrawable(0xFF0A0A0F.toInt()))
                        .centerCrop(),
                )
                .into(backdrop)
        }

        // Seletor de temporada/episódio (séries)
        val detEpisodios = findViewById<View>(R.id.detEpisodios)
        if (movie.ehSerie) {
            prepararEpisodios()
            detEpisodios.visibility = View.VISIBLE
            atualizarLabelsEpisodio()
        } else {
            detEpisodios.visibility = View.GONE
        }
    }

    private fun carregarEstadoLista() {
        val tok = AuthRepository.loadToken(this)
        val tmdb = movie.tmdbIdNumerico ?: return
        if (tok.isNullOrBlank()) return
        scope.launch {
            naLista = withContext(Dispatchers.IO) {
                FavoritesRepository.listar(this@DetailsActivity, tok).any { it.first == tmdb }
            }
            atualizarBotaoLista()
        }
    }

    private fun atualizarBotaoLista() {
        val btn = findViewById<Button>(R.id.btnMinhaLista)
        btn.text = if (naLista) "✓  NA MINHA LISTA" else "+  MINHA LISTA"
    }

    private fun prepararEpisodios() {
        val eps = movie.episodes_available
        temporadas = eps.mapNotNull { e ->
            val s = e.split("/").getOrNull(0)?.toIntOrNull()
            if (s != null && s > 0) s else null
        }.distinct().sorted()

        if (temporadas.isEmpty()) temporadas = listOf(1)
        if (!temporadas.contains(temporadaAtual)) temporadaAtual = temporadas.first()
        atualizarEpisodiosDaTemporada()
    }

    private fun atualizarEpisodiosDaTemporada() {
        val eps = movie.episodes_available
        episodiosTemporada = eps.mapNotNull { e ->
            val partes = e.split("/")
            val s = partes.getOrNull(0)?.toIntOrNull() ?: return@mapNotNull null
            val ep = partes.getOrNull(1)?.toIntOrNull() ?: return@mapNotNull null
            if (s == temporadaAtual && ep > 0) ep else null
        }.distinct().sorted()

        if (episodiosTemporada.isEmpty()) episodiosTemporada = listOf(1)
        if (!episodiosTemporada.contains(episodioAtual)) episodioAtual = episodiosTemporada.first()
    }

    private fun trocarTemporada(delta: Int) {
        val idx = temporadas.indexOf(temporadaAtual)
        val novo = temporadas.getOrNull(idx + delta) ?: return
        temporadaAtual = novo
        episodioAtual = -1
        atualizarEpisodiosDaTemporada()
        atualizarLabelsEpisodio()
    }

    private fun trocarEpisodio(delta: Int) {
        val idx = episodiosTemporada.indexOf(episodioAtual)
        val novo = episodiosTemporada.getOrNull(idx + delta) ?: return
        episodioAtual = novo
        atualizarLabelsEpisodio()
    }

    private fun atualizarLabelsEpisodio() {
        findViewById<TextView>(R.id.lblTemporada).text = "T$temporadaAtual"
        findViewById<TextView>(R.id.lblEpisodio).text = "E$episodioAtual"
    }

    private fun abrirPlayer() {
        startActivity(
            Intent(this, PlaybackActivity::class.java)
                .putExtra("movie_id", movie.id)
                .putExtra("season", temporadaAtual)
                .putExtra("episode", episodioAtual),
        )
    }

    private fun alternarLista() {
        val tok = AuthRepository.loadToken(this)
        val tmdb = movie.tmdbIdNumerico ?: return
        if (tok.isNullOrBlank()) {
            android.widget.Toast.makeText(
                this,
                "Entre com a sua conta (site ou app) para usar a Minha Lista.",
                android.widget.Toast.LENGTH_LONG,
            ).show()
            return
        }
        scope.launch {
            val ok = if (naLista) {
                withContext(Dispatchers.IO) { FavoritesRepository.remover(this@DetailsActivity, tok, tmdb) }
            } else {
                withContext(Dispatchers.IO) {
                    FavoritesRepository.adicionar(this@DetailsActivity, tok, tmdb, if (movie.ehSerie) "tv" else "movie")
                }
            }
            if (ok) {
                naLista = !naLista
                atualizarBotaoLista()
            }
        }
    }

    // Navegação D-pad: ↑/↓ rolam a página; Voltar retorna.
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
            val scroll = findViewById<ScrollView>(R.id.detScroll)
            val dy = if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) 120 else -120
            scroll.smoothScrollBy(0, dy)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}