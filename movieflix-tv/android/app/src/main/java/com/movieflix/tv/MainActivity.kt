package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import androidx.leanback.app.BrowseSupportFragment
import androidx.leanback.widget.ArrayObjectAdapter
import androidx.leanback.widget.HeaderItem
import androidx.leanback.widget.ListRow
import androidx.leanback.widget.ListRowPresenter
import androidx.leanback.widget.OnItemViewClickedListener
import androidx.leanback.widget.OnItemViewSelectedListener
import androidx.leanback.widget.Row
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Home nativa do MovieFlix TV (Leanback BrowseFragment).
 *
 * - Navegação 100% D-pad NATIVA do Android (foco determinístico).
 * - Sidebar com as seções: Início, Filmes, Séries, Minha Lista (Pesquisa
 *   abre pela tecla SEARCH do controle, padrão Android TV).
 * - Linhas horizontais: Destaque (banner hero), Filmes em alta, Lançamentos,
 *   Séries em alta, Categorias.
 * - Atualização silenciosa do catálogo no primeiro acesso (1x/dia).
 */
class MainActivity : androidx.appcompat.app.AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val fragment = MainBrowseFragment()
        supportFragmentManager.beginTransaction()
            .replace(android.R.id.content, fragment)
            .commit()

        // Atualização do catálogo: roda em background, nunca bloqueia a UI.
        scope.launch {
            withContext(Dispatchers.IO) { CatalogRepository.atualizarSeNecessario(this@MainActivity) }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_SEARCH) {
            startActivity(Intent(this, SearchActivity::class.java))
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    class MainBrowseFragment : BrowseSupportFragment() {

        private var adapter: ArrayObjectAdapter? = null

        override fun onActivityCreated(savedInstanceState: Bundle?) {
            super.onActivityCreated(savedInstanceState)

            title = "MovieFlix TV"
            setHeadersState(HEADERS_ENABLED)
            isHeadersTransitionOnBackEnabled = true
            brandColor = Color.rgb(10, 10, 15)

            adapter = ArrayObjectAdapter(ListRowPresenter())
            setAdapter(adapter)
            loadRows()

            onItemViewClickedListener = OnItemViewClickedListener { _, item, _, _ ->
                if (item is Movie) {
                    startActivity(
                        Intent(activity, DetailsActivity::class.java)
                            .putExtra("movie_id", item.id),
                    )
                }
            }

            onItemViewSelectedListener = OnItemViewSelectedListener { _, _, row, _ ->
                if (row is ListRow) {
                    val h = row.headerItem
                    if (h != null) setTitle(h.name)
                }
            }
        }

        private fun loadRows() {
            val ctx = activity ?: return
            val rows = adapter ?: return

            // Banner hero: destaque principal (filme com melhor nota)
            val destaque = CatalogRepository.filmes(ctx)
                .sortedByDescending { it.vote_average }
                .firstOrNull()
            if (destaque != null) {
                rows.add(
                    ListRow(
                        HeaderItem(0, "Destaque"),
                        ArrayObjectAdapter(DropBannerPresenter()).apply { add(0, destaque) },
                    ),
                )
            }

            // Filmes em alta
            val filmesAlta = CatalogRepository.filmes(ctx)
                .sortedByDescending { it.vote_average }
                .take(30)
            rows.add(
                ListRow(
                    HeaderItem(1, "Filmes em alta"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, filmesAlta) },
                ),
            )

            // Lançamentos (mais recentes)
            val lancamentos = CatalogRepository.filmes(ctx)
                .sortedByDescending { (it.year ?: "").toIntOrNull() ?: 0 }
                .take(30)
            rows.add(
                ListRow(
                    HeaderItem(2, "Lançamentos"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, lancamentos) },
                ),
            )

            // Séries em alta
            val seriesAlta = CatalogRepository.series(ctx)
                .sortedByDescending { it.vote_average }
                .take(30)
            rows.add(
                ListRow(
                    HeaderItem(3, "Séries em alta"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, seriesAlta) },
                ),
            )

            // Categorias de filmes
            var id = 10
            for (cat in CatalogRepository.categorias(ctx).take(12)) {
                val itens = CatalogRepository.porCategoria(ctx, cat)
                    .filter { !it.ehSerie }
                    .sortedByDescending { m -> m.vote_average }
                    .take(24)
                if (itens.isEmpty()) continue
                rows.add(
                    ListRow(
                        HeaderItem(id++.toLong(), cat),
                        ArrayObjectAdapter(CardPresenter()).apply { addAll(0, itens) },
                    ),
                )
            }
        }
    }
}