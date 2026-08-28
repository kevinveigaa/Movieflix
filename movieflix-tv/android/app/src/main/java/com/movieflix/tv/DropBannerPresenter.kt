package com.movieflix.tv

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
import androidx.leanback.widget.Presenter
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.bumptech.glide.request.RequestOptions

/**
 * Banner hero de destaque — réplica do HeroBanner do site MovieFlix.
 * - Backdrop grande com gradiente escuro (de baixo e da esquerda) para legibilidade.
 * - Badge "DESTAQUE" com gradiente roxo→vermelho.
 * - Chips de qualidade / idioma / gênero.
 * - Título em Bebas Neue (fonte display do site).
 * - Sinopse (máx. 3 linhas).
 * - Botão "ASSISTIR" com gradiente roxo→vermelho.
 * - Foco D-pad: borda vermelha + leve escala.
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
        private val badgeDestaque = TextView(context)
        private val chipsRow = LinearLayout(context)
        private val titulo = TextView(context)
        private val sinopse = TextView(context)
        private val btnAssistir = TextView(context)

        init {
            // Backdrop preenche todo o banner
            backdrop.scaleType = ImageView.ScaleType.CENTER_CROP
            backdrop.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            addView(backdrop)

            // Gradiente escuro (de baixo para cima + da esquerda) para legibilidade
            val grad = GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(0xFF050505.toInt(), 0xB3050505.toInt(), 0x00000000),
            )
            val gradView = View(context)
            gradView.background = grad
            gradView.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            addView(gradView)

            // Gradiente lateral esquerdo
            val gradL = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(0xE6050505.toInt(), 0x66050505.toInt(), 0x00000000),
            )
            val gradLView = View(context)
            gradLView.background = gradL
            gradLView.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            addView(gradLView)

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

            // Badge "DESTAQUE" — gradiente roxo→vermelho
            badgeDestaque.text = "DESTAQUE"
            badgeDestaque.setTextColor(Color.WHITE)
            badgeDestaque.textSize = 13f
            badgeDestaque.setTypeface(Typeface.DEFAULT_BOLD)
            badgeDestaque.setPadding(16, 7, 16, 7)
            badgeDestaque.background = GradientDrawable().apply {
                cornerRadius = 10f
                colors = intArrayOf(0xFFDF0A15.toInt(), 0xFF7C3AED.toInt())
                orientation = GradientDrawable.Orientation.LEFT_RIGHT
            }
            coluna.addView(badgeDestaque)

            // Chips (qualidade • idioma • gêneros)
            chipsRow.orientation = LinearLayout.HORIZONTAL
            chipsRow.gravity = Gravity.CENTER_VERTICAL
            val chipsLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 16 }
            coluna.addView(chipsRow, chipsLp)

            // Título em Bebas Neue (fonte display do site)
            titulo.setTextColor(Color.WHITE)
            titulo.textSize = 46f
            titulo.setTypeface(resources.getFont(R.font.bebas_neue))
            titulo.maxLines = 1
            titulo.ellipsize = android.text.TextUtils.TruncateAt.END
            titulo.setShadowLayer(6f, 0f, 2f, Color.BLACK)
            val tituloLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 14 }
            coluna.addView(titulo, tituloLp)

            // Sinopse
            sinopse.setTextColor(0xFFD4D4D8.toInt())
            sinopse.textSize = 16f
            sinopse.maxLines = 3
            sinopse.ellipsize = android.text.TextUtils.TruncateAt.END
            sinopse.setShadowLayer(4f, 0f, 1f, Color.BLACK)
            val sinLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 18 }
            coluna.addView(sinopse, sinLp)

            // Botão "▶ ASSISTIR" — gradiente roxo→vermelho
            btnAssistir.text = "▶  ASSISTIR"
            btnAssistir.setTextColor(Color.WHITE)
            btnAssistir.textSize = 18f
            btnAssistir.setTypeface(Typeface.DEFAULT_BOLD)
            btnAssistir.gravity = Gravity.CENTER
            btnAssistir.setPadding(40, 18, 40, 18)
            btnAssistir.background = GradientDrawable().apply {
                cornerRadius = 30f
                colors = intArrayOf(0xFFDF0A15.toInt(), 0xFF7C3AED.toInt())
                orientation = GradientDrawable.Orientation.LEFT_RIGHT
            }
            val btnLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 24 }
            coluna.addView(btnAssistir, btnLp)

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
                        setStroke(4, 0xFFDF0A15.toInt())
                    }
                } else {
                    elevation = 0f
                    background = null
                }
            }
        }

        private fun addChip(text: String) {
            val chip = TextView(context)
            chip.text = text
            chip.setTextColor(0xFFE4E4E7.toInt())
            chip.textSize = 13f
            chip.setTypeface(Typeface.DEFAULT_BOLD)
            chip.setPadding(16, 7, 16, 7)
            chip.background = GradientDrawable().apply {
                cornerRadius = 20f
                setColor(0x1AFFFFFF.toInt())
                setStroke(1, 0x33FFFFFF.toInt())
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { rightMargin = 10 }
            chipsRow.addView(chip, lp)
        }

        fun bind(movie: Movie) {
            titulo.text = movie.title
            sinopse.text = movie.description.ifBlank { "Sem descrição disponível." }

            chipsRow.removeAllViews()
            val qual = movie.qualidade()
            if (qual.isNotBlank()) addChip(qual)
            val idioma = movie.language.ifBlank { "pt-BR" }
            addChip(idioma)
            for (cat in movie.categorias.take(3)) {
                if (cat != "Outros") addChip(cat)
            }

            val url = movie.backdrop_url.ifBlank { movie.poster_url }
            if (url.isNotBlank()) {
                Glide.with(context)
                    .load(url)
                    .apply(
                        RequestOptions()
                            .transform(RoundedCorners(18))
                            .placeholder(android.graphics.drawable.ColorDrawable(0xFF171717.toInt()))
                            .error(android.graphics.drawable.ColorDrawable(0xFF262626.toInt()))
                            .centerCrop(),
                    )
                    .into(backdrop)
            } else {
                backdrop.setImageDrawable(android.graphics.drawable.ColorDrawable(0xFF262626.toInt()))
            }
        }

        fun unbind() {
            Glide.with(context).clear(backdrop)
            backdrop.setImageDrawable(null)
        }
    }
}