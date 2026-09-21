package com.movieflix.tv

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.util.TypedValue
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
 * Card de catálogo do MovieFlix TV — reconstruído para a identidade visual
 * nova e para consumo a distância (controle remoto).
 *
 * Visual (referência aprovada):
 *  - poster 2:3 grande com cantos arredondados (12dp);
 *  - selo TEAL "Dublado PT-BR" no canto superior esquerdo;
 *  - selo escuro com o ANO no canto superior direito;
 *  - selo escuro "SÉRIE" no canto inferior esquerdo (quando for série);
 *  - ao FOCAR: anel em gradiente violeta→índigo, leve aumento de escala,
 *    sombra e revelação de um botão play circular + botão favorito.
 *
 * Regras de dados: idênticas ao mobile/site (mesmo catálogo, mesmos campos,
 * mesmos selos). Nada é inventado aqui.
 */
class CardPresenter : Presenter() {

    companion object {
        // Cards MENORES (pedido do dono): ~6 colunas visíveis em 1080p e mais
        // fileiras por tela, sem perder a leitura a distância.
        const val CARD_WIDTH = 168
        const val CARD_HEIGHT = 252
        const val RADIUS = 12
        const val TEXT_AREA = 52
    }

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val card = MovieCardView(parent.context)
        card.layoutParams = ViewGroup.LayoutParams(
            MfDesign.dp(parent.context, CARD_WIDTH.toFloat()),
            MfDesign.dp(parent.context, (CARD_HEIGHT + TEXT_AREA).toFloat()),
        )
        card.isFocusable = true
        card.isFocusableInTouchMode = true
        return ViewHolder(card)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        (viewHolder.view as MovieCardView).bind(item as Movie)
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) {
        (viewHolder.view as MovieCardView).unbind()
    }

    /** Card individual: poster + selos + overlay de foco + título/meta. */
    class MovieCardView(context: Context) : FrameLayout(context) {

        private val posterWrap = FrameLayout(context)
        private val poster = ImageView(context)
        private val anelFoco = View(context)
        private val overlay = View(context)
        private val btnPlay = ImageView(context)
        private val btnFavorito = ImageView(context)
        private val seloDublado: TextView
        private val seloAno: TextView
        private val seloSerie: TextView
        private val titulo = TextView(context)
        private val meta = TextView(context)

        private val largura = MfDesign.dp(context, CARD_WIDTH.toFloat())
        private val altura = MfDesign.dp(context, CARD_HEIGHT.toFloat())

        init {
            // ── Poster ────────────────────────────────────────────────────
            posterWrap.layoutParams = LayoutParams(largura, altura).apply {
                topMargin = 0
            }
            poster.scaleType = ImageView.ScaleType.CENTER_CROP
            poster.background = resources.getDrawable(R.drawable.bg_poster_placeholder, null)
            posterWrap.addView(
                poster,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )

            // Overlay escuro no rodapé do poster (só aparece em foco)
            overlay.setBackgroundResource(R.drawable.bg_card_overlay)
            overlay.visibility = View.GONE
            posterWrap.addView(
                overlay,
                LayoutParams(LayoutParams.MATCH_PARENT, MfDesign.dp(context, 110f)).apply {
                    gravity = Gravity.BOTTOM
                },
            )

            // Botão play circular (centro) — revelado no foco
            btnPlay.setImageResource(R.drawable.ic_mf_play)
            btnPlay.setBackgroundResource(R.drawable.bg_play_circle)
            btnPlay.setPadding(
                MfDesign.dp(context, 13f), MfDesign.dp(context, 13f),
                MfDesign.dp(context, 10f), MfDesign.dp(context, 10f),
            )
            val playLp = LayoutParams(MfDesign.dp(context, 52f), MfDesign.dp(context, 52f)).apply {
                gravity = Gravity.CENTER
            }
            posterWrap.addView(btnPlay, playLp)
            btnPlay.visibility = View.GONE

            // Botão favorito (canto inferior direito) — revelado no foco
            btnFavorito.setImageResource(R.drawable.ic_mf_favorite)
            btnFavorito.setBackgroundResource(R.drawable.bg_icon_circle)
            btnFavorito.setPadding(
                MfDesign.dp(context, 9f), MfDesign.dp(context, 9f),
                MfDesign.dp(context, 9f), MfDesign.dp(context, 9f),
            )
            val favLp = LayoutParams(MfDesign.dp(context, 38f), MfDesign.dp(context, 38f)).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                marginEnd = MfDesign.dp(context, 10f)
                bottomMargin = MfDesign.dp(context, 10f)
            }
            posterWrap.addView(btnFavorito, favLp)
            btnFavorito.visibility = View.GONE

            // Anel de foco em gradiente (por cima de tudo no poster)
            anelFoco.setBackgroundResource(R.drawable.bg_card_focus_ring)
            anelFoco.visibility = View.INVISIBLE
            posterWrap.addView(
                anelFoco,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )

            // ── Selos sobre o poster ──────────────────────────────────────
            seloDublado = MfDesign.selo(
                context, "Dublado PT-BR", MfDesign.TEAL, MfDesign.WHITE, 6f,
            ).apply {
                textSize = 10f
                maxLines = 1
            }
            posterWrap.addView(
                seloDublado,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.TOP or Gravity.START
                    topMargin = MfDesign.dp(context, 9f)
                    marginStart = MfDesign.dp(context, 9f)
                },
            )

            seloAno = MfDesign.selo(context, "", 0xD905050A.toInt(), MfDesign.WHITE, 6f).apply {
                textSize = 10f
            }
            posterWrap.addView(
                seloAno,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.TOP or Gravity.END
                    topMargin = MfDesign.dp(context, 9f)
                    marginEnd = MfDesign.dp(context, 9f)
                },
            )

            seloSerie = MfDesign.selo(
                context, "SÉRIE", 0xD905050A.toInt(), MfDesign.GRAY_LIGHT, 6f,
            ).apply { textSize = 9f }
            posterWrap.addView(
                seloSerie,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.BOTTOM or Gravity.START
                    bottomMargin = MfDesign.dp(context, 9f)
                    marginStart = MfDesign.dp(context, 9f)
                },
            )

            addView(posterWrap)

            // ── Título e meta (abaixo do poster) ──────────────────────────
            titulo.setTextColor(Color.WHITE)
            titulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            titulo.typeface = Typeface.DEFAULT_BOLD
            titulo.maxLines = 1
            titulo.ellipsize = android.text.TextUtils.TruncateAt.END
            titulo.layoutParams = LayoutParams(largura, LayoutParams.WRAP_CONTENT).apply {
                topMargin = altura + MfDesign.dp(context, 8f)
            }
            addView(titulo)

            meta.setTextColor(MfDesign.GRAY)
            meta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            meta.maxLines = 1
            meta.ellipsize = android.text.TextUtils.TruncateAt.END
            meta.layoutParams = LayoutParams(largura, LayoutParams.WRAP_CONTENT).apply {
                topMargin = altura + MfDesign.dp(context, 28f)
            }
            addView(meta)

            // ── Comportamento de foco (D-pad) ─────────────────────────────
            setOnFocusChangeListener { _, temFoco ->
                animate()
                    .scaleX(if (temFoco) 1.06f else 1f)
                    .scaleY(if (temFoco) 1.06f else 1f)
                    .setDuration(150)
                    .start()
                elevation = if (temFoco) 18f else 0f
                anelFoco.visibility = if (temFoco) View.VISIBLE else View.INVISIBLE
                overlay.visibility = if (temFoco) View.VISIBLE else View.GONE
                btnPlay.visibility = if (temFoco) View.VISIBLE else View.GONE
                btnFavorito.visibility = if (temFoco) View.VISIBLE else View.GONE
                titulo.setTextColor(if (temFoco) Color.WHITE else MfDesign.GRAY_LIGHT)
            }
        }

        fun bind(movie: Movie) {
            titulo.text = movie.title
            val ano = movie.ano
            meta.text = if (ano.isNotBlank()) "$ano  •  ★ ${movie.nota}" else "★ ${movie.nota}"

            seloDublado.visibility = if (movie.dublado_ptbr == true) View.VISIBLE else View.GONE
            seloAno.visibility = if (ano.isNotBlank()) View.VISIBLE else View.GONE
            seloAno.text = ano
            seloSerie.visibility = if (movie.ehSerie) View.VISIBLE else View.GONE

            val url = movie.poster_url.ifBlank { movie.backdrop_url }
            if (url.isNotBlank()) {
                Glide.with(context)
                    .load(url)
                    .apply(
                        RequestOptions()
                            .transform(RoundedCorners(MfDesign.dp(context, RADIUS.toFloat())))
                            .placeholder(ColorDrawable(MfDesign.SURFACE_LIGHT))
                            .error(ColorDrawable(MfDesign.SURFACE_STRONG))
                            .centerCrop(),
                    )
                    .into(poster)
            } else {
                poster.setImageDrawable(ColorDrawable(MfDesign.SURFACE_STRONG))
            }
        }

        fun unbind() {
            Glide.with(context).clear(poster)
            poster.setImageDrawable(null)
        }
    }
}
