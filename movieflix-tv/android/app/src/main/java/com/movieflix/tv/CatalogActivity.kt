package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.leanback.widget.ArrayObjectAdapter
import androidx.leanback.widget.HeaderItem
import androidx.leanback.widget.ListRow
import androidx.leanback.widget.ListRowPresenter
import androidx.leanback.widget.OnItemViewClickedListener
import androidx.leanback.widget.OnItemViewSelectedListener
import androidx.leanback.widget.Row
import androidx.leanback.app.BrowseSupportFragment

/**
 * Catálogo completo — FILMES ou SÉRIES (página dedicada, não abre direto).
 *
 * - Grid de categorias com todos os títulos (paginação: até 60 por linha).
 * - Navegação D-pad nativa Leanback.
 * - Escolheu → abre os Detalhes (nunca reproduz direto).
 */
class CatalogActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_MODO = "modo" // "filmes" | "series"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val modo = intent.getStringExtra(EXTRA_MODO) ?: "filmes"
        supportFragmentManager.beginTransaction()
            .replace(android.R.id.content, CatalogFragment.newInstance(modo))
            .commit()
    }

    class CatalogFragment : BrowseSupportFragment() {

        private var modo: String = "filmes"

        companion object {
            fun newInstance(modo: String): CatalogFragment {
                val f = CatalogFragment()
                f.modo = modo
                return f
            }
        }

        override fun onActivityCreated(savedInstanceState: Bundle?) {
            super.onActivityCreated(savedInstanceState)

            title = if (modo == "series") "Séries" else "Filmes"
            setHeadersState(HEADERS_ENABLED)
            isHeadersTransitionOnBackEnabled = true
            brandColor = android.graphics.Color.rgb(11, 11, 18)

            val adapter = ArrayObjectAdapter(ListRowPresenter())
            this.adapter = adapter

            val ctx = activity ?: return
            val lista = if (modo == "series") CatalogRepository.series(ctx) else CatalogRepository.filmes(ctx)

            // Ordenação padrão: melhores notas primeiro (progressivo — linhas limitadas)
            val ordenadas = lista.sortedByDescending { it.vote_average }

            // Linha 0: Todos (os 60 melhores)
            adapter.add(
                ListRow(
                    HeaderItem(0, if (modo == "series") "Todas as séries" else "Todos os filmes"),
                    ArrayObjectAdapter(CardPresenter()).apply { addAll(0, ordenadas.take(60)) },
                ),
            )

            // Categorias: cada uma com seus títulos
            var id = 1
            for (cat in CatalogRepository.categorias(ctx)) {
                val itens = lista.filter { it.categorias.contains(cat) }
                    .sortedByDescending { it.vote_average }
                    .take(60)
                if (itens.isEmpty()) continue
                adapter.add(
                    ListRow(
                        HeaderItem(id++.toLong(), cat),
                        ArrayObjectAdapter(CardPresenter()).apply { addAll(0, itens) },
                    ),
                )
                if (id > 25) break // limite de linhas para TV fraca
            }

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
    }
}
