package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.ViewGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.leanback.app.BrowseSupportFragment
import androidx.leanback.widget.ArrayObjectAdapter
import androidx.leanback.widget.HeaderItem
import androidx.leanback.widget.ListRow
import androidx.leanback.widget.ListRowPresenter
import androidx.leanback.widget.OnItemViewClickedListener
import androidx.leanback.widget.Presenter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Minha Lista — conteúdo salvo pelo usuário (mesma tabela favorites do site).
 *
 * - Sem login → orienta a entrar com a conta (a mesma do site).
 * - Com login → carrega os favoritos do Supabase e mostra como linhas.
 * - D-pad nativo; OK abre os detalhes.
 */
class MyListActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val token = AuthRepository.loadToken(this)
        supportFragmentManager.beginTransaction()
            .replace(android.R.id.content, MyListFragment.newInstance(token))
            .commit()
    }

    class MyListFragment : BrowseSupportFragment() {

        private var token: String? = null
        private val scope = CoroutineScope(Dispatchers.Main + Job())

        companion object {
            fun newInstance(token: String?): MyListFragment {
                val f = MyListFragment()
                f.token = token
                return f
            }
        }

        override fun onActivityCreated(savedInstanceState: Bundle?) {
            super.onActivityCreated(savedInstanceState)
            title = "Minha Lista"
            setHeadersState(HEADERS_DISABLED)
            brandColor = android.graphics.Color.rgb(11, 11, 18)

            val ctx = activity ?: return
            val adapter = ArrayObjectAdapter(ListRowPresenter())
            this.adapter = adapter

            val tok = token
            if (tok.isNullOrBlank()) {
                adapter.add(
                    ListRow(
                        HeaderItem(0, "Minha Lista"),
                        ArrayObjectAdapter(TextoPresenter()).apply {
                            add(0, "Entre com a sua conta MovieFlix (a mesma do site) para ver sua lista.\n\nUse o app do celular ou o site para criar a conta e assinar.")
                        },
                    ),
                )
                return
            }

            scope.launch {
                val favoritos = withContext(Dispatchers.IO) {
                    FavoritesRepository.listar(ctx, tok)
                }
                val lista = favoritos.mapNotNull { (tmdb, _) ->
                    CatalogRepository.all(ctx).firstOrNull { (it.tmdbIdNumerico ?: 0L) == tmdb }
                }
                adapter.clear()
                if (lista.isEmpty()) {
                    adapter.add(
                        ListRow(
                            HeaderItem(0, "Minha Lista"),
                            ArrayObjectAdapter(TextoPresenter()).apply {
                                add(0, "Sua lista está vazia.\n\nAbra um filme ou série e pressione o botão \"Minha Lista\" nos detalhes para salvar aqui.")
                            },
                        ),
                    )
                } else {
                    lista.chunked(30).forEachIndexed { i, itens ->
                        adapter.add(
                            ListRow(
                                HeaderItem(i.toLong() + 1, if (i == 0) "Meus títulos" else "Mais da minha lista"),
                                ArrayObjectAdapter(CardPresenter()).apply { addAll(0, itens) },
                            ),
                        )
                    }
                }
            }

            onItemViewClickedListener = OnItemViewClickedListener { _, item, _, _ ->
                if (item is Movie) {
                    startActivity(
                        Intent(activity, DetailsActivity::class.java)
                            .putExtra("movie_id", item.id),
                    )
                }
            }
        }

        override fun onDestroyView() {
            super.onDestroyView()
            scope.cancel()
        }
    }

    /** Apresenta um TextView simples (mensagem) dentro de um ListRow. */
    class TextoPresenter : Presenter() {
        override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
            val tv = TextView(parent.context).apply {
                textSize = 20f
                setTextColor(0xFF9CA3AF.toInt())
                setPadding(60, 60, 60, 60)
            }
            return ViewHolder(tv)
        }

        override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
            (viewHolder.view as TextView).text = item.toString()
        }

        override fun onUnbindViewHolder(viewHolder: ViewHolder) = Unit
    }
}
