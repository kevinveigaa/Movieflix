package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * MINHA LISTA — os favoritos reais da conta (tabela `favorites`).
 * Se um titulo do servidor nao existir no catalogo carregado, ele e ignorado
 * (nao quebra a tela).
 */
class MyListActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var grade: GridLayout
    private lateinit var vazio: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(resources.getDimensionPixelSize(R.dimen.content_pad), TvUi.dp(this@MyListActivity, 24), resources.getDimensionPixelSize(R.dimen.content_pad), 0)
        }
        val titulo = TvUi.texto(this, "MINHA LISTA", 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        raiz.addView(titulo)

        vazio = TvUi.texto(this, "", 14f, ContextCompat.getColor(this, R.color.mf_gray), maxLinhas = 3)
        vazio.gravity = Gravity.CENTER
        vazio.setPadding(0, TvUi.dp(this, 60), 0, 0)
        raiz.addView(vazio)

        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        grade = GridLayout(this).apply {
            columnCount = 6
            setPadding(0, TvUi.dp(this@MyListActivity, 20), 0, TvUi.dp(this@MyListActivity, 30))
        }
        scroll.addView(grade)
        raiz.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        conteudo(raiz)
    }

    private fun carregar() {
        executor.execute {
            val res = FavoritesRepository.listarResultado(this)
            val filmes = res.itens.mapNotNull { f ->
                CatalogRepository.porTmdb(this, f.tmdbId)
                    ?: CatalogRepository.all(this).firstOrNull { it.tmdbIdNumerico == f.tmdbId }
            }
            runOnUiThread { render(filmes, res.erro, res.semTmdb) }
        }
    }

    private fun render(filmes: List<Movie>, erro: String?, semTmdb: Int) {
        grade.removeAllViews()
        if (erro != null) {
            vazio.visibility = View.VISIBLE
            vazio.text = erro
            return
        }
        if (filmes.isEmpty()) {
            vazio.visibility = View.VISIBLE
            vazio.text = if (semTmdb > 0)
                "Voce tem $semTmdb titulo(s) salvos que nao fazem parte deste catalogo."
            else
                "Sua Minha Lista esta vazia.\nPressione e segure em um titulo para adicionar aos Favoritos."
            return
        }
        vazio.visibility = View.GONE
        for (m in filmes) {
            val card = TvUi.card(this, m.poster_url.ifBlank { m.backdrop_url }, m.title, m.qualidade()) {
                startActivity(Intent(this, DetailsActivity::class.java).putExtra("movie_id", m.id))
            }
            card.setOnLongClickListener {
                executor.execute {
                    m.tmdbIdNumerico?.let { t -> FavoritesRepository.remover(this, t) }
                    runOnUiThread { carregar() }
                }
                true
            }
            grade.addView(card)
        }
        grade.post { if (grade.childCount > 0) grade.getChildAt(0).requestFocus() }
    }

    override fun onResume() { super.onResume(); carregar() }

    override fun focoPadrao(): View? = if (::grade.isInitialized && grade.childCount > 0) grade.getChildAt(0) else null
}
