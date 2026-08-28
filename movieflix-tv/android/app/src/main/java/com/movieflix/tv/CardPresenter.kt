package com.movieflix.tv

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.leanback.widget.Presenter
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.bumptech.glide.request.RequestOptions

/**
 * Card de catálogo nativo com estética MovieFlix (preto/roxo/vermelho).
 *  - Poster grande com cantos arredondados e GUTTER entre cards (não espremidos).
 *  - Badge "Dublado pt-BR" elegante: fundo escuro translúcido + texto verde.
 *  - Título + meta (ano · nota) com espaçamento adequado.
 *  - Foco D-pad: borda vermelha + leve escala + sombra (nunca some, nunca pula).
 */
class CardPresenter : Presenter() {

    companion object {
        const val CARD_WIDTH = 240
        const val CARD_HEIGHT = 360
        const val RADIUS = 14f
        // Espaço horizontal entre cards (gutter) — evita o visual "espremido".
        const val GUTTER = 18
        // Espaço abaixo do poster para título + meta.
        const val TEXT_AREA = 64
    }

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val card = MovieCardView(parent.context)
        card.layoutParams = ViewGroup.LayoutParams(CARD_WIDTH, CARD_HEIGHT + TEXT_AREA)
        card.isFocusable = true
        card.isFocusableInTouchMode = true
        return ViewHolder(card)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        val movie = item as Movie
        val card = viewHolder.view as MovieCardView
        card.bind(movie)
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) {
        val card = viewHolder.view as MovieCardView
        card.unbind()
    }

    /** Card customizado: poster + badge + título + meta, com foco animado. */
    class MovieCardView(context: android.content.Context) : FrameLayout(context) {

        private val poster = ImageView(context)
        private val badge = TextView(context)
        private val titulo = TextView(context)
        private val meta = TextView(context)

        init {
            // Poster
            poster.scaleType = ImageView.ScaleType.CENTER_CROP
            poster.layoutParams = FrameLayout.LayoutParams(CARD_WIDTH, CARD_HEIGHT)
            addView(poster)

            // Badge "Dublado pt-BR" — fundo escuro translúcido + texto verde (elegante)
            badge.text = "Dublado pt-BR"
            badge.setTextColor(0xFF4ADE80.toInt())
            badge.textSize = 11f
            badge.setTypeface(android.graphics.Typeface.DEFAULT_BOLD)
            badge.setPadding(12, 5, 12, 5)
            badge.background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(0xCC000000.toInt())
                setStroke(1, 0x664ADE80.toInt())
            }
            val badgeLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                topMargin = 10
                leftMargin = 10
            }
            addView(badge, badgeLp)

            // Título
            titulo.setTextColor(Color.WHITE)
            titulo.textSize = 15f
            titulo.setTypeface(android.graphics.Typeface.DEFAULT_BOLD)
            titulo.maxLines = 1
            titulo.ellipsize = android.text.TextUtils.TruncateAt.END
            val tituloLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = CARD_HEIGHT + 8
            }
            addView(titulo, tituloLp)

            // Meta (ano • nota)
            meta.setTextColor(0xFF8A8A96.toInt())
            meta.textSize = 12f
            val metaLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = CARD_HEIGHT + 30
            }
            addView(meta, metaLp)

            // Foco: borda vermelha + leve escala + sombra (nunca some, nunca pula)
            setOnFocusChangeListener { _, hasFocus ->
                animate().scaleX(if (hasFocus) 1.08f else 1f)
                    .scaleY(if (hasFocus) 1.08f else 1f)
                    .setDuration(150)
                    .start()
                if (hasFocus) {
                    elevation = 14f
                    poster.background = GradientDrawable().apply {
                        cornerRadius = RADIUS
                        setStroke(5, 0xFFDC2626.toInt())
                    }
                } else {
                    elevation = 0f
                    poster.background = null
                }
            }
        }

        fun bind(movie: Movie) {
            titulo.text = movie.title
            val ano = movie.ano
            meta.text = if (ano.isNotBlank()) "$ano  •  ★ ${movie.nota}" else "★ ${movie.nota}"

            badge.visibility = if (movie.dublado_ptbr == true) View.VISIBLE else View.GONE

            val posterUrl = movie.poster_url.ifBlank { movie.backdrop_url }
            if (posterUrl.isNotBlank()) {
                Glide.with(context)
                    .load(posterUrl)
                    .apply(
                        RequestOptions()
                            .transform(RoundedCorners(RADIUS.toInt()))
                            .placeholder(android.graphics.drawable.ColorDrawable(0xFF16161F.toInt()))
                            .error(android.graphics.drawable.ColorDrawable(0xFF1F1F2A.toInt()))
                            .centerCrop(),
                    )
                    .into(poster)
            } else {
                poster.setImageDrawable(android.graphics.drawable.ColorDrawable(0xFF1F1F2A.toInt()))
            }
        }

        fun unbind() {
            Glide.with(context).clear(poster)
            poster.setImageDrawable(null)
        }

        private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
    }
}