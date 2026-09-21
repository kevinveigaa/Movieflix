package com.movieflix.tv

import android.content.Context
import android.graphics.drawable.GradientDrawable

/**
 * Menu lateral persistente do MovieFlix TV.
 *
 * Réplica da navegação da referência visual: coluna fixa à esquerda com
 * wordmark no topo e itens que assumem pílula em gradiente quando ATIVOS,
 * com foco D-pad claramente destacado.
 *
 * Não contém regra de negócio — apenas emite o id do item selecionado em
 * [onSelect], e a Activity decide para onde navegar.
 */
class SidebarView @JvmOverloads constructor(
    context: Context,
    attrs: android.util.AttributeSet? = null,
) : android.widget.LinearLayout(context, attrs) {

    data class Item(val id: String, val label: String, val icone: Int)

    companion object {
        val ITENS = listOf(
            Item("inicio", "Início", R.drawable.ic_mf_home),
            Item("filmes", "Filmes", R.drawable.ic_mf_movies),
            Item("series", "Séries", R.drawable.ic_mf_series),
            Item("favoritos", "Favoritos", R.drawable.ic_mf_favorite),
            Item("continuar", "Continuar assistindo", R.drawable.ic_mf_history),
            Item("busca", "Pesquisar", R.drawable.ic_mf_search),
            Item("perfis", "Perfis", R.drawable.ic_mf_profile),
            Item("config", "Configurações", R.drawable.ic_mf_settings),
        )
    }

    /** Chamado quando o usuário confirma um item com OK no controle. */
    var onSelect: ((String) -> Unit)? = null

    /** Item marcado como ativo (pílula em gradiente). */
    var ativo: String = "inicio"
        set(valor) {
            field = valor
            atualizarAtivos()
        }

    private val lblPerfil = android.widget.TextView(context)
    private val linhas = mutableMapOf<String, android.widget.LinearLayout>()
    private val icones = mutableMapOf<String, android.widget.ImageView>()
    private val rotulos = mutableMapOf<String, android.widget.TextView>()

    init {
        orientation = VERTICAL
        setBackgroundColor(MfDesign.BG)
        setPadding(
            MfDesign.dp(context, 14f),
            MfDesign.dp(context, 30f),
            MfDesign.dp(context, 14f),
            MfDesign.dp(context, 24f),
        )

        addView(montarMarca())
        addView(espacador(MfDesign.dp(context, 22f)))

        for (item in ITENS) addView(montarItem(item))

        // Empurra o rodapé (perfil ativo) para o fim do menu
        addView(android.view.View(context), LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))

        lblPerfil.apply {
            setTextColor(MfDesign.GRAY)
            textSize = 12f
            setPadding(MfDesign.dp(context, 12f), 0, 0, 0)
            visibility = GONE
        }
        addView(lblPerfil)

        atualizarAtivos()
    }

    /** Mostra o perfil ativo no pé do menu (paridade com o mobile/site). */
    fun definirPerfilAtivo(nome: String?) {
        if (nome.isNullOrBlank()) {
            lblPerfil.visibility = GONE
        } else {
            lblPerfil.text = "Perfil: $nome"
            lblPerfil.visibility = VISIBLE
        }
    }

    /** Move o foco do D-pad para um item do menu. */
    fun focarItem(id: String) {
        (linhas[id] ?: linhas[ativo])?.requestFocus()
    }

    /** O view informado está dentro do menu? (usado pela navegação de foco) */
    fun contem(view: android.view.View): Boolean {
        var atual: android.view.View? = view
        while (atual != null) {
            if (atual === this) return true
            val pai = atual.parent
            atual = if (pai is android.view.View) pai else null
        }
        return false
    }

    // ── Construção visual ──────────────────────────────────────────────────
    private fun montarMarca(): android.view.View {
        val marca = android.widget.LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(MfDesign.dp(context, 8f), 0, 0, 0)
        }

        val logo = android.widget.ImageView(context).apply {
            setImageResource(R.drawable.mf_logo)
            contentDescription = "MovieFlix"
        }
        marca.addView(
            logo,
            LayoutParams(MfDesign.dp(context, 32f), MfDesign.dp(context, 32f)),
        )

        val wordmark = android.widget.TextView(context).apply {
            text = "MOVIEFLIX"
            setTextColor(MfDesign.WHITE)
            textSize = 20f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            letterSpacing = 0.08f
        }
        marca.addView(
            wordmark,
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                marginStart = MfDesign.dp(context, 10f)
            },
        )
        return marca
    }

    private fun montarItem(item: Item): android.view.View {
        val linha = android.widget.LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            background = resources.getDrawable(R.drawable.bg_sidebar_item, null)
            setPadding(MfDesign.dp(context, 14f), 0, MfDesign.dp(context, 12f), 0)
        }

        val icone = android.widget.ImageView(context).apply {
            setImageResource(item.icone)
            contentDescription = item.label
        }
        linha.addView(
            icone,
            LayoutParams(MfDesign.dp(context, 21f), MfDesign.dp(context, 21f)),
        )

        val rotulo = android.widget.TextView(context).apply {
            text = item.label
            setTextColor(MfDesign.GRAY)
            textSize = 15f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        linha.addView(
            rotulo,
            LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = MfDesign.dp(context, 14f)
            },
        )

        // Foco D-pad: escala suave + realce do rótulo (fundo vem do selector)
        linha.setOnFocusChangeListener { v, temFoco ->
            v.animate().scaleX(if (temFoco) 1.03f else 1f)
                .scaleY(if (temFoco) 1.03f else 1f)
                .setDuration(130).start()
            rotulo.setTextColor(if (temFoco || ativo == item.id) MfDesign.WHITE else MfDesign.GRAY)
        }

        linha.setOnClickListener { onSelect?.invoke(item.id) }

        linhas[item.id] = linha
        icones[item.id] = icone
        rotulos[item.id] = rotulo

        linha.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, MfDesign.dp(context, 48f)).apply {
            topMargin = MfDesign.dp(context, 7f)
        }
        return linha
    }

    /** Pinta o item ativo com a pílula em gradiente e destaca o rótulo. */
    private fun atualizarAtivos() {
        for ((id, linha) in linhas) {
            val ehAtivo = id == ativo
            linha.background = resources.getDrawable(
                if (ehAtivo) R.drawable.bg_sidebar_active else R.drawable.bg_sidebar_item,
                null,
            )
            rotulos[id]?.setTextColor(if (ehAtivo) MfDesign.WHITE else MfDesign.GRAY)
            icones[id]?.alpha = if (ehAtivo) 1f else 0.75f
        }
    }

    private fun espacador(altura: Int): android.view.View =
        android.view.View(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, altura)
        }

    /** Gradiente padrão exposto para usos futuros do menu. */
    fun gradientePadrao(): GradientDrawable = MfDesign.gradientePrimario()
}
