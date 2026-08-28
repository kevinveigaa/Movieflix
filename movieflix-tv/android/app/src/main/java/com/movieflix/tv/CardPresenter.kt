package com.movieflix.tv

import android.graphics.Color
import android.graphics.Typeface
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
 * Card de catálogo nativo — réplica do PosterCard do site MovieFlix.
 *  - Poster 2:3 grande com cantos arredondados e GUTTER entre cards.
 *  - Badge "Dublado pt-BR" (verde esmeralda, canto sup. esquerdo).
 *  - Badge de ANO (preto translúcido, canto sup. direito).
 *  - Badge "SÉRIE" (preto translúcido, canto inf. esquerdo) para séries.
 *  - Ícone play (gradiente roxo→vermelho) no hover/foco.
 *  - Título + nota abaixo do poster.
 *  - Foco D-pad: borda gradiente roxo→vermelho + leve escala + sombra.
 */
class CardPresenter : Presenter() {

    companion object {
        const val CARD_WIDTH = 240
        const val CARD_HEIGHT = 360
        const val RADIUS = 14f
        const val GUTTER = 18
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
        (viewHolder.view as MovieCardView).bind(movie)
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) {
        (viewHolder.view as MovieCardView).unbind()
    }

    class MovieCardView(context: android.content.Context) : FrameLayout(context) {

        private val poster = ImageView(context)
        private val badgeDublado = TextView(context)
        private val badgeAno = TextView(context)
        private val badgeSerie = TextView(context)
        private val playIcon = TextView(context)
        private val titulo = TextView(context)
        private val meta = TextView(context)

        init {
            // Poster
            poster.scaleType = ImageView.ScaleType.CENTER_CROP
            poster.layoutParams = FrameLayout.LayoutParams(CARD_WIDTH, CARD_HEIGHT)
            addView(poster)

            // Badge "Dublado pt-BR" — verde esmeralda (emerald-600), topo esquerdo
            badgeDublado.text = "Dublado pt-BR"
            badgeDublado.setTextColor(Color.WHITE)
            badgeDublado.textSize = 11f
            badgeDublado.setTypeface(Typeface.DEFAULT_BOLD)
            badgeDublado.setPadding(12, 5, 12, 5)
            badgeDublado.background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(0xE6059669.toInt()) // emerald-600
            }
            val badgeDubladoLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                topMargin = 10
                leftMargin = 10
            }
            addView(badgeDublado, badgeDubladoLp)

            // Badge ano — preto translúcido, topo direito
            badgeAno.setTextColor(Color.WHITE)
            badgeAno.textSize = 11f
            badgeAno.setTypeface(Typeface.DEFAULT_BOLD)
            badgeAno.setPadding(10, 4, 10, 4)
            badgeAno.background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(0xB3000000.toInt())
            }
            val badgeAnoLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                gravity = Gravity.TOP or Gravity.END
                topMargin = 10
                rightMargin = 10
            }
            addView(badgeAno, badgeAnoLp)

            // Badge "SÉRIE" — preto translúcido, inferior esquerdo
            badgeSerie.text = "SÉRIE"
            badgeSerie.setTextColor(0xFFE4E4E7.toInt())
            badgeSerie.textSize = 10f
            badgeSerie.setTypeface(Typeface.DEFAULT_BOLD)
            badgeSerie.setPadding(10, 4, 10, 4)
            badgeSerie.background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(0xB3000000.toInt())
            }
            val badgeSerieLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.START
                bottomMargin = 10
                leftMargin = 10
            }
            addView(badgeSerie, badgeSerieLp)

            // Ícone play (gradiente roxo→vermelho) — visível no foco
            playIcon.text = "▶"
            playIcon.setTextColor(Color.WHITE)
            playIcon.textSize = 16f
            playIcon.gravity = Gravity.CENTER
            playIcon.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                colors = intArrayOf(0xFFDF0A15.toInt(), 0xFF7C3AED.toInt())
                gradientType = GradientDrawable.LINEAR_GRADIENT
                orientation = GradientDrawable.Orientation.TL_BR
            }
            val playLp = FrameLayout.LayoutParams(56, 56).apply {
                gravity = Gravity.CENTER
            }
            addView(playIcon, playLp)
            playIcon.visibility = View.GONE

            // Título
            titulo.setTextColor(Color.WHITE)
            titulo.textSize = 15f
            titulo.setTypeface(Typeface.DEFAULT_BOLD)
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
            meta.setTextColor(0xFFA1A1AA.toInt())
            meta.textSize = 12f
            val metaLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = CARD_HEIGHT + 30
            }
            addView(meta, metaLp)

            // Foco: borda gradiente roxo→vermelho + escala + sombra + ícone play
            setOnFocusChangeListener { _, hasFocus ->
                animate().scaleX(if (hasFocus) 1.08f else 1f)
                    .scaleY(if (hasFocus) 1.08f else 1f)
                    .setDuration(150)
                    .start()
                if (hasFocus) {
                    elevation = 16f
                    poster.background = GradientDrawable().apply {
                        cornerRadius = RADIUS
                        colors = intArrayOf(0xFFDF0A15.toInt(), 0xFF7C3AED.toInt())
                        orientation = GradientDrawable.Orientation.TL_BR
                        setStroke(5, 0xFFDF0A15.toInt())
                    }
                    playIcon.visibility = View.VISIBLE
                } else {
                    elevation = 0f
                    poster.background = null
                    playIcon.visibility = View.GONE
                }
            }
        }

        fun bind(movie: Movie) {
            titulo.text = movie.title
            val ano = movie.ano
            meta.text = if (ano.isNotBlank()) "$ano  •  ★ ${movie.nota}" else "★ ${movie.nota}"

            badgeDublado.visibility = if (movie.dublado_ptbr == true) View.VISIBLE else View.GONE
            badgeAno.visibility = if (ano.isNotBlank()) View.VISIBLE else View.GONE
            badgeAno.text = ano
            badgeSerie.visibility = if (movie.ehSerie) View.VISIBLE else View.GONE

            val posterUrl = movie.poster_url.ifBlank { movie.backdrop_url }
            if (posterUrl.isNotBlank()) {
                Glide.with(context)
                    .load(posterUrl)
                    .apply(
                        RequestOptions()
                            .transform(RoundedCorners(RADIUS.toInt()))
                            .placeholder(android.graphics.drawable.ColorDrawable(0xFF171717.toInt()))
                            .error(android.graphics.drawable.ColorDrawable(0xFF262626.toInt()))
                            .centerCrop(),
                    )
                    .into(poster)
            } else {
                poster.setImageDrawable(android.graphics.drawable.ColorDrawable(0xFF262626.toInt()))
            }
        }

        fun unbind() {
            Glide.with(context).clear(poster)
            poster.setImageDrawable(null)
        }
    }
}