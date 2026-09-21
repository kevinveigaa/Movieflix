package com.movieflix.tv

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Componentes de interface reaproveitados por todas as telas do MovieFlix TV.
 *
 * Por que existe este arquivo: antes cada tela montava o próprio cabeçalho,
 * os próprios chips e os próprios botões — o resultado era inconsistente
 * (títulos de tamanhos diferentes, chips estourando a largura, botões
 * cortados). Aqui ficam os três blocos padrão, para que Filmes, Séries,
 * Favoritos, Busca, Histórico e Detalhes tenham EXATAMENTE a mesma
 * identidade visual.
 *
 * Nada aqui toca em dados: é só apresentação e navegação por controle remoto.
 */
object MfUi {

    /**
     * Cabeçalho padrão de tela: wordmark MOVIEFLIX + título grande + subtítulo.
     *
     * O wordmark em Bebas Neue com a "M" em gradiente é o mesmo elemento do
     * menu lateral e da referência visual — dá unidade ao app e deixa claro que
     * a tela faz parte do MovieFlix (e não é uma lista genérica).
     */
    fun cabecalho(
        ctx: Context,
        titulo: String,
        subtitulo: String? = null,
    ): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        val folga = MfMetrics.contentPad(ctx)
        setPadding(
            folga,
            (MfMetrics.altura(ctx) * 0.030f).toInt(),
            folga,
            (MfMetrics.altura(ctx) * 0.006f).toInt(),
        )

        addView(wordmark(ctx))

