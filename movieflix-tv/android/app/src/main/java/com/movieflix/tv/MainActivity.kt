package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * HOME do MovieFlix TV — reconstruída para a identidade visual nova e para
 * controle remoto, mantendo EXATAMENTE as mesmas regras de dados do mobile:
 *
 *  - catálogo lido de CatalogRepository (mesmos filmes.json / series.json);
 *  - DESTAQUE = filme de melhor nota;
 *  - "Filmes em alta" = filmes por nota (top 30);
 *  - "Lançamentos" = filmes por ano (top 30);
 *  - "Séries em alta" = séries por nota (top 30);
 *  - carrosséis por categoria (as mesmas categorias do catálogo).
 *
 * Atualização silenciosa do catálogo (1x/dia) continua rodando em background.
 */
class MainActivity : SidebarHostActivity() {

    override val itemAtivo: String = "inicio"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var rows: MfRowsView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        rows = MfRowsView(this)
        content.addView(
            rows,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        // Atualização do catálogo: background, nunca bloqueia a UI.
        scope.launch {
            withContext(Dispatchers.IO) { CatalogRepository.atualizarSeNecessario(this@MainActivity) }
        }

        carregarCatalogo()
    }

    private fun carregarCatalogo() {
        scope.launch {
            val filmes = withContext(Dispatchers.IO) { CatalogRepository.filmes(this@MainActivity) }
            val series = withContext(Dispatchers.IO) { CatalogRepository.series(this@MainActivity) }
            val categorias = withContext(Dispatchers.IO) { CatalogRepository.categorias(this@MainActivity) }
            Log.i("MovieFlixHome", "Catálogo carregado: filmes=${filmes.size} series=${series.size}")

            rows.limpar()
            montarHero(filmes)

            val abrirDetalhes = { m: Movie ->
                startActivity(Intent(this@MainActivity, DetailsActivity::class.java).putExtra("movie_id", m.id))
            }

            rows.adicionarLinha(
                "Filmes em alta",
                filmes.sortedByDescending { it.vote_average }.take(30),
                abrirDetalhes,
            )
            rows.adicionarLinha(
                "Lançamentos",
                filmes.sortedByDescending { (it.year ?: "").toIntOrNull() ?: 0 }.take(30),
                abrirDetalhes,
            )
            rows.adicionarLinha(
                "Séries em alta",
                series.sortedByDescending { it.vote_average }.take(30),
                abrirDetalhes,
            )

            for (cat in categorias.take(8)) {
                val itens = filmes.filter { it.categorias.contains(cat) }
                    .sortedByDescending { m -> m.vote_average }
                    .take(24)
                rows.adicionarLinha(cat, itens, abrirDetalhes)
            }

            rows.focarPrimeiraLinha()
        }
    }

    /**
     * HERO no topo: destaque principal + navegação lateral entre os 4 melhores
     * títulos (setas ESQUERDA/DIREITA quando o foco está nos botões do banner).
     */
    private fun montarHero(filmes: List<Movie>) {
        val destaques = filmes.sortedByDescending { it.vote_average }.take(4)
        if (destaques.isEmpty()) return

        val banner = DropBannerPresenter.BannerView(this)
        var indice = 0

        fun mostrar(i: Int) {
            indice = ((i % destaques.size) + destaques.size) % destaques.size
            banner.bind(destaques[indice])
            banner.definirPaginas(destaques.size, indice)
        }

        banner.onAssistir = {
            val m = destaques[indice]
            startActivity(
                Intent(this, PlaybackActivity::class.java)
                    .putExtra("movie_id", m.id)
                    .putExtra("season", 1)
                    .putExtra("episode", 1),
            )
        }
        banner.onDetalhes = {
            startActivity(
                Intent(this, DetailsActivity::class.java)
                    .putExtra("movie_id", destaques[indice].id),
            )
        }

        mostrar(0)

        // Setas trocam o destaque quando o foco está dentro do banner
        banner.setOnKeyListener { _, keyCode, event ->
            if (event.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> { mostrar(indice - 1); true }
                KeyEvent.KEYCODE_DPAD_RIGHT -> { mostrar(indice + 1); true }
                else -> false
            }
        }

        rows.definirHero(banner)
        rows.focarHero = { banner.focarAcaoPrincipal() }
    }

    /** SEARCH do controle abre a busca; MENU/SETTINGS abrem as configurações. */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_SEARCH) {
            startActivity(Intent(this, SearchActivity::class.java))
            return true
        }
        if (keyCode == KeyEvent.KEYCODE_SETTINGS || keyCode == KeyEvent.KEYCODE_MENU) {
            startActivity(Intent(this, SettingsActivity::class.java))
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
