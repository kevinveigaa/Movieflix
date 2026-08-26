package com.movieflix.tv

import android.view.ViewGroup
import androidx.leanback.widget.ImageCardView
import androidx.leanback.widget.Presenter
import com.bumptech.glide.Glide

/**
 * Apresenta cada item do catálogo como um card com poster.
 * Foco nativo do Leanback (zoom/realce automático com D-pad).
 */
class CardPresenter : Presenter() {

    private val CARD_WIDTH = 200
    private val CARD_HEIGHT = 300

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val card = ImageCardView(parent.context).apply {
            isFocusable = true
            isFocusableInTouchMode = true
            cardType = ImageCardView.CARD_TYPE_FLAG_CONTENT
            setMainImageDimensions(CARD_WIDTH, CARD_HEIGHT)
        }
        return ViewHolder(card)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        val movie = item as Movie
        val card = viewHolder.view as ImageCardView
        card.titleText = movie.title
        card.contentText = "${movie.qualidade()} • ${movie.ano} • ★ ${movie.nota}"
        card.setMainImageDimensions(CARD_WIDTH, CARD_HEIGHT)

        val poster = movie.poster_url.ifBlank { movie.backdrop_url }
        if (poster.isNotBlank()) {
            Glide.with(card.context)
                .load(poster)
                .placeholder(android.graphics.drawable.ColorDrawable(0xFF13131D.toInt()))
                .error(android.graphics.drawable.ColorDrawable(0xFF1F1F2E.toInt()))
                .centerCrop()
                .into(card.mainImageView)
        } else {
            card.mainImageView.setImageDrawable(
                android.graphics.drawable.ColorDrawable(0xFF1F1F2E.toInt()),
            )
        }
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) {
        val card = viewHolder.view as ImageCardView
        card.badgeImage = null
        card.mainImage = null
    }
}
