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
 * - Navegação 100% D-pad NATIVA do Android (foco determinístico: nunca
 *   desaparece, nunca pula, nunca seleciona invisível).
 * - Sidebar com as seções: Início, Filmes, Séries, Minha Lista (Pesquisa
 *   abre pela tecla SEARCH do controle, como manda o padrão Android TV).
 * - Linhas horizontais: Filmes em destaque, Séries em destaque, categorias.
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
            brandColor = Color.rgb(11, 11, 18)

            adapter = ArrayObjectAdapter(ListRowPresenter())
            // CRÍTICO: sem setAdapter o BrowseSupportFragment não renderiza
            // nenhuma linha — a Home ficava cinza com só o título no canto.
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

            // Seção: INÍCIO (destaques)
            val destaques = CatalogRepository.filmes(ctx)
                .sortedByDescending { it.vote_average }
                .take(30)
            rows.add(
                ListRow(
                    HeaderItem(1, "Início · Filmes em destaque"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, destaques) },
                ),
            )

            val seriesDestaque = CatalogRepository.series(ctx)
                .sortedByDescending { it.vote_average }
                .take(30)
            rows.add(
                ListRow(
                    HeaderItem(2, "Início · Séries em destaque"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, seriesDestaque) },
                ),
            )

            // Seção: FILMES — categorias com filmes
            var id = 10
            for (cat in CatalogRepository.categorias(ctx).take(12)) {
                val itens = CatalogRepository.porCategoria(ctx, cat)
                    .filter { !it.ehSerie }
                    .sortedByDescending { m -> m.vote_average }
                    .take(24)
                if (itens.isEmpty()) continue
                rows.add(
                    ListRow(
                        HeaderItem(id++.toLong(), "Filmes · $cat"),
                        ArrayObjectAdapter(CardPresenter()).apply { addAll(0, itens) },
                    ),
                )
            }

            // Seção: SÉRIES — categorias com séries
            for (cat in CatalogRepository.categorias(ctx).take(10)) {
                val itens = CatalogRepository.porCategoria(ctx, cat)
                    .filter { it.ehSerie }
                    .sortedByDescending { m -> m.vote_average }
                    .take(24)
                if (itens.isEmpty()) continue
                rows.add(
                    ListRow(
                        HeaderItem(id++.toLong(), "Séries · $cat"),
                        ArrayObjectAdapter(CardPresenter()).apply { addAll(0, itens) },
                    ),
                )
            }
        }
    }
}
