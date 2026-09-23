package com.movieflix.tv

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions

/**
 * Design system do MovieFlix TV.
 *
 * Tudo e construido em codigo para garantir que TODO elemento interativo seja
 * focusable (controle remoto), que haja anel de foco visivel da MARCA, e que as
 * medidas venham de @dimen (escala correta em 720p/1080p/4K).
 *
 * Identidade: VERMELHO DA MARCA (#DF0A15) como acento principal + gradiente
 * vermelho->violeta nos elementos de destaque, exatamente como no site.
 */
object TvUi {

    fun cor(ctx: Context, res: Int): Int = ContextCompat.getColor(ctx, res)

    fun dp(ctx: Context, valor: Int): Int =
        (valor * ctx.resources.displayMetrics.density).toInt()

    fun dim(ctx: Context, res: Int): Int = ctx.resources.getDimensionPixelSize(res)

    // ── Superficies ────────────────────────────────────────────────────────────────

    fun fundo(corFundo: Int, raioDp: Int, ctx: Context, corBorda: Int = 0, bordaDp: Int = 0): GradientDrawable =
        TvTema.painel(ctx, corFundo, raioDp, corBorda, bordaDp)

    fun gradiente(cima: Int, baixo: Int): GradientDrawable = TvTema.gradienteVertical(cima, baixo)

    fun gradienteHorizontal(esq: Int, dir: Int): GradientDrawable = TvTema.gradienteHorizontal(esq, dir)

    // ── Texto ────────────────────────────────────────────────────────────────────────

    fun texto(
        ctx: Context,
        valor: CharSequence,
        tamanhoSp: Float,
        cor: Int,
        negrito: Boolean = false,
        maxLinhas: Int = 1,
    ): TextView {
        val t = TextView(ctx)
        t.text = valor
        t.setTextSize(tamanhoSp)
        t.setTextColor(cor)
        t.maxLines = maxLinhas
        t.ellipsize = android.text.TextUtils.TruncateAt.END
        t.setTypeface(Typeface.DEFAULT, if (negrito) Typeface.BOLD else Typeface.NORMAL)
        t.includeFontPadding = false
        return t
    }

    /** Titulo de uma linha/secao ("Em alta", "Filmes", "Series"...). */
    fun tituloSecao(ctx: Context, valor: String): TextView {
        val t = texto(ctx, valor, 17f, cor(ctx, R.color.mf_white), negrito = true)
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        lp.marginStart = dp(ctx, 34)
        lp.bottomMargin = dp(ctx, 8)
        t.layoutParams = lp
        return t
    }

    /** Selo pequeno (Dublado PT-BR / nota / ano) sobre o poster. */
    fun selo(ctx: Context, valor: String, fundoCor: Int, textoCor: Int): TextView {
        val t = texto(ctx, valor, 10f, textoCor, negrito = true)
        t.setPadding(dp(ctx, 7), dp(ctx, 3), dp(ctx, 7), dp(ctx, 3))
        t.background = fundo(fundoCor, 6, ctx)
        return t
    }

    // ── Botoes ───────────────────────────────────────────────────────────────────────

