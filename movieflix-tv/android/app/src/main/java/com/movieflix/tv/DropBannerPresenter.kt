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
import android.widget.LinearLayout
import android.widget.TextView
import androidx.leanback.widget.Presenter
import com.bumptech.glide.Glide
import com.bumptech.glide.request.RequestOptions

/**
 * HERO de destaque do MovieFlix TV.
 *
 * Réplica do bloco principal da referência visual aprovada:
 *  - backdrop de tela larga com escurecimento lateral e inferior;
 *  - selo "DESTAQUE" em gradiente magenta→violeta;
 *  - chips de qualidade / idioma / gênero;
 *  - título grande na fonte display (Bebas Neue, a mesma do site);
 *  - linha de meta com estrela dourada, nota, ano e gêneros;
 *  - sinopse (até 3 linhas);
 *  - dois botões-pílula: "Assistir" (gradiente) e "Mais informações" (contorno);
 *  - indicadores de página (4 pontos, o ativo em gradiente).
 *
 * As SETAS do controle trocam o título em destaque (o banner rola junto com a
 * linha do tempo). Os dados vêm do MESMO catálogo do mobile/site.
 */
class DropBannerPresenter : Presenter() {

    private val WIDTH = 1280
    private val HEIGHT = 400

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val banner = BannerView(parent.context)
        banner.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            MfMetrics.heroHeight(parent.context),
        )
        return ViewHolder(banner)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        (viewHolder.view as BannerView).bind(item as Movie)
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) {
        (viewHolder.view as BannerView).unbind()
    }

    /** Banner completo com backdrop, textos, botões e paginação. */
    class BannerView(context: Context) : FrameLayout(context) {

        private val backdrop = ImageView(context)
        private val titulo = TextView(context)
        private val meta = TextView(context)
        private val sinopse = TextView(context)
        private val chips = LinearLayout(context)
        private val btnAssistir = TextView(context)
        private val btnInfo = TextView(context)
        private val dots = LinearLayout(context)

        /**
         * Altura do HERO como fração da tela (33%). É uma PROPRIEDADE (e não
         * uma variável local do init) porque `montarBotao()` também precisa
         * dela — e declarada ANTES do init para já estar inicializada quando
         * o init rodar.
         */
        private val alturaHero = MfMetrics.heroHeight(context)

        /** Ações expostas para a Activity ligar navegação/player. */
        var onAssistir: (() -> Unit)? = null
        var onDetalhes: (() -> Unit)? = null

        init {
            // ── Backdrop ──────────────────────────────────────────────────
            backdrop.scaleType = ImageView.ScaleType.CENTER_CROP
            backdrop.background = ColorDrawable(MfDesign.SURFACE)
            addView(
                backdrop,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )

            // Escurecimentos (lateral + inferior) para leitura confortável
            listOf(R.drawable.hero_scrim_left, R.drawable.hero_scrim_bottom).forEach { d ->
                val scrim = View(context)
                scrim.setBackgroundResource(d)
                addView(scrim, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            }

            // ── Coluna de conteúdo ────────────────────────────────────────
            val coluna = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(
                    (MfMetrics.largura(context) * 0.026f).toInt(), 0,
                    (MfMetrics.largura(context) * 0.026f).toInt(), 0,
                )
            }
            addView(
                coluna,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )

            // Selo DESTAQUE
            val seloDestaque = TextView(context).apply {
                background = MfDesign.gradienteDestaque(8f)
                text = "DESTAQUE"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                typeface = Typeface.DEFAULT_BOLD
                letterSpacing = 0.14f
                setPadding(
                    MfDesign.dp(context, 14f), MfDesign.dp(context, 6f),
                    MfDesign.dp(context, 14f), MfDesign.dp(context, 6f),
                )
            }
            coluna.addView(seloDestaque)

            // Chips
            chips.orientation = LinearLayout.HORIZONTAL
            chips.gravity = Gravity.CENTER_VERTICAL
            coluna.addView(
                chips,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = MfDesign.dp(context, 14f) },
            )

            // Título display
            titulo.typeface = MfDesign.fonteDisplay(context)
            titulo.setTextColor(Color.WHITE)
            // Título do HERO proporcional à altura do banner (32% dela):
            // garante o mesmo impacto visual em 720p, 1080p e 4K.
            titulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, (alturaHero * 0.115f).coerceIn(22f, 58f))
            titulo.letterSpacing = 0.01f
            titulo.maxLines = 2
            titulo.ellipsize = android.text.TextUtils.TruncateAt.END
            titulo.setShadowLayer(8f, 0f, 3f, Color.BLACK)
            coluna.addView(
                titulo,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = MfDesign.dp(context, 12f) },
            )

            // Linha de meta (★ nota | ano | gêneros)
            meta.setTextColor(MfDesign.GRAY_LIGHT)
            meta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            meta.typeface = Typeface.DEFAULT_BOLD
            meta.maxLines = 1
            meta.setShadowLayer(5f, 0f, 1f, Color.BLACK)
            coluna.addView(
                meta,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = MfDesign.dp(context, 10f) },
            )

            // Sinopse
            sinopse.setTextColor(MfDesign.GRAY_LIGHT)
            sinopse.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            sinopse.maxLines = 3
            sinopse.ellipsize = android.text.TextUtils.TruncateAt.END
            sinopse.setLineSpacing(MfDesign.dp(context, 3f).toFloat(), 1f)
            sinopse.setShadowLayer(5f, 0f, 1f, Color.BLACK)
            coluna.addView(
                sinopse,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = MfDesign.dp(context, 12f)
                    marginEnd = MfDesign.dp(context, 220f)
                },
            )

            // Botões
            val linhaBotoes = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            coluna.addView(
                linhaBotoes,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = MfDesign.dp(context, 18f) },
            )

            montarBotao(
                btnAssistir,
                "\u25B6  Assistir",
                R.drawable.bg_pill_primary,
                acao = { onAssistir?.invoke() },
            )
            linhaBotoes.addView(btnAssistir)

            montarBotao(
                btnInfo,
                "Mais informações",
                R.drawable.bg_pill_secondary,
                acao = { onDetalhes?.invoke() },
            )
            (btnInfo.layoutParams as? LinearLayout.LayoutParams)?.let {
                it.marginStart = MfDesign.dp(context, 14f)
            } ?: run {
                btnInfo.layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { marginStart = MfDesign.dp(context, 14f) }
            }
            linhaBotoes.addView(btnInfo)

            // Indicadores de página (canto inferior direito)
            dots.orientation = LinearLayout.HORIZONTAL
            dots.gravity = Gravity.CENTER_VERTICAL
            addView(
                dots,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.BOTTOM or Gravity.END
                    marginEnd = MfDesign.dp(context, 44f)
                    bottomMargin = MfDesign.dp(context, 26f)
                },
            )
        }

        private fun montarBotao(
            tv: TextView,
            texto: String,
            fundo: Int,
            acao: () -> Unit,
        ) {
            tv.text = texto
            tv.background = resources.getDrawable(fundo, null)
            tv.setTextColor(Color.WHITE)
            tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            tv.typeface = Typeface.DEFAULT_BOLD
            tv.gravity = Gravity.CENTER
            tv.isFocusable = true
            tv.isFocusableInTouchMode = true
            tv.isClickable = true
            tv.setPadding(
                MfDesign.dp(context, 30f), 0,
                MfDesign.dp(context, 30f), 0,
            )
            tv.layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                (alturaHero * 0.12f).toInt().coerceAtLeast(34),
            ).apply { minimumWidth = (MfMetrics.largura(context) * 0.14f).toInt() }
            MfDesign.focoBotao(tv)
            tv.setOnClickListener { acao() }
        }

        /** Quantos indicadores de página desenhar (4 destaques). */
        fun definirPaginas(total: Int, atual: Int) {
            dots.removeAllViews()
            val n = total.coerceIn(1, 8)
            for (i in 0 until n) {
                val ativo = i == atual
                val ponto = View(context)
                val lp = LinearLayout.LayoutParams(
                    if (ativo) MfDesign.dp(context, 26f) else MfDesign.dp(context, 9f),
                    MfDesign.dp(context, 9f),
                ).apply { marginStart = MfDesign.dp(context, 7f) }
                ponto.background = if (ativo) {
                    MfDesign.gradientePrimario(6f)
                } else {
                    android.graphics.drawable.GradientDrawable().apply {
                        cornerRadius = MfDesign.dp(context, 6f).toFloat()
                        setColor(0x59FFFFFF)
                    }
                }
                dots.addView(ponto, lp)
            }
        }

        fun bind(movie: Movie) {
            titulo.text = movie.title
            sinopse.text = movie.description.ifBlank { "Sem descrição disponível." }

            // Chips: qualidade • idioma • gêneros (mesma leitura do mobile)
            chips.removeAllViews()
            addChip(movie.qualidade())
            addChip(if (movie.dublado_ptbr == true) "Dublado PT-BR" else movie.language.ifBlank { "pt-BR" })
            if (movie.ehSerie) addChip("Série") else addChip("Filme")

            // Meta: ★ nota | ano | gêneros
            val partes = mutableListOf<String>()
            if (movie.vote_average > 0) partes.add("\u2605 ${movie.nota}")
            if (movie.ano.isNotBlank()) partes.add(movie.ano)
            val generos = movie.categorias.filter { it != "Outros" }.take(3)
            if (generos.isNotEmpty()) partes.add(generos.joinToString(", "))
            meta.text = partes.joinToString("   |   ")

            val url = movie.backdrop_url.ifBlank { movie.poster_url }
            if (url.isNotBlank()) {
                Glide.with(context)
                    .load(url)
                    .apply(
                        RequestOptions()
                            .placeholder(ColorDrawable(MfDesign.SURFACE))
                            .error(ColorDrawable(MfDesign.SURFACE))
                            .centerCrop(),
                    )
                    .into(backdrop)
            } else {
                backdrop.setImageDrawable(ColorDrawable(MfDesign.SURFACE))
            }
        }

        private fun addChip(texto: String) {
            if (texto.isBlank()) return
            val chip = MfDesign.chip(context, texto)
            chips.addView(
                chip,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    MfDesign.dp(context, 30f),
                ).apply { marginEnd = MfDesign.dp(context, 9f) },
            )
        }

        fun unbind() {
            Glide.with(context).clear(backdrop)
            backdrop.setImageDrawable(null)
        }

        /** Foco inicial do D-pad dentro do banner: o botão "Assistir". */
        fun focarAcaoPrincipal() = btnAssistir.requestFocus()
    }
}
