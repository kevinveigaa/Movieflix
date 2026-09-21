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
            MfMetrics.cardWidth(parent.context),
            MfMetrics.cardHeight(parent.context) + MfMetrics.cardTextHeight(parent.context),
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

        /**
         * Inicial mostrada quando o título NÃO tem capa.
         *
         * Sem isso o card ficava um bloco liso (o "quadrado rosa" dos prints),
         * que o usuário lê como erro de carregamento. Com a inicial sobre a
         * superfície escura, a ausência de arte fica intencional.
         */
        private val inicial = TextView(context)

        private val largura = MfMetrics.cardWidth(context)
        private val altura = MfMetrics.cardHeight(context)
        private val alturaTexto = MfMetrics.cardTextHeight(context)
        private val raio = (altura * 0.045f).toInt().coerceAtLeast(6)

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
                LayoutParams(LayoutParams.MATCH_PARENT, (altura * 0.36f).toInt()).apply {
                    gravity = Gravity.BOTTOM
                },
            )

            // Botão play circular (centro) — revelado no foco
            btnPlay.setImageResource(R.drawable.ic_mf_play)
            btnPlay.setBackgroundResource(R.drawable.bg_play_circle)
            val ladoPlay = (altura * 0.20f).toInt()
            val padPlay = (ladoPlay * 0.25f).toInt()
            btnPlay.setPadding(padPlay, padPlay, (padPlay * 0.8f).toInt(), padPlay)
            val playLp = LayoutParams(ladoPlay, ladoPlay).apply {
                gravity = Gravity.CENTER
            }
            posterWrap.addView(btnPlay, playLp)
            btnPlay.visibility = View.GONE

            // Botão favorito (canto inferior direito) — revelado no foco
            btnFavorito.setImageResource(R.drawable.ic_mf_favorite)
            btnFavorito.setBackgroundResource(R.drawable.bg_icon_circle)
            val ladoFav = (altura * 0.145f).toInt()
            val padFav = (ladoFav * 0.24f).toInt()
            btnFavorito.setPadding(padFav, padFav, padFav, padFav)
            val favLp = LayoutParams(ladoFav, ladoFav).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                marginEnd = (largura * 0.05f).toInt()
                bottomMargin = (altura * 0.05f).toInt()
            }
            posterWrap.addView(btnFavorito, favLp)
            btnFavorito.visibility = View.GONE

            // Inicial do título (só aparece quando não há capa)
            inicial.setTextColor(MfDesign.comAlfa(MfDesign.WHITE, 0x59))
            inicial.typeface = MfDesign.fonteDisplay(context)
            inicial.setTextSize(TypedValue.COMPLEX_UNIT_PX, (altura * 0.52f))
            inicial.gravity = Gravity.CENTER
            inicial.visibility = View.GONE
            posterWrap.addView(
                inicial,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )

            // Anel de foco em gradiente (por cima de tudo no poster)
            anelFoco.setBackgroundResource(R.drawable.bg_card_focus_ring)
            anelFoco.visibility = View.INVISIBLE
            posterWrap.addView(
                anelFoco,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )

            // ── Selos sobre o poster ──────────────────────────────────────
            val padSeloH = (largura * 0.045f).toInt()
            val padSeloV = (altura * 0.022f).toInt()
            val raioSelo = (altura * 0.022f).toInt().coerceAtLeast(3)
            val margemSelo = (largura * 0.045f).toInt()
            val tamSelo = (altura * 0.048f).coerceAtLeast(9f)

            seloDublado = MfDesign.selo(
                context, "Dublado PT-BR", MfDesign.TEAL, MfDesign.WHITE, 6f,
            ).apply {
                textSize = tamSelo
                maxLines = 1
                setPadding(padSeloH, padSeloV, padSeloH, padSeloV)
                background = android.graphics.drawable.GradientDrawable().apply {
                    cornerRadius = raioSelo.toFloat()
                    setColor(MfDesign.TEAL)
                }
            }
            posterWrap.addView(
                seloDublado,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.TOP or Gravity.START
                    topMargin = margemSelo
                    marginStart = margemSelo
                },
            )

            seloAno = MfDesign.selo(context, "", 0xD905050A.toInt(), MfDesign.WHITE, 6f).apply {
                textSize = tamSelo
                setPadding(padSeloH, padSeloV, padSeloH, padSeloV)
                background = android.graphics.drawable.GradientDrawable().apply {
                    cornerRadius = raioSelo.toFloat()
                    setColor(0xD905050A.toInt())
                }
            }
            posterWrap.addView(
                seloAno,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.TOP or Gravity.END
                    topMargin = margemSelo
                    marginEnd = margemSelo
                },
            )

            seloSerie = MfDesign.selo(
                context, "SÉRIE", 0xD905050A.toInt(), MfDesign.GRAY_LIGHT, 6f,
            ).apply {
                textSize = tamSelo
                setPadding(padSeloH, padSeloV, padSeloH, padSeloV)
                background = android.graphics.drawable.GradientDrawable().apply {
                    cornerRadius = raioSelo.toFloat()
                    setColor(0xD905050A.toInt())
                }
            }
            posterWrap.addView(
                seloSerie,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.BOTTOM or Gravity.START
                    bottomMargin = margemSelo
                    marginStart = margemSelo
                },
            )

            addView(posterWrap)

            // ── Título e meta (abaixo do poster) ──────────────────────────
            titulo.setTextColor(Color.WHITE)
            titulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, (altura * 0.050f).coerceIn(11f, 22f))
            titulo.typeface = Typeface.DEFAULT_BOLD
            titulo.maxLines = 1
            titulo.ellipsize = android.text.TextUtils.TruncateAt.END
            titulo.layoutParams = LayoutParams(largura, LayoutParams.WRAP_CONTENT).apply {
                topMargin = altura + (alturaTexto * 0.16f).toInt()
            }
            addView(titulo)

            meta.setTextColor(MfDesign.GRAY)
            meta.setTextSize(TypedValue.COMPLEX_UNIT_SP, (altura * 0.042f).coerceIn(10f, 18f))
            meta.maxLines = 1
            meta.ellipsize = android.text.TextUtils.TruncateAt.END
            meta.layoutParams = LayoutParams(largura, LayoutParams.WRAP_CONTENT).apply {
                topMargin = altura + (alturaTexto * 0.55f).toInt()
            }
            addView(meta)

            // A CAPA NUNCA é coberta: foco = borda + glow + zoom sutil.
            setOnFocusChangeListener { _, temFoco ->
                animate()
                    .scaleX(if (temFoco) 1.06f else 1f)
                    .scaleY(if (temFoco) 1.06f else 1f)
                    .setDuration(150)
                    .start()
                elevation = if (temFoco) 24f else 0f
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
                inicial.visibility = View.GONE
                Glide.with(context)
                    .load(url)
                    .apply(
                        RequestOptions()
                            .transform(RoundedCorners(raio))
                            .placeholder(ColorDrawable(MfDesign.SURFACE_STRONG))
                            .error(ColorDrawable(MfDesign.SURFACE_STRONG))
                            .centerCrop(),
                    )
                    .into(poster)
            } else {
                // Sem capa: mostra a inicial do título em vez de um bloco liso.
                poster.setImageDrawable(null)
                MfUi.preencherPlaceholder(context, movie.title, inicial)
            }
        }

        fun unbind() {
            Glide.with(context).clear(poster)
            poster.setImageDrawable(null)
            inicial.visibility = View.GONE
        }
    }
}