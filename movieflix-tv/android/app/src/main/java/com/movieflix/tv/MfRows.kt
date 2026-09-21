package com.movieflix.tv

import android.content.Context
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * Adaptador que reaproveita o MESMO CardPresenter do projeto dentro de um
 * RecyclerView de TV — a identidade visual dos cards é idêntica em todas as
 * telas (Home, Filmes, Séries, Minha Lista, Busca, Histórico).
 */
class MovieRowAdapter(
    private val colunas: Int,
    private var onClick: ((Movie) -> Unit)?,
) : RecyclerView.Adapter<MovieRowAdapter.VH>() {

    private val itens = mutableListOf<Movie>()

    /** Liga/religa a ação de OK sem recriar o adaptador. */
    fun definirClique(acao: (Movie) -> Unit) {
        onClick = acao
    }

    fun submit(lista: List<Movie>) {
        itens.clear()
        itens.addAll(lista)
        notifyDataSetChanged()
    }

    fun itemEm(posicao: Int): Movie? = itens.getOrNull(posicao)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val resultado = CardPresenter().onCreateViewHolder(parent)
        val v = resultado.view
        val largura = MfDesign.dp(
            parent.context,
            (CardPresenter.CARD_WIDTH + if (colunas > 1) 18 else 24).toFloat(),
        )
        val altura = MfDesign.dp(
            parent.context,
            (CardPresenter.CARD_HEIGHT + CardPresenter.TEXT_AREA + 14).toFloat(),
        )
        v.layoutParams = RecyclerView.LayoutParams(largura, altura)
        v.setOnClickListener { }
        return VH(resultado, v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = itens[position]
        CardPresenter().onBindViewHolder(holder.holder, item)
        holder.itemView.setOnClickListener { onClick?.invoke(item) }
    }

    override fun getItemCount(): Int = itens.size

    class VH(val holder: androidx.leanback.widget.Presenter.ViewHolder, v: View) :
        RecyclerView.ViewHolder(v)
}

/**
 * Uma linha horizontal de cards com título — o "carrossel" da referência
 * visual (Em alta, Lançamentos, Séries em alta, categorias…).
 */
class MfRowView(context: Context) : LinearLayout(context) {

    private val titulo = MfDesign.tituloSecao(context, "")
    private val recycler = RecyclerView(context)
    private var adapter = MovieRowAdapter(1, null)

    var onItemClick: ((Movie) -> Unit)? = null
        set(valor) {
            field = valor
            adapter.definirClique { valor?.invoke(it) }
        }

    init {
        orientation = LinearLayout.VERTICAL
        recycler.layoutManager = LinearLayoutManager(context, HORIZONTAL, false)
        recycler.adapter = adapter
        recycler.setHasFixedSize(true)
        recycler.clipToPadding = false
        recycler.isFocusable = false
        recycler.itemAnimator = null
        val folga = MfDesign.dp(context, 22f)
        recycler.setPadding(folga, MfDesign.dp(context, 14f), folga, MfDesign.dp(context, 14f))

        addView(titulo)
        addView(recycler)

        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = MfDesign.dp(context, 10f)
        }
    }

    fun definirTitulo(texto: String) {
        titulo.text = texto
        titulo.visibility = if (texto.isBlank()) GONE else VISIBLE
    }

    fun definirItens(lista: List<Movie>) {
        adapter.definirClique { onItemClick?.invoke(it) }
        adapter.submit(lista)
    }

    fun total(): Int = adapter.itemCount

    /** Foca o card no índice indicado (com rolagem horizontal automática). */
    fun focarIndice(indice: Int) {
        if (adapter.itemCount == 0) return
        val pos = indice.coerceIn(0, adapter.itemCount - 1)
        recycler.scrollToPosition(pos)
        recycler.post {
            recycler.findViewHolderForAdapterPosition(pos)?.itemView?.requestFocus()
        }
    }

    /** Índice do card atualmente focado dentro desta linha (0 se nenhum). */
    fun indiceFocado(): Int {
        val foco = recycler.findFocus() ?: return 0
        val pos = recycler.getChildAdapterPosition(foco)
        return if (pos == RecyclerView.NO_POSITION) 0 else pos
    }

    /** O view informado está dentro desta linha? */
    fun contem(view: View?): Boolean {
        var atual = view
        while (atual != null) {
            if (atual === recycler || atual === this) return true
            val pai = atual.parent
            atual = if (pai is View) pai else null
        }
        return false
    }
}