    /**
     * Botao de TV com foco visivel.
     * `primario = true` => gradiente VERMELHO->VIOLETA da marca (igual ao site);
     * caso contrario, superficie escura com borda. O foco sempre acende a marca.
     */
    fun botao(
        ctx: Context,
        rotulo: String,
        primario: Boolean = false,
        largura: Int = ViewGroup.LayoutParams.WRAP_CONTENT,
    ): TextView {
        val t = texto(ctx, rotulo, 15f, cor(ctx, R.color.mf_white), negrito = true)
        t.gravity = Gravity.CENTER
        t.isFocusable = true
        t.isFocusableInTouchMode = false
        t.setPadding(dp(ctx, 26), dp(ctx, 13), dp(ctx, 26), dp(ctx, 13))
        val raio = 10
        val normal = if (primario) {
            TvTema.gradienteMarca(ctx, raio)
        } else {
            fundo(cor(ctx, R.color.mf_surface_light), raio, ctx, cor(ctx, R.color.mf_border), 1)
        }
        val foco = if (primario) {
            TvTema.painel(ctx, cor(ctx, R.color.mf_red_light), raio, cor(ctx, R.color.mf_white), 2)
        } else {
            fundo(cor(ctx, R.color.mf_surface_strong), raio, ctx, cor(ctx, R.color.mf_red), 2)
        }
        t.background = normal
        t.setOnFocusChangeListener { v, temFoco ->
            v.background = if (temFoco) foco else normal
            v.animate().scaleX(if (temFoco) 1.06f else 1f).scaleY(if (temFoco) 1.06f else 1f)
                .setDuration(120).start()
            if (temFoco) v.bringToFront()
        }
        if (largura != ViewGroup.LayoutParams.WRAP_CONTENT) {
            t.layoutParams = LinearLayout.LayoutParams(largura, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        return t
    }

    // ── Cards ────────────────────────────────────────────────────────────────────────

    fun poster(ctx: Context, url: String, largura: Int, altura: Int): ImageView {
        val img = ImageView(ctx)
        img.layoutParams = LinearLayout.LayoutParams(largura, altura)
        img.scaleType = ImageView.ScaleType.CENTER_CROP
        img.setBackgroundColor(cor(ctx, R.color.mf_surface_light))
        Glide.with(img).load(url)
            .transition(DrawableTransitionOptions.withCrossFade(180))
            .placeholder(R.color.mf_surface_light)
            .error(R.color.mf_surface_light)
            .into(img)
        return img
    }

    /**
     * Card de poster do catalogo — a mesma linguagem visual do site:
     * poster 2:3 arredondado, selo "Dublado PT-BR", botao circular de play e
     * TITULO ABAIXO do poster. Foco = anel da marca + leve aumento.
     *
     * Retorna um FrameLayout que recebe o foco; OK/ENTER dispara `aoClicar`.
     */
    fun card(
        ctx: Context,
        url: String,
        titulo: String,
        selo: String?,
        aoClicar: () -> Unit,
    ): FrameLayout {
        val largura = dim(ctx, R.dimen.card_width)
        val altura = dim(ctx, R.dimen.card_height)
        val alturaTitulo = dp(ctx, 34)
        val raio = 10

        val frame = FrameLayout(ctx)
        val lp = LinearLayout.LayoutParams(largura, altura + alturaTitulo)
        lp.marginEnd = dim(ctx, R.dimen.card_gutter)
        lp.bottomMargin = dp(ctx, 6)
        frame.layoutParams = lp
        frame.isFocusable = true
        frame.isFocusableInTouchMode = false
        frame.clipChildren = false
        frame.clipToPadding = false

        // Poster arredondado (clip pelo outline do fundo).
        val posterFrame = FrameLayout(ctx)
        posterFrame.layoutParams = FrameLayout.LayoutParams(largura, altura)
        posterFrame.background = fundo(cor(ctx, R.color.mf_surface_light), raio, ctx)
        posterFrame.clipToOutline = true
        frame.addView(posterFrame)

        val img = ImageView(ctx)
        img.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
        )
        img.scaleType = ImageView.ScaleType.CENTER_CROP
        img.setBackgroundColor(cor(ctx, R.color.mf_surface_light))
        Glide.with(img).load(url)
            .transition(DrawableTransitionOptions.withCrossFade(180))
            .placeholder(R.color.mf_surface_light).error(R.color.mf_surface_light).into(img)
        posterFrame.addView(img)

        // Selo Dublado PT-BR (verde, como no site).
        if (!selo.isNullOrBlank()) {
            val seloView = selo(ctx, selo, cor(ctx, R.color.mf_green), cor(ctx, R.color.mf_white))
            val lpSelo = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            )
            lpSelo.gravity = Gravity.TOP or Gravity.START
            lpSelo.leftMargin = dp(ctx, 6); lpSelo.topMargin = dp(ctx, 6)
            seloView.layoutParams = lpSelo
            posterFrame.addView(seloView)
        }

        // Botao circular de play (vermelho da marca), como no card do site.
        val play = ImageView(ctx)
        val ap = dp(ctx, 26)
        val lpPlay = FrameLayout.LayoutParams(ap, ap)
        lpPlay.gravity = Gravity.BOTTOM or Gravity.START
        lpPlay.leftMargin = dp(ctx, 6); lpPlay.bottomMargin = dp(ctx, 6)
        play.layoutParams = lpPlay
        play.setImageResource(R.drawable.ic_add)
        posterFrame.addView(play)

        // Titulo ABAIXO do poster (mesma leitura do site).
        val tituloView = texto(ctx, titulo, 12f, cor(ctx, R.color.mf_gray_light), negrito = true, maxLinhas = 2)
        val lpTit = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        lpTit.topMargin = altura + dp(ctx, 5)
        tituloView.layoutParams = lpTit
        frame.addView(tituloView)

        // Foco: anel da marca + lavagem vermelha (nunca foco generico do sistema).
        val semFoco: Drawable = ColorDrawable(Color.TRANSPARENT)
        val comFoco = TvTema.anelFoco(ctx, raio + 3)
        frame.foreground = semFoco
        frame.setOnFocusChangeListener { v, temFoco ->
            v.foreground = if (temFoco) comFoco else semFoco
            v.animate().scaleX(if (temFoco) 1.07f else 1f).scaleY(if (temFoco) 1.07f else 1f)
                .setDuration(130).start()
            if (temFoco) {
                v.bringToFront()
                v.requestRectangleOnScreen(android.graphics.Rect(0, 0, v.width, v.height), true)
            }
        }
        frame.setOnClickListener { aoClicar() }
        frame.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN &&
                (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)
            ) {
                if (event.repeatCount == 0) aoClicar()
                true
            } else false
        }
        return frame
    }

    /** Linha horizontal rolavel de cards (navegacao D-pad esquerda/direita). */
    fun linha(ctx: Context): LinearLayout {
        val l = LinearLayout(ctx)
        l.orientation = LinearLayout.HORIZONTAL
        l.setPadding(dim(ctx, R.dimen.content_pad), 0, dim(ctx, R.dimen.content_pad), 0)
        return l
    }

    fun rolavel(ctx: Context, conteudo: View): android.widget.HorizontalScrollView {
        val h = android.widget.HorizontalScrollView(ctx)
        h.isHorizontalScrollBarEnabled = false
        h.isFocusable = false
        h.addView(conteudo)
        return h
    }

    /** Coluna de texto de destaque (usada no Hero). */
    fun chip(ctx: Context, valor: String): TextView {
        val t = texto(ctx, valor, 11f, cor(ctx, R.color.mf_gray_light), negrito = true)
        t.setPadding(dp(ctx, 10), dp(ctx, 4), dp(ctx, 10), dp(ctx, 4))
        t.background = fundo(cor(ctx, R.color.mf_surface_strong), 6, ctx, cor(ctx, R.color.mf_border), 1)
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.marginEnd = dp(ctx, 8)
        t.layoutParams = lp
        return t
    }

    fun aviso(ctx: Context, msg: String) {
        Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show()
    }

    fun carregando(ctx: Context, msg: String = "Carregando..."): TextView =
        texto(ctx, msg, 16f, cor(ctx, R.color.mf_gray)).apply {
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

    // ── Cabecalho (logo MovieFlix + navegacao) ───────────────────────────────

    /**
     * Cabecalho da TV: logo REAL do MovieFlix (mf_wordmark, o mesmo asset do
     * site/mobile) + navegacao horizontal. O item ATIVO fica com o VERMELHO da
     * marca; o foco acende em gradiente vermelho->violeta.
     */
    fun cabecalho(
        ctx: Context,
        itens: List<String>,
        ativo: String?,
        aoNavegar: (String) -> Unit,
    ): LinearLayout {
        val barra = LinearLayout(ctx)
        barra.orientation = LinearLayout.HORIZONTAL
        barra.gravity = Gravity.CENTER_VERTICAL
        barra.setPadding(dim(ctx, R.dimen.content_pad), dp(ctx, 8), dim(ctx, R.dimen.content_pad), dp(ctx, 8))
        barra.setBackgroundColor(cor(ctx, R.color.mf_black))

        // LOGO oficial (mesmo asset do site/mobile) — nunca texto no lugar do M.
        val logo = ImageView(ctx)
        val lpLogo = LinearLayout.LayoutParams(
            dim(ctx, R.dimen.header_logo_width), dim(ctx, R.dimen.header_logo_height),
        )
        lpLogo.marginEnd = dp(ctx, 26)
        logo.layoutParams = lpLogo
        logo.setImageResource(R.drawable.mf_wordmark)
        logo.scaleType = ImageView.ScaleType.FIT_CENTER
        logo.isFocusable = false
        barra.addView(logo)

        itens.forEach { item ->
            val t = texto(ctx, item, 15f, cor(ctx, R.color.mf_gray_light), negrito = true)
            t.gravity = Gravity.CENTER
            t.isFocusable = true
            t.isFocusableInTouchMode = false
            t.setPadding(dp(ctx, 18), dp(ctx, 11), dp(ctx, 18), dp(ctx, 11))
            val lpItem = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            )
            lpItem.marginEnd = dp(ctx, 6)
            t.layoutParams = lpItem

            val ehAtivo = ativo != null && item.equals(ativo, ignoreCase = true)
            val normal = if (ehAtivo) {
                TvTema.painel(ctx, cor(ctx, R.color.mf_red), 8)
            } else {
                fundo(Color.TRANSPARENT, 8, ctx)
            }
            val foco = if (ehAtivo) {
                TvTema.painel(ctx, cor(ctx, R.color.mf_red_light), 8, cor(ctx, R.color.mf_white), 2)
            } else {
                TvTema.gradienteMarca(ctx, 8)
            }
            t.setTextColor(cor(ctx, R.color.mf_white))
            t.background = normal
            t.setOnFocusChangeListener { v, temFoco ->
                v.background = if (temFoco) foco else normal
                v.animate().scaleX(if (temFoco) 1.05f else 1f).scaleY(if (temFoco) 1.05f else 1f)
                    .setDuration(110).start()
            }
            t.setOnClickListener { aoNavegar(item) }
            t.setOnKeyListener { _, keyCode, event ->
                if (event.action == KeyEvent.ACTION_DOWN &&
                    (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)
                ) {
                    if (event.repeatCount == 0) aoNavegar(item)
                    true
                } else false
            }
            barra.addView(t)
        }
        return barra
    }

    /** Itens padrao da navegacao (os mesmos caminhos do app). */
    val NAVEGACAO: List<String> = listOf("Inicio", "Filmes", "Series", "Minha Lista", "Historico", "Conta")
}
