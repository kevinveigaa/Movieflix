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

/**
 * Home nativa do MovieFlix TV (Leanback BrowseFragment).
 * Linhas = categorias reais do catálogo embutido; navegação 100% D-pad nativa.
 * Linhas: "Filmes em destaque", "Séries", depois as categorias principais.
 */
class MainActivity : androidx.appcompat.app.AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val fragment = MainBrowseFragment()
        supportFragmentManager.beginTransaction()
            .replace(android.R.id.content, fragment)
            .commit()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // Tecla SEARCH do controle remoto abre a pesquisa
        if (keyCode == KeyEvent.KEYCODE_SEARCH) {
            startActivity(Intent(this, SearchActivity::class.java))
            return true
        }
        return super.onKeyDown(keyCode, event)
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

            // Linha 1: Filmes em destaque (melhores notas)
            val destaques = CatalogRepository.filmes(ctx)
                .sortedByDescending { it.vote_average }
                .take(30)
            rows.add(
                ListRow(
                    HeaderItem(1, "Filmes em destaque"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, destaques) },
                ),
            )

            // Linha 2: Séries
            val series = CatalogRepository.series(ctx)
                .sortedByDescending { it.vote_average }
                .take(30)
            rows.add(
                ListRow(
                    HeaderItem(2, "Séries"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, series) },
                ),
            )

            // Categorias principais (até 15)
            var id = 10
            for (cat in CatalogRepository.categorias(ctx).take(15)) {
                val itens = CatalogRepository.porCategoria(ctx, cat)
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
