package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
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

            // Menu lateral: Início | Filmes | Séries | Minha Lista (Pesquisa via tecla SEARCH)
            onItemViewClickedListener = OnItemViewClickedListener { _, item, _, _ ->
                when (item) {
                    is Movie -> startActivity(
                        Intent(activity, DetailsActivity::class.java)
                            .putExtra("movie_id", item.id),
                    )
                    is MenuItem -> when (item.id) {
                        "filmes" -> startActivity(
                            Intent(activity, CatalogActivity::class.java)
                                .putExtra(CatalogActivity.EXTRA_MODO, "filmes"),
                        )
                        "series" -> startActivity(
                            Intent(activity, CatalogActivity::class.java)
                                .putExtra(CatalogActivity.EXTRA_MODO, "series"),
                        )
                        "minhalista" -> startActivity(Intent(activity, MyListActivity::class.java))
                    }
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

            // Carrega o catálogo em background (IO) e popula o adapter na main
            // thread. Evita ANR (o JSON tem ~4.5MB) e garante que a Home SEMPRE
            // receba os itens válidos, mesmo que algum item individual falhe.
            CoroutineScope(Dispatchers.Main).launch {
                val filmes = withContext(Dispatchers.IO) { CatalogRepository.filmes(ctx) }
                val series = withContext(Dispatchers.IO) { CatalogRepository.series(ctx) }
                val categorias = withContext(Dispatchers.IO) { CatalogRepository.categorias(ctx) }
                Log.i("MovieFlixHome", "Catálogo carregado: filmes=${filmes.size} series=${series.size}")

                // Menu de navegação (Início | Filmes | Séries | Minha Lista)
                rows.add(
                    ListRow(
                        HeaderItem(0, "Início"),
                        ArrayObjectAdapter(MenuPresenter()).apply {
                            add(0, MenuItem("inicio", "Início"))
                            add(1, MenuItem("filmes", "Filmes"))
                            add(2, MenuItem("series", "Séries"))
                            add(3, MenuItem("minhalista", "Minha Lista"))
                        },
                    ),
                )

                // Banner hero: destaque principal (filme com melhor nota)
                val destaque = filmes.sortedByDescending { it.vote_average }.firstOrNull()
                if (destaque != null) {
                    rows.add(
                        ListRow(
                            HeaderItem(1, "Destaque"),
                            ArrayObjectAdapter(DropBannerPresenter()).apply { add(0, destaque) },
                        ),
                    )
                }

                // Filmes em alta
                val filmesAlta = filmes.sortedByDescending { it.vote_average }.take(30)
                rows.add(
                    ListRow(
                        HeaderItem(2, "Filmes em alta"),
                        ArrayObjectAdapter(CardPresenter()).apply { addAll(0, filmesAlta) },
                    ),
                )

                // Lançamentos (mais recentes)
                val lancamentos = filmes.sortedByDescending { (it.year ?: "").toIntOrNull() ?: 0 }.take(30)
                rows.add(
                    ListRow(
                        HeaderItem(3, "Lançamentos"),
                        ArrayObjectAdapter(CardPresenter()).apply { addAll(0, lancamentos) },
                    ),
                )

                // Séries em alta
                val seriesAlta = series.sortedByDescending { it.vote_average }.take(30)
                rows.add(
                    ListRow(
                        HeaderItem(4, "Séries em alta"),
                        ArrayObjectAdapter(CardPresenter()).apply { addAll(0, seriesAlta) },
                    ),
                )

                // Categorias de filmes
                var id = 10
                for (cat in categorias.take(8)) {
                    val itens = filmes.filter { it.categorias.contains(cat) }
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
}