package com.movieflix.tv

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import androidx.leanback.app.DetailsSupportFragment
import androidx.leanback.app.DetailsSupportFragmentBackgroundController
import androidx.leanback.widget.Action
import androidx.leanback.widget.ArrayObjectAdapter
import androidx.leanback.widget.ClassPresenterSelector
import androidx.leanback.widget.DetailsOverviewRow
import androidx.leanback.widget.FullWidthDetailsOverviewRowPresenter
import androidx.leanback.widget.OnActionClickedListener
import com.bumptech.glide.Glide
import com.bumptech.glide.request.RequestOptions
import com.bumptech.glide.request.target.SimpleTarget
import com.bumptech.glide.request.transition.Transition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Detalhes do título com ações D-pad nativas:
 *  - Filmes: [Assistir] e [Minha Lista].
 *  - Séries: seletor de temporada + episódio (linha 2) e [Minha Lista].
 *
 * A reprodução SEMPRE passa pelo PlaybackActivity, que resolve o stream no
 * backend (valida assinatura server-side) e reproduz HLS nativo (ExoPlayer).
 */
class DetailsActivity : androidx.appcompat.app.AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val movieId = intent.getStringExtra("movie_id") ?: run {
            finish()
            return
        }
        val movie = CatalogRepository.porId(this, movieId) ?: run {
            finish()
            return
        }
        supportFragmentManager.beginTransaction()
            .replace(android.R.id.content, DetailsFragment.newInstance(movie))
            .commit()
    }

    class DetailsFragment : DetailsSupportFragment() {

        private var background: DetailsSupportFragmentBackgroundController? = null
        private lateinit var movie: Movie
        private val scope = CoroutineScope(Dispatchers.Main + Job())

        // estado do seletor de episódio
        private var temporadas: List<Int> = emptyList()
        private var temporadaAtual: Int = 1
        private var episodiosTemporada: List<Int> = emptyList()
        private var episodioAtual: Int = 1
        private var naLista: Boolean = false

        companion object {
            fun newInstance(movie: Movie): DetailsFragment {
                val f = DetailsFragment()
                f.movie = movie
                return f
            }
        }

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            background = DetailsSupportFragmentBackgroundController(this)
            setupRows()
            carregarEstadoLista()
        }

        private fun carregarEstadoLista() {
            val tok = AuthRepository.loadToken(requireContext())
            val tmdb = movie.tmdbIdNumerico ?: return
            if (tok.isNullOrBlank()) return
            scope.launch {
                naLista = withContext(Dispatchers.IO) {
                    FavoritesRepository.listar(requireContext(), tok).any { it.first == tmdb }
                }
                atualizarBotaoLista()
            }
        }

        private fun atualizarBotaoLista() {
            // re-cria a linha para atualizar o rótulo do botão
            setupRows()
        }

        private fun setupRows() {
            val presenterSelector = ClassPresenterSelector().apply {
                addClassPresenter(
                    DetailsOverviewRow::class.java,
                    FullWidthDetailsOverviewRowPresenter(DetailsDescriptionPresenter()).apply {
                        setOnActionClickedListener(OnActionClickedListener { action ->
                            when (action.id) {
                                1L -> abrirPlayer()
                                2L -> alternarLista()
                                3L -> { // Temporada anterior
                                    trocarTemporada(-1)
                                }
                                4L -> { // Próxima temporada
                                    trocarTemporada(+1)
                                }
                                5L -> { // Episódio anterior
                                    trocarEpisodio(-1)
                                }
                                6L -> { // Próximo episódio
                                    trocarEpisodio(+1)
                                }
                            }
                        })
                    },
                )
            }
            val adapter = ArrayObjectAdapter(presenterSelector)

            val row = DetailsOverviewRow(movie)
            val poster = movie.poster_url.ifBlank { movie.backdrop_url }
            if (poster.isNotBlank()) {
                Glide.with(this)
                    .load(poster)
                    .apply(
                        RequestOptions()
                            .centerCrop()
                            .error(ColorDrawable(0xFF1F1F2E.toInt())),
                    )
                    .into(object : SimpleTarget<android.graphics.drawable.Drawable>() {
                        override fun onResourceReady(
                            resource: android.graphics.drawable.Drawable,
                            transition: Transition<in android.graphics.drawable.Drawable>?,
                        ) {
                            row.imageDrawable = resource
                        }
                    })
            }

            // Ações
            if (movie.ehSerie) {
                prepararEpisodios()
                row.addAction(Action(3, "◀ Temporada", "T$temporadaAtual"))
                row.addAction(Action(5, "◀ Episódio", "E$episodioAtual"))
                row.addAction(Action(6, "Episódio ▶", "E${episodioAtual + 1}"))
                row.addAction(Action(4, "Temporada ▶", "T${temporadaAtual + 1}"))
                row.addAction(Action(1, "▶ Assistir", "T${temporadaAtual} · E${episodioAtual}"))
                row.addAction(Action(2, if (naLista) "✓ Na Minha Lista" else "＋ Minha Lista", if (naLista) "Remover da lista" else "Adicionar à lista"))
            } else {
                row.addAction(Action(1, "▶ Assistir", "Reproduzir filme"))
                row.addAction(Action(2, if (naLista) "✓ Na Minha Lista" else "＋ Minha Lista", if (naLista) "Remover da lista" else "Adicionar à lista"))
            }

            adapter.add(row)
            this.adapter = adapter

            // fundo: backdrop
            if (movie.backdrop_url.isNotBlank()) {
                background?.let { bg ->
                    bg.enableParallax()
                    Glide.with(this)
                        .asBitmap()
                        .load(movie.backdrop_url)
                        .centerCrop()
                        .into(object : SimpleTarget<Bitmap>() {
                            override fun onResourceReady(
                                resource: Bitmap,
                                transition: Transition<in Bitmap>?,
                            ) {
                                bg.setCoverBitmap(resource)
                            }
                        })
                }
            }
        }

        private fun prepararEpisodios() {
            val eps = movie.episodes_available
            temporadas = eps.mapNotNull { e ->
                val s = e.split("/").getOrNull(0)?.toIntOrNull()
                if (s != null && s > 0) s else null
            }.distinct().sorted()

            if (temporadas.isEmpty()) {
                temporadas = listOf(1)
            }
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
            episodioAtual = -1 // força reset
            atualizarEpisodiosDaTemporada()
            setupRows()
        }

        private fun trocarEpisodio(delta: Int) {
            val idx = episodiosTemporada.indexOf(episodioAtual)
            val novo = episodiosTemporada.getOrNull(idx + delta) ?: return
            episodioAtual = novo
            setupRows()
        }

        private fun abrirPlayer() {
            startActivity(
                Intent(activity, PlaybackActivity::class.java)
                    .putExtra("movie_id", movie.id)
                    .putExtra("season", temporadaAtual)
                    .putExtra("episode", episodioAtual),
            )
        }

        private fun alternarLista() {
            val tok = AuthRepository.loadToken(requireContext())
            val tmdb = movie.tmdbIdNumerico ?: return
            if (tok.isNullOrBlank()) {
                // sem sessão: não há como salvar — orienta a entrar pelo site/app
                android.widget.Toast.makeText(
                    requireContext(),
                    "Entre com a sua conta (site ou app) para usar a Minha Lista.",
                    android.widget.Toast.LENGTH_LONG,
                ).show()
                return
            }
            scope.launch {
                val ok = if (naLista) {
                    withContext(Dispatchers.IO) { FavoritesRepository.remover(requireContext(), tok, tmdb) }
                } else {
                    withContext(Dispatchers.IO) {
                        FavoritesRepository.adicionar(requireContext(), tok, tmdb, if (movie.ehSerie) "tv" else "movie")
                    }
                }
                if (ok) {
                    naLista = !naLista
                    setupRows()
                }
            }
        }

        override fun onDestroyView() {
            super.onDestroyView()
            scope.cancel()
        }
    }
}