        addView(
            TextView(ctx).apply {
                text = titulo
                setTextColor(Color.WHITE)
                typeface = MfDesign.fonteDisplay(ctx)
                letterSpacing = 0.02f
                setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.tituloTela(ctx))
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            },
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = (MfMetrics.altura(ctx) * 0.006f).toInt() },
        )

        if (!subtitulo.isNullOrBlank()) {
            addView(
                TextView(ctx).apply {
                    text = subtitulo
                    setTextColor(MfDesign.GRAY_LIGHT)
                    setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.textoSecundario(ctx))
                    maxLines = 2
                    ellipsize = android.text.TextUtils.TruncateAt.END
                },
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = (MfMetrics.altura(ctx) * 0.005f).toInt() },
            )
        }

        // Fio de separação em gradiente (mesma linguagem dos cards em foco).
        addView(
            View(ctx).apply { background = fioGradiente(ctx) },
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                MfDesign.dp(ctx, 2f),
            ).apply { topMargin = (MfMetrics.altura(ctx) * 0.016f).toInt() },
        )
    }

    /** Wordmark "MOVIEFLIX" com a inicial em gradiente (identidade da marca). */
    fun wordmark(ctx: Context): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL

        val tam = MfMetrics.textoWordmark(ctx)

        addView(
            TextView(ctx).apply {
                text = "M"
                setTextColor(Color.WHITE)
                typeface = MfDesign.fonteDisplay(ctx)
                setTextSize(TypedValue.COMPLEX_UNIT_PX, tam)
                background = GradientDrawable(
                    GradientDrawable.Orientation.TL_BR,
                    intArrayOf(MfDesign.MAGENTA, MfDesign.PURPLE),
                ).apply { cornerRadius = MfDesign.dp(ctx, 6f).toFloat() }
                gravity = Gravity.CENTER
                setPadding(
                    MfDesign.dp(ctx, 8f), MfDesign.dp(ctx, 1f),
                    MfDesign.dp(ctx, 8f), MfDesign.dp(ctx, 3f),
                )
            },
        )
        addView(
            TextView(ctx).apply {
                text = "MOVIEFLIX"
                setTextColor(Color.WHITE)
                typeface = MfDesign.fonteDisplay(ctx)
                letterSpacing = 0.08f
                setTextSize(TypedValue.COMPLEX_UNIT_PX, tam)
                setPadding(MfDesign.dp(ctx, 8f), 0, 0, 0)
            },
        )
    }

    private fun fioGradiente(ctx: Context): GradientDrawable = GradientDrawable(
        GradientDrawable.Orientation.LEFT_RIGHT,
        intArrayOf(MfDesign.MAGENTA, MfDesign.PURPLE, 0x00000000),
    ).apply { cornerRadius = MfDesign.dp(ctx, 1f).toFloat() }

    /**
     * Botão-pílula padrão do app.
     *
     * `largura`/`peso` permitem que o botão se estique para ocupar a linha: é
     * assim que a tela de Detalhes garante que ASSISTIR e FAVORITOS NUNCA fiquem
     * cortados, em nenhuma resolução (720p/1080p/4K).
     */
    fun botao(
        ctx: Context,
        texto: String,
        fundo: Int,
        alturaDp: Float = 52f,
        largura: Int = ViewGroup.LayoutParams.WRAP_CONTENT,
        peso: Float = 0f,
        corTexto: Int = Color.WHITE,
        aoClicar: () -> Unit,
    ): TextView = TextView(ctx).apply {
        text = texto
        setTextColor(corTexto)
        setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.textoBotao(ctx))
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        isFocusable = true
        isFocusableInTouchMode = true
        isClickable = true
        maxLines = 1
        ellipsize = android.text.TextUtils.TruncateAt.END
        setPadding(MfDesign.dp(ctx, 18f), 0, MfDesign.dp(ctx, 18f), 0)
        layoutParams = LinearLayout.LayoutParams(largura, MfDesign.dp(ctx, alturaDp)).apply {
            weight = peso
            if (peso > 0f) minimumWidth = 0
        }
        background = ctx.resources.getDrawable(fundo, null)
        MfDesign.focoBotao(this)
        setOnClickListener { aoClicar() }
    }

    /**
     * Botão de card de CONTROLE REMOTO com realce próprio e cor preservada.
     *
     * Diferente de [botao], este respeita uma cor de texto específica (usada no
     * botão de Favoritos, que fica dourado quando o título já está salvo) e não
     * a sobrescreve no foco — só clareia o fundo.
     */
    fun botaoCor(
        ctx: Context,
        texto: String,
        fundo: Int,
        corTexto: Int,
        alturaDp: Float = 52f,
        largura: Int = ViewGroup.LayoutParams.WRAP_CONTENT,
        peso: Float = 0f,
        aoClicar: () -> Unit,
    ): TextView = TextView(ctx).apply {
        text = texto
        setTextColor(corTexto)
        setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.textoBotao(ctx))
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        isFocusable = true
        isFocusableInTouchMode = true
        isClickable = true
        maxLines = 1
        ellipsize = android.text.TextUtils.TruncateAt.END
        setPadding(MfDesign.dp(ctx, 18f), 0, MfDesign.dp(ctx, 18f), 0)
        layoutParams = LinearLayout.LayoutParams(largura, MfDesign.dp(ctx, alturaDp)).apply {
            weight = peso
            if (peso > 0f) minimumWidth = 0
        }
        background = ctx.resources.getDrawable(fundo, null)
        setOnFocusChangeListener { v, temFoco ->
            v.animate().scaleX(if (temFoco) 1.04f else 1f)
                .scaleY(if (temFoco) 1.04f else 1f)
                .setDuration(140).start()
            v.elevation = if (temFoco) 14f else 0f
        }
        setOnClickListener { aoClicar() }
    }

    /**
     * Contêiner que QUEBRA LINHA automaticamente.
     *
     * Necessário nos chips de temporada/episódio: uma temporada com 24
     * episódios não cabe numa única linha horizontal em 16:9 e, no layout
     * antigo, os chips simplesmente saíam da tela. Aqui eles passam para a
     * linha de baixo, mantendo tudo navegável pelo D-pad.
     */
    class FlowLayout(context: Context) : ViewGroup(context) {

        var espacoH: Int = MfDesign.dp(context, 8f)
        var espacoV: Int = MfDesign.dp(context, 8f)

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val larguraDisp = MeasureSpec.getSize(widthMeasureSpec)
            var linhaLargura = 0
            var linhaAltura = 0
            var totalAltura = 0
            var x = 0

            for (i in 0 until childCount) {
                val filho = getChildAt(i)
                if (filho.visibility == GONE) continue
                measureChild(filho, widthMeasureSpec, heightMeasureSpec)
                val l = filho.measuredWidth
                val a = filho.measuredHeight

                if (x > 0 && x + l > larguraDisp) {
                    totalAltura += linhaAltura + espacoV
                    linhaLargura = maxOf(linhaLargura, x - espacoH)
                    x = 0
                    linhaAltura = 0
                }
                x += l + espacoH
                linhaAltura = maxOf(linhaAltura, a)
            }
            linhaLargura = maxOf(linhaLargura, x - espacoH)
            totalAltura += linhaAltura

            setMeasuredDimension(
                resolveSize(maxOf(linhaLargura, 0), widthMeasureSpec),
                resolveSize(maxOf(totalAltura, 0), heightMeasureSpec),
            )
        }

        override fun onLayout(mudou: Boolean, esquerda: Int, topo: Int, direita: Int, baixo: Int) {
            val larguraDisp = right - left
            var x = 0
            var y = 0
            var linhaAltura = 0

            for (i in 0 until childCount) {
                val filho = getChildAt(i)
                if (filho.visibility == GONE) continue
                val l = filho.measuredWidth
                val a = filho.measuredHeight

                if (x > 0 && x + l > larguraDisp) {
                    y += linhaAltura + espacoV
                    x = 0
                    linhaAltura = 0
                }
                filho.layout(x, y, x + l, y + a)
                x += l + espacoH
                linhaAltura = maxOf(linhaAltura, a)
            }
        }
    }

    /**
     * Placeholder de poster.
     *
     * Antes, um título sem capa mostrava um bloco liso — parecia erro de
     * carregamento. Agora exibe a inicial do título sobre a superfície escura
     * com a marca do MovieFlix, então a ausência de arte fica intencional.
     */
    fun preencherPlaceholder(ctx: Context, titulo: String, destino: android.widget.TextView) {
        val inicial = titulo.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "M"
        destino.text = inicial
        destino.visibility = View.VISIBLE
    }
}
