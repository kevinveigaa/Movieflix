package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.bumptech.glide.request.RequestOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Detalhes do título — tela de TV reconstruída sobre a identidade visual nova.
 *
 * Lógica preservada do app TV/mobile:
 *  - dados do MESMO catálogo (CatalogRepository.porId);
 *  - botão ASSISTIR monta a mesma URL e abre o player nativo;
 *  - MINHA LISTA usa a MESMA tabela `favorites` do site (por tmdb_id);
 *  - séries usam `episodes_available` para temporadas/episódios.
 *
 * Navegação: OK ativa, LEFT/RIGHT entre chips e botões, UP/DOWN rolam, BACK sai.
 */
class DetailsActivity : SidebarHostActivity() {

    override val itemAtivo: String = "inicio"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var movie: Movie

    private var temporadas: List<Int> = emptyList()
    private var temporadaAtual: Int = 1
    private var episodiosTemporada: List<Int> = emptyList()
    private var episodioAtual: Int = 1
    private var naLista: Boolean = false

    private lateinit var scroll: ScrollView
    private lateinit var btnLista: TextView
    private lateinit var lblTemporada: TextView
    private lateinit var lblEpisodio: TextView
    private lateinit var chipsTemporada: LinearLayout
    private lateinit var chipsEpisodio: LinearLayout
    private lateinit var blocoEpisodios: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val movieId = intent.getStringExtra("movie_id")
        val m = movieId?.let { CatalogRepository.porId(this, it) }
        if (m == null) {
            // Nunca fecha em silêncio: explica e oferece voltar (navegável).
            val erro = MfDesign.erro(
                this,
                "Título não encontrado",
                "Este título não está no catálogo. Volte e escolha outro.",
            ) { finish() }
            content.addView(
                erro,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            return
        }
        movie = m

        montarTela()
        carregarEstadoLista()
    }

