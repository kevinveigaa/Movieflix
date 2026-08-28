package com.movieflix.tv

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.leanback.widget.Presenter
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.bumptech.glide.request.RequestOptions

/**
 * Banner hero de destaque (primeira linha da Home).
 *  - Backdrop grande com gradiente escuro para legibilidade.
 *  - Título grande, meta (ano · nota · qualidade) e sinopse.
 *  - Padding generoso para NUNCA cortar o texto.
 *  - Foco D-pad: borda vermelha + leve escala.
 */
class DropBannerPresenter : Presenter() {

    private val WIDTH = 1280
    private val HEIGHT = 400

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val banner = BannerView(parent.context)
        banner.layoutParams = ViewGroup.LayoutParams(WIDTH, HEIGHT)
        banner.isFocusable = true
        banner.isFocusableInTouchMode = true
        return ViewHolder(banner)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        val movie = item as Movie
        (viewHolder.view as BannerView).bind(movie)
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) {
        (viewHolder.view as BannerView).unbind()
    }

    class BannerView(context: android.content.Context) : FrameLayout(context) {

        private val backdrop = ImageView(context)
        private val titulo = TextView(context)
        private val meta = TextView(context)
        private val sinopse = TextView(context)

        init {
            // Backdrop preenche todo o banner
            backdrop.scaleType = ImageView.ScaleType.CENTER_CROP
            backdrop.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            addView(backdrop)

            // Gradiente escuro da esquerda para legibilidade
            val grad = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(0xF20A0A0F.toInt(), 0x990A0A0F.toInt(), 0x33000000),
            )
            val gradView = View(context)
            gradView.background = grad
            gradView.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            addView(gradView)

            // Conteúdo (coluna à esquerda) com padding generoso
            val coluna = LinearLayout(context)
            coluna.orientation = LinearLayout.VERTICAL
            coluna.gravity = Gravity.CENTER_VERTICAL
            coluna.setPadding(64, 0, 64, 0)
            val colLp = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            addView(coluna, colLp)

            titulo.setTextColor(Color.WHITE)
            titulo.textSize = 42f
            titulo.setTypeface(android.graphics.Typeface.DEFAULT_BOLD)
            titulo.maxLines = 1
            titulo.ellipsize = android.text.TextUtils.TruncateAt.END
            titulo.setShadowLayer(6f, 0f, 2f, Color.BLACK)
            coluna.addView(titulo)

            meta.setTextColor(0xFFC8C8D2.toInt())
            meta.textSize = 17f
            meta.setShadowLayer(4f, 0f, 1f, Color.BLACK)
            val metaLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 14 }
            coluna.addView(meta, metaLp)

            sinopse.setTextColor(0xFFC8C8D2.toInt())
            sinopse.textSize = 16f
            sinopse.maxLines = 3
            sinopse.ellipsize = android.text.TextUtils.TruncateAt.END
            sinopse.setShadowLayer(4f, 0f, 1f, Color.BLACK)
            val sinLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 18 }
            coluna.addView(sinopse, sinLp)

            // Foco: borda vermelha + leve escala
            setOnFocusChangeListener { _, hasFocus ->
                animate().scaleX(if (hasFocus) 1.01f else 1f)
                    .scaleY(if (hasFocus) 1.01f else 1f)
                    .setDuration(120)
                    .start()
                if (hasFocus) {
                    elevation = 8f
                    background = GradientDrawable().apply {
                        cornerRadius = 18f
                        setStroke(4, 0xFFDC2626.toInt())
                    }
                } else {
                    elevation = 0f
                    background = null
                }
            }
        }

        fun bind(movie: Movie) {
            titulo.text = movie.title
            val ano = movie.ano
            val cat = movie.categorias.firstOrNull() ?: ""
            meta.text = buildString {
                if (ano.isNotBlank()) append(ano)
                if (cat.isNotBlank()) { if (isNotEmpty()) append("  •  "); append(cat) }
                append("  •  ★ ").append(movie.nota)
            }
            sinopse.text = movie.description.ifBlank { "Sem descrição disponível." }

            val url = movie.backdrop_url.ifBlank { movie.poster_url }
            if (url.isNotBlank()) {
                Glide.with(context)
                    .load(url)
                    .apply(
                        RequestOptions()
                            .transform(RoundedCorners(18))
                            .placeholder(android.graphics.drawable.ColorDrawable(0xFF16161F.toInt()))
                            .error(android.graphics.drawable.ColorDrawable(0xFF1F1F2A.toInt()))
                            .centerCrop(),
                    )
                    .into(backdrop)
            } else {
                backdrop.setImageDrawable(android.graphics.drawable.ColorDrawable(0xFF1F1F2A.toInt()))
            }
        }

        fun unbind() {
            Glide.with(context).clear(backdrop)
            backdrop.setImageDrawable(null)
        }
    }
}