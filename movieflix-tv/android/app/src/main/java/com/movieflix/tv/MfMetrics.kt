package com.movieflix.tv

import android.content.Context

/**
 * Métricas responsivas do MovieFlix TV.
 *
 * Em TV a densidade varia muito entre aparelhos (720p tvdpi, 1080p xhdpi,
 * 4K xxxhdpi) e `dp` sozinho NÃO garante a mesma composição visual. Por isso
 * as medidas ESTRUTURAIS (menu, HERO, cards) são calculadas como FRAÇÃO da
 * tela real em pixels — assim 720p, 1080p e 4K mostram a MESMA composição:
 *
 *  - HERO com ~1/3 da altura (o banner NUNCA ocupa a tela inteira);
 *  - ~4 a 6 colunas de cards visíveis;
 *  - ~3 a 4 fileiras visíveis, com cards ainda legíveis a distância.
 *
 * Nada aqui é regra de negócio: são apenas números de layout.
 */
object MfMetrics {

    fun largura(ctx: Context): Int = ctx.resources.displayMetrics.widthPixels

    fun altura(ctx: Context): Int = ctx.resources.displayMetrics.heightPixels

    /** Largura do menu lateral (~24% da tela, como na referência visual). */
    fun sidebarWidth(ctx: Context): Int = (largura(ctx) * 0.24f).toInt()

    /** Área de conteúdo disponível (tela menos o menu). */
    fun contentWidth(ctx: Context): Int = largura(ctx) - sidebarWidth(ctx)

    /** Altura do HERO: 30% da tela — o banner não cobre o catálogo. */
    fun heroHeight(ctx: Context): Int = (altura(ctx) * 0.30f).toInt()

    /**
     * Altura do poster: 18% da altura da tela (≈194 px em 1080p).
     *
     * POR QUE 18%: num painel 16:9 existe um conflito real entre “4–6 colunas”
     * e “3–4 fileiras”. Para caber uma 3ª fileira (com o HERO em 30%) o card
     * precisa ficar nesta faixa; maior que isso e só duas fileiras aparecem.
     * Nesta altura o card continua legível a distância (194×129 px em 1080p) e a
     * primeira fileira é centralizada, então não sobra um vão feio na lateral.
     */
    fun cardHeight(ctx: Context): Int = (altura(ctx) * 0.18f).toInt()

    /** Poster 2:3 (mesma proporção do catálogo e do mobile). */
    fun cardWidth(ctx: Context): Int = (cardHeight(ctx) * 2f / 3f).toInt()

    /** Faixa de título + meta abaixo do poster. */
    fun cardTextHeight(ctx: Context): Int = (altura(ctx) * 0.05f).toInt()

    /** Espaço entre cards. */
    fun cardGutter(ctx: Context): Int = (cardWidth(ctx) * 0.11f).toInt()

    /** Padding horizontal do conteúdo. */
    fun contentPad(ctx: Context): Int = (largura(ctx) * 0.022f).toInt()

    /**
     * Colunas visíveis (4–6), escolhidas por faixa de largura.
     *
     * Em 720p (1280 px) cinco cards são o máximo que continua legível; em
     * 1080p e 4K usamos seis. O valor NÃO é calculado só pelo “quanto cabe”:
     * se fosse, a tela pediria 11 colunas de cards minúsculos. Aqui a
     * legibilidade manda, e o vão que sobra é dividido igualmente (fileiras
     * centralizadas em `MfRowView`), sem acumular espaço numa lateral só.
     */
    fun colunas(ctx: Context): Int {
        val largura = largura(ctx)
        return when {
            largura >= 2560 -> 6   // 4K
            largura >= 1600 -> 6   // 1080p
            else -> 5              // 720p
        }
    }

    /**
     * Padding lateral que centraliza a fileira de cards na área de conteúdo.
     * Evita o "vão" assimétrico à direita quando a fileira não preenche a
     * largura toda.
     */
    fun paddingCentral(ctx: Context): Int {
        val passo = cardWidth(ctx) + cardGutter(ctx)
        val usado = colunas(ctx) * passo
        val sobra = (contentWidth(ctx) - usado) / 2
        return sobra.coerceAtLeast(contentPad(ctx))
    }

    /** Tamanho de texto escalado pela altura da tela (legibilidade a distância). */
    fun sp(ctx: Context, fracao: Float): Float =
        (altura(ctx) / ctx.resources.displayMetrics.density * fracao).coerceAtLeast(10f)
}