/**
 * Área rolável de linhas horizontais, com um bloco de HERO opcional no topo.
 *
 * Navegação D-pad explícita: UP/DOWN trocam de carrossel mantendo o índice do
 * card, e sobem para o HERO quando existe um. Nada depende de toque.
 */
class MfRowsView(context: Context) : ScrollView(context) {

    private val coluna = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
    }

    private val linhas = mutableListOf<MfRowView>()
    private var hero: View? = null

    /** Pedido de foco ao HERO (a Activity decide qual view do hero focar). */
    var focarHero: (() -> Unit)? = null

    init {
        isFillViewport = false
        isVerticalScrollBarEnabled = false
        clipToPadding = false
        setPadding(0, 0, 0, MfDesign.dp(context, 30f))
        addView(coluna)
    }

    fun definirHero(view: View) {
        hero?.let { coluna.removeView(it) }
        hero = view
        coluna.addView(view, 0)
    }

    /** Zera as linhas (e o hero) antes de recarregar o conteudo. */
    fun limpar() {
        coluna.removeAllViews()
        linhas.clear()
        hero = null
    }

    fun adicionarLinha(titulo: String, itens: List<Movie>, onItemClick: (Movie) -> Unit) {
        if (itens.isEmpty()) return
        val linha = MfRowView(context)
        linha.onItemClick = onItemClick
        linha.definirTitulo(titulo)
        linha.definirItens(itens)
        linhas.add(linha)
        coluna.addView(
            linha,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = MfDesign.dp(context, if (linhas.size == 1) 16f else 4f)
            },
        )
    }

    fun focarPrimeiraLinha() {
        if (linhas.isEmpty()) return
        linhas.first().focarIndice(0)
    }

    /** -1 = HERO, -2 = nenhum bloco conhecido, >= 0 = índice da linha. */
    private fun blocoFocado(): Int {
        val foco = findFocus() ?: return -2
        hero?.let { h ->
            var atual: View? = foco
            while (atual != null) {
                if (atual === h) return -1
                val pai = atual.parent
                atual = if (pai is View) pai else null
            }
        }
        for ((i, linha) in linhas.withIndex()) {
            if (linha.contem(foco)) return i
        }
        return -2
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    val b = blocoFocado()
                    if (b == -1) {
                        if (linhas.isNotEmpty()) {
                            linhas.first().focarIndice(0)
                            return true
                        }
                    } else if (b >= 0 && b < linhas.size - 1) {
                        linhas[b + 1].focarIndice(linhas[b].indiceFocado())
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_UP -> {
                    val b = blocoFocado()
                    if (b > 0) {
                        linhas[b - 1].focarIndice(linhas[b].indiceFocado())
                        return true
                    } else if (b == 0 && hero != null) {
                        focarHero?.invoke()
                        return true
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    companion object {
        /** Grade de cards (busca / listas) reaproveitando o mesmo card. */
        fun criarGrade(context: Context, colunas: Int, onClick: (Movie) -> Unit): RecyclerView {
            val rv = RecyclerView(context)
            rv.layoutManager = GridLayoutManager(context, colunas)
            rv.adapter = MovieRowAdapter(colunas, onClick)
            rv.setHasFixedSize(true)
            rv.clipToPadding = false
            rv.itemAnimator = null
            rv.setPadding(
                MfDesign.dp(context, 6f), MfDesign.dp(context, 10f),
                MfDesign.dp(context, 6f), MfDesign.dp(context, 30f),
            )
            return rv
        }

        /** Publica a lista na grade criada por [criarGrade]. */
        fun publicarNaGrade(rv: RecyclerView, lista: List<Movie>) {
            (rv.adapter as? MovieRowAdapter)?.submit(lista)
        }

        /** Publica a lista na grade e garante o clique de OK. */
        fun publicarNaGrade(rv: RecyclerView, lista: List<Movie>, onClick: (Movie) -> Unit) {
            val adapter = rv.adapter as? MovieRowAdapter ?: return
            adapter.definirClique(onClick)
            adapter.submit(lista)
        }
    }
}
