package com.movieflix.tv

import android.content.Context
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import androidx.core.content.ContextCompat

/**
 * IDENTIDADE VISUAL do MovieFlix TV.
 *
 * Os valores abaixo sao EXATAMENTE os do design system do site
 * (tailwind.config.js + src/index.css), para que site, mobile e TV parecam o
 * MESMO produto:
 *
 *   brand-600  #DF0A15  -> mf_red           VERMELHO DA MARCA (acento principal)
 *   roxo-600   #7C3AED  -> mf_purple        VIOLETA (fim do gradiente / apoio)
 *   roxo-400   #A78BFA  -> mf_purple_light  (texto de destaque secundario)
 *   ink-950    #050505  -> mf_black         FUNDO premium
 *
 * Gradiente oficial da marca: vermelho -> violeta
 * (`.btn-primary` do site = from-brand-600 via-roxo-600 to-roxo-600).
 *
 * REGRA: o acento PRINCIPAL da TV e o VERMELHO da marca; o violeta e apoio.
 * Nada de interface roxa generica.
 */
object TvTema {

    fun cor(ctx: Context, res: Int): Int = ContextCompat.getColor(ctx, res)

    fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()

    /** Arredondamento de card/botao (mesma linguagem do site: rounded-xl). */
    fun raioCard(ctx: Context): Int = dp(ctx, 10)

    // ── Gradientes da MARCA ────────────────────────────────────────────────

    /** Gradiente vermelho -> violeta (horizontal). Fundo dos botoes primarios. */
    fun gradienteMarca(ctx: Context, raioDp: Int = 0): GradientDrawable =
        gradienteAngulado(ctx, raioDp, GradientDrawable.Orientation.LEFT_RIGHT)

    /** Gradiente vermelho -> violeta na diagonal (cards/badges/realces). */
    fun gradienteMarcaDiagonal(ctx: Context, raioDp: Int = 0): GradientDrawable =
        gradienteAngulado(ctx, raioDp, GradientDrawable.Orientation.TL_BR)

    private fun gradienteAngulado(
        ctx: Context,
        raioDp: Int,
        orientacao: GradientDrawable.Orientation,
    ): GradientDrawable {
        val d = GradientDrawable(
            orientacao,
            intArrayOf(cor(ctx, R.color.mf_red), cor(ctx, R.color.mf_purple)),
        )
        d.cornerRadius = dp(ctx, raioDp).toFloat()
        return d
    }

    /** Vermelho puro da marca (onde o site usa `bg-brand-600`). */
    fun vermelho(ctx: Context, raioDp: Int = 0): GradientDrawable =
        painel(ctx, cor(ctx, R.color.mf_red), raioDp)

    /** Gradiente vertical escuro (scrim de hero, rodape de card). */
    fun gradienteVertical(cima: Int, baixo: Int): GradientDrawable {
        val d = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(cima, baixo))
        d.shape = GradientDrawable.RECTANGLE
        return d
    }

    fun gradienteHorizontal(esq: Int, dir: Int): GradientDrawable {
        val d = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(esq, dir))
        d.shape = GradientDrawable.RECTANGLE
        return d
    }

    /** Superficie (painel) — borda opcional. */
    fun painel(
        ctx: Context,
        corFundo: Int,
        raioDp: Int,
        corBorda: Int = 0,
        bordaDp: Int = 0,
    ): GradientDrawable {
        val d = GradientDrawable()
        d.shape = GradientDrawable.RECTANGLE
        d.cornerRadius = dp(ctx, raioDp).toFloat()
        d.setColor(corFundo)
        if (corBorda != 0 && bordaDp > 0) d.setStroke(dp(ctx, bordaDp), corBorda)
        return d
    }

    // ── FOCO (nunca generico: sempre MovieFlix) ────────────────────────────────

    /**
     * Anel de foco da MARCA: lavagem vermelha translucida + borda branca nitida.
     * Usado como `foreground` de card/botao — o usuario sempre ve onde esta.
     */
    fun anelFoco(ctx: Context, raioDp: Int): LayerDrawable {
        val lavagem = painel(ctx, 0x2EDF0A15, raioDp)
        val anel = painel(ctx, 0x00000000, raioDp, 0xF2FFFFFF.toInt(), 3)
        return LayerDrawable(arrayOf<Drawable>(lavagem, anel))
    }

    /** Anel de foco "ativo" (item corrente): gradiente da marca + borda vermelha. */
    fun anelFocoMarca(ctx: Context, raioDp: Int): LayerDrawable {
        val lavagem = painel(ctx, 0x33DF0A15, raioDp)
        val anel = painel(ctx, 0x00000000, raioDp, cor(ctx, R.color.mf_red), 3)
        return LayerDrawable(arrayOf<Drawable>(lavagem, anel))
    }

    /** Sublinhado do item ATIVO da navegacao — barra vermelha da marca. */
    fun sublinhadoAtivo(ctx: Context): GradientDrawable = gradienteMarca(ctx, 2)

    // ── Scrims (legibilidade sobre banners reais) ──────────────────────────────

    /** Escurece da esquerda para a direita (texto do hero a esquerda). */
    fun scrimHeroEsquerda(): GradientDrawable =
        gradienteHorizontal(0xF2050505.toInt(), 0x1A050505)

    /** Escurece de baixo para cima (transicao hero -> conteudo). */
    fun scrimHeroBaixo(): GradientDrawable = gradienteVertical(0x00000000, 0xF2050505.toInt())
}
