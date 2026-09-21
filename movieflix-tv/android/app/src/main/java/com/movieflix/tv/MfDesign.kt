package com.movieflix.tv

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Sistema de design do MovieFlix TV.
 *
 * Centraliza a identidade visual da referência aprovada pelo dono:
 * fundo preto premium, acento violeta→índigo, destaque magenta→violeta,
 * selos teal, tipografia grande e alto contraste — confortável a distância.
 *
 * Aqui ficam SÓ estilos e comportamento de foco. Nenhuma regra de negócio,
 * nenhum acesso a dados: a lógica (Supabase, catálogo, planos, player) vive
 * nos repositórios e nas Activities, exatamente como antes.
 */
object MfDesign {

    // ── Paleta (espelha res/values/colors.xml) ──────────────────────────────
    const val BG = 0xFF050505.toInt()
    const val SURFACE = 0xFF0C0A12.toInt()
    const val SURFACE_LIGHT = 0xFF16121F.toInt()
    const val SURFACE_STRONG = 0xFF221B30.toInt()

    const val PURPLE = 0xFF9D38FF.toInt()
    const val PURPLE_LIGHT = 0xFFBC8CFF.toInt()
    const val INDIGO = 0xFF5B42F3.toInt()

    const val MAGENTA = 0xFFE01E5A.toInt()
    const val MAGENTA_LIGHT = 0xFFFF4D82.toInt()

    const val WHITE = Color.WHITE
    const val GRAY = 0xFFB0B0B0.toInt()
    const val GRAY_LIGHT = 0xFFD4D4D8.toInt()
    const val BORDER = 0xFF404040.toInt()

    const val TEAL = 0xFF00A896.toInt()
    const val GOLD = 0xFFFFD700.toInt()
    const val ERROR = 0xFFF87171.toInt()

    // ── Gradientes de marca ────────────────────────────────────────────────
    /** Violeta → índigo: ação principal (botão "Assistir", item ativo do menu). */
    fun gradientePrimario(radiusDp: Float = 26f, strokePx: Int = 0, strokeColor: Int = WHITE) =
        GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            intArrayOf(INDIGO, PURPLE),
        ).apply {
            cornerRadius = radiusDp
            if (strokePx > 0) setStroke(strokePx, strokeColor)
        }

    /** Magenta → violeta: selos de destaque ("DESTAQUE") e foco forte. */
    fun gradienteDestaque(radiusDp: Float = 8f) =
        GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            intArrayOf(MAGENTA, PURPLE),
        ).apply { cornerRadius = radiusDp }

    // ── Fábricas de view ───────────────────────────────────────────────────
    /** Chip informativo (qualidade, idioma, gênero, temporada, episódio). */
    fun chip(ctx: Context, texto: String): TextView = TextView(ctx).apply {
        text = texto
        setTextColor(GRAY_LIGHT)
        textSize = 12f
        setTypeface(Typeface.DEFAULT_BOLD)
        gravity = Gravity.CENTER
        setPadding(dp(ctx, 14f), dp(ctx, 5f), dp(ctx, 14f), dp(ctx, 5f))
        background = GradientDrawable().apply {
            cornerRadius = dp(ctx, 15f).toFloat()
            setColor(0x1FFFFFFF)
            setStroke(dp(ctx, 1f), 0x59FFFFFF)
        }
    }

    /** Selo pequeno sobre posters (ano, tipo, "Dublado PT-BR"). */
    fun selo(
        ctx: Context,
        texto: String,
        corFundo: Int = 0xCC05050A.toInt(),
        corTexto: Int = WHITE,
        raioDp: Float = 6f,
    ): TextView = TextView(ctx).apply {
        text = texto
        setTextColor(corTexto)
        textSize = 11f
        setTypeface(Typeface.DEFAULT_BOLD)
        setPadding(dp(ctx, 10f), dp(ctx, 4f), dp(ctx, 10f), dp(ctx, 4f))
        background = GradientDrawable().apply {
            cornerRadius = dp(ctx, raioDp).toFloat()
            setColor(corFundo)
        }
    }

    /** Título de seção/carrossel ("Em alta", "Lançamentos"). */
    fun tituloSecao(ctx: Context, texto: String): TextView = TextView(ctx).apply {
        text = texto
        setTextColor(WHITE)
        textSize = 19f
        setTypeface(Typeface.DEFAULT_BOLD)
        setPadding(0, dp(ctx, 6f), 0, dp(ctx, 10f))
    }

    /** Título grande de tela (Filmes, Séries, Busca…). */
    fun tituloTela(ctx: Context, texto: String): TextView = TextView(ctx).apply {
        text = texto
        setTextColor(WHITE)
        textSize = 32f
        setTypeface(Typeface.DEFAULT_BOLD)
    }

    /** Rótulo secundário (subtítulo, mensagem de estado vazio). */
    fun texto(ctx: Context, texto: String, tamanho: Float = 15f, cor: Int = GRAY): TextView =
        TextView(ctx).apply {
            text = texto
            setTextColor(cor)
            textSize = tamanho
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
        }

    /** Separador horizontal de 1dp. */
    fun divisor(ctx: Context): View = View(ctx).apply {
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(ctx, 1f),
        )
        setBackgroundColor(0x1FFFFFFF)
    }

    // ── Comportamento de foco (D-pad) ──────────────────────────────────────
    /**
     * Foco de card/linha: leve aumento de escala + sombra. O destaque visual
     * (borda/overlay) fica por conta de cada view; aqui garantimos que o
     * usuário SEMPRE veja onde está o foco, mesmo a 3 metros da TV.
     */
    fun focoEscala(view: View, escala: Float = 1.08f, elevacao: Float = 16f) {
        view.setOnFocusChangeListener { v, temFoco ->
            v.animate()
                .scaleX(if (temFoco) escala else 1f)
                .scaleY(if (temFoco) escala else 1f)
                .setDuration(150)
                .start()
            v.elevation = if (temFoco) elevacao else 0f
        }
    }

    /**
     * Foco de botão-pílula: escala + troca do rótulo para branco puro.
     * O fundo (gradiente/contorno) vem do drawable selector aplicado na view.
     */
    fun focoBotao(view: View, escala: Float = 1.05f) {
        view.setOnFocusChangeListener { v, temFoco ->
            v.animate()
                .scaleX(if (temFoco) escala else 1f)
                .scaleY(if (temFoco) escala else 1f)
                .setDuration(140)
                .start()
            v.elevation = if (temFoco) 14f else 0f
            (v as? TextView)?.setTextColor(WHITE)
        }
    }

    // ── Utilidades ─────────────────────────────────────────────────────────
    fun dp(ctx: Context, valor: Float): Int =
        (valor * ctx.resources.displayMetrics.density + 0.5f).toInt()

    fun sp(ctx: Context, valor: Float): Float = valor * ctx.resources.displayMetrics.scaledDensity

    /** Cor com alfa aplicado (0..255). */
    fun comAlfa(cor: Int, alfa: Int): Int = Color.argb(
        alfa.coerceIn(0, 255),
        Color.red(cor),
        Color.green(cor),
        Color.blue(cor),
    )

    /** Fonte display do projeto (Bebas Neue). */
    fun fonteDisplay(ctx: Context): Typeface = try {
        ctx.resources.getFont(R.font.bebas_neue)
    } catch (e: Exception) {
        Typeface.DEFAULT_BOLD
    }
}
