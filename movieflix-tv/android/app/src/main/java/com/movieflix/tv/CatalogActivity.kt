package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.FrameLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Catálogo completo — FILMES ou SÉRIES (interface de TV reconstruída).
 *
 * Mesmas regras do mobile/site: lista ordenada por nota, linha "Todos" e uma
 * linha por categoria, com os mesmos limites usados antes para TV fraca.
 */
class CatalogActivity : SidebarHostActivity() {

    companion object {
        const val EXTRA_MODO = "modo" // "filmes" | "series"
    }

    override val itemAtivo: String
        get() = if (modo == "series") "series" else "filmes"

    private val modo: String
        get() = intent.getStringExtra(EXTRA_MODO) ?: "filmes"

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

        val cabecalho = if (modo == "series") "Séries" else "Filmes"
        val texto = MfDesign.tituloTela(this, cabecalho)
        val subtitulo = MfDesign.texto(this, "Todo o catálogo MovieFlix — mesmos títulos do app e do site.")
        val topo = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@CatalogActivity, 22f),
                MfDesign.dp(this@CatalogActivity, 26f),
                MfDesign.dp(this@CatalogActivity, 22f),
                0,
            )
            addView(texto)
            addView(subtitulo, android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@CatalogActivity, 6f) })
        }
        rows.definirHero(topo)

        carregar()
    }

    private fun carregar() {
        scope.launch {
            val lista = withContext(Dispatchers.IO) {
                if (modo == "series") CatalogRepository.series(this@CatalogActivity)
                else CatalogRepository.filmes(this@CatalogActivity)
            }
            val categorias = withContext(Dispatchers.IO) { CatalogRepository.categorias(this@CatalogActivity) }
            Log.i("MovieFlixCatalog", "modo=$modo itens=${lista.size}")

            val abrir = { m: Movie ->
                startActivity(
                    Intent(this@CatalogActivity, DetailsActivity::class.java).putExtra("movie_id", m.id),
                )
            }

            val ordenadas = lista.sortedByDescending { it.vote_average }
            rows.limpar()
            rows.definirHero(cabecalho())
            rows.adicionarLinha(
                if (modo == "series") "Todas as séries" else "Todos os filmes",
                ordenadas.take(60),
                abrir,
            )

            var linhas = 1
            for (cat in categorias) {
                if (linhas > 25) break
                val itens = lista.filter { it.categorias.contains(cat) }
                    .sortedByDescending { it.vote_average }
                    .take(60)
                if (itens.isEmpty()) continue
                rows.adicionarLinha(cat, itens, abrir)
                linhas++
            }
            rows.focarPrimeiraLinha()
        }
    }

    private fun cabecalho(): android.view.View =
        android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(context, 22f),
                MfDesign.dp(context, 26f),
                MfDesign.dp(context, 22f),
                MfDesign.dp(context, 6f),
            )
            addView(MfDesign.tituloTela(context, if (modo == "series") "Séries" else "Filmes"))
        }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
