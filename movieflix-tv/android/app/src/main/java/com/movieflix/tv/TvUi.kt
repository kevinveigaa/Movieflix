package com.movieflix.tv

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions

/**
 * Toolkit de UI para TV.
 *
 * Tudo e construido em codigo: garante que TODO elemento interativo seja
 * focusable (controle remoto), que haja anel de foco visivel e escalonamento, e
 * que as medidas venham de @dimen (escala correta em 720p/1080p/4K).
 */
object TvUi {

    fun cor(ctx: Context, res: Int): Int = ContextCompat.getColor(ctx, res)

    fun dp(ctx: Context, valor: Int): Int =
        (valor * ctx.resources.displayMetrics.density).toInt()

    fun fundo(corFundo: Int, raioDp: Int, ctx: Context, corBorda: Int = 0, bordaDp: Int = 0): GradientDrawable {
        val d = GradientDrawable()
        d.shape = GradientDrawable.RECTANGLE
        d.cornerRadius = dp(ctx, raioDp).toFloat()
        d.setColor(corFundo)
        if (corBorda != 0 && bordaDp > 0) d.setStroke(dp(ctx, bordaDp), corBorda)
        return d
    }

    fun gradiente(cima: Int, baixo: Int): GradientDrawable {
        val d = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(cima, baixo))
        d.shape = GradientDrawable.RECTANGLE
        return d
    }

    fun gradienteHorizontal(esq: Int, dir: Int): GradientDrawable {
        val d = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(esq, dir))
        d.shape = GradientDrawable.RECTANGLE
        return d
    }

    // ── Texto ──

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
        if (negrito) t.setTypeface(Typeface.DEFAULT_BOLD)
        t.includeFontPadding = false
        return t
    }

    fun tituloSecao(ctx: Context, valor: String): TextView {
        val t = texto(ctx, valor, 17f, cor(ctx, R.color.mf_white), negrito = true)
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        lp.marginStart = dp(ctx, 34)
        lp.bottomMargin = dp(ctx, 10)
        t.layoutParams = lp
        return t
    }

    // ── Botoes ──

    /**
     * Botao de TV com foco visivel: anel violeta + leve crescimento ao focar.
     * `primario = true` => preenchido com o acento MovieFlix.
     */
    fun botao(
        ctx: Context,
        rotulo: String,
        primario: Boolean = false,
        largura: Int = ViewGroup.LayoutParams.WRAP_CONTENT,
    ): TextView {
        val t = texto(ctx, rotulo, 15f, if (primario) cor(ctx, R.color.mf_white) else cor(ctx, R.color.mf_white), negrito = true)
        t.gravity = Gravity.CENTER
        t.isFocusable = true
        t.isFocusableInTouchMode = false
        t.setPadding(dp(ctx, 24), dp(ctx, 12), dp(ctx, 24), dp(ctx, 12))
        val raio = dp(ctx, 10)
        val fundoNormal =
            if (primario) fundo(cor(ctx, R.color.mf_purple), 10, ctx)
            else fundo(cor(ctx, R.color.mf_surface_light), 10, ctx, cor(ctx, R.color.mf_border), 1)
        val fundoFoco =
            if (primario) fundo(cor(ctx, R.color.mf_purple_light), 10, ctx, cor(ctx, R.color.mf_white), 2)
            else fundo(cor(ctx, R.color.mf_surface_strong), 10, ctx, cor(ctx, R.color.mf_purple), 2)
        t.background = fundoNormal
        t.setOnFocusChangeListener { v, temFoco ->
            v.background = if (temFoco) fundoFoco else fundoNormal
            v.animate().scaleX(if (temFoco) 1.06f else 1f).scaleY(if (temFoco) 1.06f else 1f)
                .setDuration(120).start()
        }
        if (largura != ViewGroup.LayoutParams.WRAP_CONTENT) t.layoutParams = LinearLayout.LayoutParams(largura, ViewGroup.LayoutParams.WRAP_CONTENT)
        return t
    }

    // ── Cards ──

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
     * Card de poster com foco visual (anel violeta + crescimento + titulo).
     * Retorna o FrameLayout que recebe o foco; o clique e disparado por DPAD_CENTER.
     */
    fun card(ctx: Context, url: String, titulo: String, selo: String?, aoClicar: () -> Unit): FrameLayout {
        val largura = ctx.resources.getDimensionPixelSize(R.dimen.card_width)
        val altura = ctx.resources.getDimensionPixelSize(R.dimen.card_height)
        val raio = dp(ctx, 12)

        val frame = FrameLayout(ctx)
        val lp = LinearLayout.LayoutParams(largura, altura)
        lp.marginEnd = ctx.resources.getDimensionPixelSize(R.dimen.card_gutter)
        lp.bottomMargin = dp(ctx, 8)
        frame.layoutParams = lp
        frame.isFocusable = true
        frame.isFocusableInTouchMode = false
        frame.clipToOutline = true

        val img = ImageView(ctx)
        img.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        img.scaleType = ImageView.ScaleType.CENTER_CROP
        img.setBackgroundColor(cor(ctx, R.color.mf_surface_light))
        Glide.with(img).load(url)
            .transition(DrawableTransitionOptions.withCrossFade(180))
            .placeholder(R.color.mf_surface_light).error(R.color.mf_surface_light).into(img)
        frame.addView(img)

        val seloView = texto(ctx, selo ?: "", 10f, cor(ctx, R.color.mf_white), negrito = true)
        seloView.setPadding(dp(ctx, 7), dp(ctx, 3), dp(ctx, 7), dp(ctx, 3))
        seloView.background = fundo(0xCC000000.toInt(), 6, ctx, cor(ctx, R.color.mf_border), 1)
        val lpSelo = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lpSelo.gravity = Gravity.TOP or Gravity.START
        lpSelo.leftMargin = dp(ctx, 8); lpSelo.topMargin = dp(ctx, 8)
        seloView.layoutParams = lpSelo
        seloView.visibility = if (selo.isNullOrBlank()) View.GONE else View.VISIBLE
        frame.addView(seloView)

        val rodape = texto(ctx, titulo, 11f, cor(ctx, R.color.mf_white), negrito = false, maxLinhas = 2)
        rodape.setPadding(dp(ctx, 6), dp(ctx, 6), dp(ctx, 6), dp(ctx, 7))
        rodape.background = gradiente(0x00000000, 0xE6000000.toInt())
        val lpRod = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lpRod.gravity = Gravity.BOTTOM
        rodape.layoutParams = lpRod
        frame.addView(rodape)

        val fundoNormal = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
        val fundoFoco = fundo(Color.TRANSPARENT, 12, ctx, cor(ctx, R.color.mf_purple), 4)
        frame.foreground = fundoNormal
        frame.setOnFocusChangeListener { v, temFoco ->
            v.foreground = if (temFoco) fundoFoco else fundoNormal
            v.animate().scaleX(if (temFoco) 1.08f else 1f).scaleY(if (temFoco) 1.08f else 1f)
                .setDuration(130).start()
            v.bringToFront()
            if (temFoco) v.requestRectangleOnScreen(android.graphics.Rect(0, 0, v.width, v.height), true)
        }
        frame.setOnClickListener { aoClicar() }
        frame.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN &&
                (keyCode == android.view.KeyEvent.KEYCODE_DPAD_CENTER || keyCode == android.view.KeyEvent.KEYCODE_ENTER)
            ) {
                aoClicar(); true
            } else false
        }
        return frame
    }

    /** Linha horizontal rolavel de cards (navegacao D-pad esquerda/direita). */
    fun linha(ctx: Context): LinearLayout {
        val l = LinearLayout(ctx)
        l.orientation = LinearLayout.HORIZONTAL
        l.setPadding(ctx.resources.getDimensionPixelSize(R.dimen.content_pad), 0, ctx.resources.getDimensionPixelSize(R.dimen.content_pad), 0)
        return l
    }

    fun rolavel(ctx: Context, conteudo: View): android.widget.HorizontalScrollView {
        val h = android.widget.HorizontalScrollView(ctx)
        h.isHorizontalScrollBarEnabled = false
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
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
}
