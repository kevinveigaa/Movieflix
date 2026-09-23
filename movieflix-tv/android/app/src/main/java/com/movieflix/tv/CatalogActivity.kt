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
 * Catalogo em GRADE (Filmes ou Series) com filtro por categoria.
 *
 * Grade navegavel pelo D-pad; as colunas sao calculadas pela largura REAL da
 * tela (720p/1080p/4K).
 *
 * PAGINACAO (correcao do bug de catalogo): o catalogo MovieFlix tem ~18.000
 * filmes e ~8.000 series. Montar todos os cards de uma vez criava dezenas de
 * milhares de Views + dezenas de milhares de requisicoes de imagem, travando a
 * UI thread: a grade ficava em branco. Agora montamos UMA pagina por vez
 * (CatalogoJanela.TAMANHO_PAGINA), como o site faz, e carregamos a proxima ao
 * chegar ao fim da rolagem ou pelo botao do controle remoto.
 */
class CatalogActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var grade: GridLayout
    private lateinit var filtros: LinearLayout
    private lateinit var tituloView: TextView
    private lateinit var botaoMais: TextView
    private lateinit var scroll: ScrollView
    private var tipo = "filme"
    private var categoriaAtual: String? = null

    /** Lista completa do filtro atual e quantos itens ja foram montados. */
    private var itensFiltrados: List<Movie> = emptyList()
    private var exibidos = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tipo = intent.getStringExtra("tipo") ?: "filme"
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, TvUi.dp(this@CatalogActivity, 24), 0, 0)
        }

        tituloView = TvUi.texto(this, if (tipo == "serie") "SERIES" else "FILMES", 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        tituloView.setPadding(resources.getDimensionPixelSize(R.dimen.content_pad), 0, 0, TvUi.dp(this, 10))
        raiz.addView(tituloView)

        val scrollFiltros = android.widget.HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        filtros = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(resources.getDimensionPixelSize(R.dimen.content_pad), 0, resources.getDimensionPixelSize(R.dimen.content_pad), TvUi.dp(this@CatalogActivity, 10))
        }
        scrollFiltros.addView(filtros)
        raiz.addView(scrollFiltros)

        scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        grade = GridLayout(this).apply {
            columnCount = 6
            setPadding(resources.getDimensionPixelSize(R.dimen.content_pad), TvUi.dp(this@CatalogActivity, 6), resources.getDimensionPixelSize(R.dimen.content_pad), TvUi.dp(this@CatalogActivity, 30))
        }
        scroll.addView(grade)
        raiz.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        // Carrega mais uma pagina ao chegar perto do fim da grade.
        scroll.setOnScrollChangeListener { _, _, scrollY, _, _ ->
            val alturaConteudo = scroll.getChildAt(0)?.height ?: 0
            if (alturaConteudo - (scrollY + scroll.height) < TvUi.dp(this, 400)) carregarMais()
        }

        // "Carregar mais" tambem acessivel pelo controle remoto (nao depende de rolagem).
        botaoMais = TvUi.botao(this, if (tipo == "serie") "Carregar mais series" else "Carregar mais filmes")
        botaoMais.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            leftMargin = resources.getDimensionPixelSize(R.dimen.content_pad)
            bottomMargin = TvUi.dp(this@CatalogActivity, 24)
        }
        botaoMais.setOnClickListener { carregarMais() }
        botaoMais.visibility = View.GONE
        raiz.addView(botaoMais)

        conteudo(raiz)
    }

    private fun carregar() {
        executor.execute {
            val cats = CatalogRepository.categorias(this)
            runOnUiThread {
                montarFiltros(cats)
                carregarGrade()
            }
        }
    }

    private fun montarFiltros(cats: List<String>) {
        filtros.removeAllViews()
        val todas = chip("Todas") { categoriaAtual = null; carregarGrade() }
        filtros.addView(todas)
        for (c in cats) {
            filtros.addView(chip(c) { categoriaAtual = c; carregarGrade() })
        }
    }

    private fun chip(rotulo: String, aoClicar: () -> Unit): TextView {
        val t = TvUi.texto(this, rotulo, 12f, ContextCompat.getColor(this, R.color.mf_gray_light), negrito = true)
        t.isFocusable = true
        t.setPadding(TvUi.dp(this, 14), TvUi.dp(this, 7), TvUi.dp(this, 14), TvUi.dp(this, 7))
        val normal = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_light), 20, this, ContextCompat.getColor(this, R.color.mf_border), 1)
        val foco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_red), 20, this, ContextCompat.getColor(this, R.color.mf_white), 2)
        t.background = normal
        t.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = TvUi.dp(this@CatalogActivity, 8) }
        t.setOnFocusChangeListener { v, temFoco -> v.background = if (temFoco) foco else normal }
        t.setOnClickListener { aoClicar() }
        return t
    }

    private fun carregarGrade() {
        executor.execute {
            val base = if (tipo == "serie") CatalogRepository.series(this) else CatalogRepository.filmes(this)
            val itens = categoriaAtual?.let { c -> base.filter { it.categorias.contains(c) } } ?: base
            val ordenados = itens.sortedByDescending { it.anoNumerico }
            runOnUiThread {
                itensFiltrados = ordenados
                exibidos = 0
                grade.removeAllViews()
                atualizarColunas()
                injetarPagina()
                grade.post { if (grade.childCount > 0) grade.getChildAt(0).requestFocus() }
            }
        }
    }

    /** Colunas da grade calculadas pela largura REAL da tela. */
    private fun atualizarColunas() {
        val card = resources.getDimensionPixelSize(R.dimen.card_width)
        val vao = resources.getDimensionPixelSize(R.dimen.card_gutter)
        val pad = resources.getDimensionPixelSize(R.dimen.content_pad)
        grade.columnCount = CatalogoJanela.colunas(resources.displayMetrics.widthPixels, card, vao, pad * 2)
    }

    /** Adiciona SOMENTE a proxima pagina de cards (nunca o catalogo inteiro). */
    private fun injetarPagina() {
        val fim = (exibidos + CatalogoJanela.TAMANHO_PAGINA).coerceAtMost(itensFiltrados.size)
        for (i in exibidos until fim) {
            val m = itensFiltrados[i]
            val card = TvUi.card(this, m.poster_url.ifBlank { m.backdrop_url }, m.title, m.qualidade()) {
                startActivity(Intent(this, DetailsActivity::class.java).putExtra("movie_id", m.id))
            }
            grade.addView(card)
        }
        exibidos = fim
        botaoMais.text = if (tipo == "serie") "Carregar mais series" else "Carregar mais filmes"
        botaoMais.visibility = if (CatalogoJanela.temMais(itensFiltrados.size, exibidos)) View.VISIBLE else View.GONE
    }

    private fun carregarMais() {
        if (!CatalogoJanela.temMais(itensFiltrados.size, exibidos)) {
            botaoMais.visibility = View.GONE
            return
        }
        injetarPagina()
    }

    override fun focoPadrao(): View? = if (::grade.isInitialized && grade.childCount > 0) grade.getChildAt(0) else null

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdownNow()
    }
}