    // ── Estrutura ──────────────────────────────────────────────────────────
    private fun montarTela() {
        val raiz = FrameLayout(this)
        content.addView(
            raiz,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        // Backdrop de fundo
        val backdrop = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        raiz.addView(
            backdrop,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
        raiz.addView(
            View(this).apply { setBackgroundResource(R.drawable.details_scrim) },
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        scroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setPadding(
                MfDesign.dp(this@DetailsActivity, 36f),
                MfDesign.dp(this@DetailsActivity, 30f),
                MfDesign.dp(this@DetailsActivity, 36f),
                MfDesign.dp(this@DetailsActivity, 34f),
            )
        }

        val linhaPrincipal = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        // ── Poster ────────────────────────────────────────────────────────
        val posterWrap = FrameLayout(this).apply {
            background = resources.getDrawable(R.drawable.bg_poster_placeholder, null)
        }
        val poster = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        posterWrap.addView(
            poster,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
        val seloDublado = MfDesign.selo(this, "Dublado pt-BR", MfDesign.TEAL, Color.WHITE, 6f)
        posterWrap.addView(
            seloDublado,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                topMargin = MfDesign.dp(this@DetailsActivity, 12f)
                marginStart = MfDesign.dp(this@DetailsActivity, 12f)
            },
        )
        linhaPrincipal.addView(
            posterWrap,
            LinearLayout.LayoutParams(
                MfDesign.dp(this@DetailsActivity, 250f),
                MfDesign.dp(this@DetailsActivity, 375f),
            ),
        )

        // ── Coluna de informações ─────────────────────────────────────────
        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(MfDesign.dp(this@DetailsActivity, 36f), 0, 0, 0)
        }

        info.addView(
            TextView(this).apply {
                text = movie.title
                typeface = MfDesign.fonteDisplay(this@DetailsActivity)
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 52f)
                letterSpacing = 0.01f
                maxLines = 2
                ellipsize = android.text.TextUtils.TruncateAt.END
                setShadowLayer(8f, 0f, 3f, Color.BLACK)
            },
        )

        // Chips de metadados (tipo • ano • gênero • nota • qualidade • idioma)
        val chips = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, MfDesign.dp(this@DetailsActivity, 12f), 0, 0)
        }
        val tipoTxt = if (movie.ehSerie) "Série" else "Filme"
        val qual = movie.qualidade()
        val idioma = movie.language.ifBlank { "pt-BR" }
        listOfNotNull(
            tipoTxt,
            movie.ano.ifBlank { null },
            movie.categorias.firstOrNull { it != "Outros" },
            if (movie.vote_average > 0) "★ ${movie.nota}" else null,
            qual.ifBlank { null },
            idioma,
            if (!movie.ehSerie && (movie.duration ?: 0) > 0) "${movie.duration!! / 60} min" else null,
        ).forEach { texto ->
            val chip = MfDesign.chip(this, texto)
            chips.addView(
                chip,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    MfDesign.dp(this@DetailsActivity, 30f),
                ).apply { marginEnd = MfDesign.dp(this@DetailsActivity, 8f) },
            )
        }
        info.addView(chips)

        info.addView(
            TextView(this).apply {
                text = movie.description.ifBlank { "Sem descrição disponível." }
                setTextColor(MfDesign.GRAY_LIGHT)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                maxLines = 7
                ellipsize = android.text.TextUtils.TruncateAt.END
                setLineSpacing(MfDesign.dp(this@DetailsActivity, 4f).toFloat(), 1f)
            },
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@DetailsActivity, 16f) },
        )

        // ── Botões ────────────────────────────────────────────────────────
        val linhaBotoes = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, MfDesign.dp(this@DetailsActivity, 22f), 0, 0)
        }
        val btnAssistir = botao("\u25B6  Assistir", R.drawable.bg_pill_primary) { abrirPlayer() }
        btnLista = botao("\u2661  Favoritos", R.drawable.bg_pill_secondary) { alternarLista() }
        linhaBotoes.addView(btnAssistir)
        linhaBotoes.addView(
            btnLista,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                MfDesign.dp(this@DetailsActivity, 52f),
            ).apply { marginStart = MfDesign.dp(this@DetailsActivity, 14f) },
        )
        info.addView(linhaBotoes)

        // ── Seletor de temporada/episódio (séries) ────────────────────────
        blocoEpisodios = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setPadding(0, MfDesign.dp(this@DetailsActivity, 20f), 0, 0)
        }
        lblTemporada = TextView(this).apply {
            setTextColor(MfDesign.WHITE)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
        }
        chipsTemporada = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, MfDesign.dp(this@DetailsActivity, 8f), 0, 0)
        }
        blocoEpisodios.addView(lblTemporada)
        blocoEpisodios.addView(chipsTemporada)

        lblEpisodio = TextView(this).apply {
            setTextColor(MfDesign.WHITE)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
        }
        chipsEpisodio = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, MfDesign.dp(this@DetailsActivity, 8f), 0, 0)
        }
        blocoEpisodios.addView(
            lblEpisodio,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@DetailsActivity, 14f) },
        )
        blocoEpisodios.addView(chipsEpisodio)
        info.addView(blocoEpisodios)

        linhaPrincipal.addView(
            info,
            LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f,
            ),
        )
        scroll.addView(linhaPrincipal)
        raiz.addView(
            scroll,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        // Imagens (mesmas URLs do catálogo)
        val posterUrl = movie.poster_url.ifBlank { movie.backdrop_url }
        if (posterUrl.isNotBlank()) {
            Glide.with(this).load(posterUrl)
                .apply(
                    RequestOptions()
                        .transform(RoundedCorners(MfDesign.dp(this, 14f)))
                        .placeholder(ColorDrawable(MfDesign.SURFACE_LIGHT))
                        .error(ColorDrawable(MfDesign.SURFACE_STRONG))
                        .centerCrop(),
                )
                .into(poster)
        }
        val backdropUrl = movie.backdrop_url.ifBlank { movie.poster_url }
        if (backdropUrl.isNotBlank()) {
            Glide.with(this).load(backdropUrl)
                .apply(
                    RequestOptions()
                        .placeholder(ColorDrawable(MfDesign.BG))
                        .error(ColorDrawable(MfDesign.BG))
                        .centerCrop(),
                )
                .into(backdrop)
        }
        seloDublado.visibility = if (movie.dublado_ptbr == true) View.VISIBLE else View.GONE

        // Séries: prepara o seletor de temporada/episódio
        if (movie.ehSerie) {
            temporadas = MediaCatalog.temporadas(movie)
            if (!temporadas.contains(temporadaAtual)) temporadaAtual = temporadas.first()
            atualizarEpisodiosDaTemporada()
            blocoEpisodios.visibility = View.VISIBLE
            montarChipsTemporada()
            montarChipsEpisodio()
        }

        btnAssistir.requestFocus()
    }

    // ── Chips de temporada / episódio ──────────────────────────────────────
    private fun montarChipsTemporada() {
        chipsTemporada.removeAllViews()
        for (t in temporadas) {
            val chip = chipSelecionavel("Temporada $t", t == temporadaAtual)
            chip.setOnClickListener {
                temporadaAtual = t
                episodioAtual = -1
                atualizarEpisodiosDaTemporada()
                montarChipsTemporada()
                montarChipsEpisodio()
            }
            chipsTemporada.addView(chip)
        }
        lblTemporada.text = "Temporada $temporadaAtual de ${temporadas.size}"
    }

    private fun montarChipsEpisodio() {
        chipsEpisodio.removeAllViews()
        for (e in episodiosTemporada) {
            val chip = chipSelecionavel("E$e", e == episodioAtual)
            chip.setOnClickListener {
                episodioAtual = e
                montarChipsEpisodio()
            }
            chipsEpisodio.addView(chip)
        }
        lblEpisodio.text = "Episódio $episodioAtual de ${episodiosTemporada.size}"
    }

    private fun chipSelecionavel(texto: String, selecionado: Boolean): TextView =
        TextView(this).apply {
            text = texto
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            setPadding(
                MfDesign.dp(this@DetailsActivity, 18f), MfDesign.dp(this@DetailsActivity, 8f),
                MfDesign.dp(this@DetailsActivity, 18f), MfDesign.dp(this@DetailsActivity, 8f),
            )
            background = fundoChip(selecionado, false)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { marginEnd = MfDesign.dp(this@DetailsActivity, 8f) }
            setOnFocusChangeListener { v, temFoco -> v.background = fundoChip(selecionado, temFoco) }
        }

    private fun fundoChip(selecionado: Boolean, focado: Boolean): GradientDrawable =
        GradientDrawable().apply {
            cornerRadius = MfDesign.dp(this@DetailsActivity, 20f).toFloat()
            when {
                focado -> {
                    setColor(MfDesign.SURFACE_STRONG)
                    setStroke(MfDesign.dp(this@DetailsActivity, 3f), MfDesign.PURPLE)
                }
                selecionado -> {
                    setColors(intArrayOf(MfDesign.INDIGO, MfDesign.PURPLE))
                    orientation = GradientDrawable.Orientation.LEFT_RIGHT
                }
                else -> {
                    setColor(MfDesign.SURFACE_LIGHT)
                    setStroke(MfDesign.dp(this@DetailsActivity, 1f), MfDesign.BORDER)
                }
            }
        }

    private fun botao(texto: String, fundo: Int, acao: () -> Unit): TextView =
        TextView(this).apply {
            text = texto
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            setPadding(
                MfDesign.dp(this@DetailsActivity, 30f), 0,
                MfDesign.dp(this@DetailsActivity, 30f), 0,
            )
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                MfDesign.dp(this@DetailsActivity, 52f),
            ).apply { minimumWidth = MfDesign.dp(this@DetailsActivity, 190f) }
            background = resources.getDrawable(fundo, null)
            MfDesign.focoBotao(this)
            setOnClickListener { acao() }
        }

    // ── Estado da Minha Lista (mesma tabela do site) ───────────────────────
    private fun carregarEstadoLista() {
        val tok = AuthRepository.loadToken(this)
        val tmdb = movie.tmdbIdNumerico ?: return
        if (tok.isNullOrBlank()) return
        scope.launch {
            naLista = withContext(Dispatchers.IO) { FavoritesRepository.ehFavorito(this@DetailsActivity, tmdb) }
            atualizarBotaoLista()
        }
    }

    private fun atualizarBotaoLista() {
        btnLista.text = if (naLista) "♥  Remover dos Favoritos" else "♡  Favoritos"
    }

    private fun alternarLista() {
        val tok = AuthRepository.loadToken(this)
        val tmdb = movie.tmdbIdNumerico ?: return
        if (tok.isNullOrBlank()) {
            android.widget.Toast.makeText(
                this,
                "Entre com a sua conta (site ou app) para usar os Favoritos.",
                android.widget.Toast.LENGTH_LONG,
            ).show()
            return
        }
        scope.launch {
            val ok = if (naLista) {
                withContext(Dispatchers.IO) { FavoritesRepository.remover(this@DetailsActivity, tmdb) }
            } else {
                withContext(Dispatchers.IO) {
                    FavoritesRepository.adicionar(this@DetailsActivity, tmdb, if (movie.ehSerie) "tv" else "movie")
                }
            }
            if (ok) {
                naLista = !naLista
                atualizarBotaoLista()
            }
        }
    }

    private fun atualizarEpisodiosDaTemporada() {
        episodiosTemporada = MediaCatalog.episodios(movie, temporadaAtual)
        if (!episodiosTemporada.contains(episodioAtual)) episodioAtual = episodiosTemporada.first()
    }

    private fun abrirPlayer() {
        startActivity(
            Intent(this, PlaybackActivity::class.java)
                .putExtra("movie_id", movie.id)
                .putExtra("season", temporadaAtual)
                .putExtra("episode", episodioAtual),
        )
    }

    // UP/DOWN rolam a página quando o foco está fora de um chip/botão.
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
            val foco = currentFocus
            val focavel = foco != null && (foco is TextView) && foco.isFocusable
            if (!focavel || foco?.parent === scroll) {
                val dy = if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) 140 else -140
                scroll.smoothScrollBy(0, dy)
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
