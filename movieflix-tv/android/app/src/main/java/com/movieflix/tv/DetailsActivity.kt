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
 *  - FAVORITOS usa a MESMA tabela `favorites` do site (por tmdb_id);
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
    // FlowLayout: os chips quebram linha automaticamente. Numa temporada de 24
    // episódios, a linha única do layout antigo saía da tela em 16:9 e os chips
    // ficavam inalcançáveis pelo controle remoto.
    private lateinit var chipsTemporada: MfUi.FlowLayout
    private lateinit var chipsEpisodio: MfUi.FlowLayout
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
                (MfMetrics.largura(this@DetailsActivity) * 0.019f).toInt(),
                (MfMetrics.altura(this@DetailsActivity) * 0.030f).toInt(),
                (MfMetrics.largura(this@DetailsActivity) * 0.019f).toInt(),
                (MfMetrics.altura(this@DetailsActivity) * 0.032f).toInt(),
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
        // Poster responsivo: ~24% da área de conteúdo, proporção 2:3 (a mesma
        // do catálogo). Antes era 250x375dp FIXOS — num painel 720p isso
        // ocupava metade da tela e empurrava os botões ASSISTIR/FAVORITOS para
        // fora do campo visível. Era o defeito relatado nos prints.
        val posterW = (MfMetrics.contentWidth(this) * 0.24f).toInt()
        linhaPrincipal.addView(
            posterWrap,
            LinearLayout.LayoutParams(
                posterW,
                (posterW * 1.5f).toInt(),
            ),
        )

        // ── Coluna de informações ─────────────────────────────────────────
        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((MfMetrics.largura(this@DetailsActivity) * 0.019f).toInt(), 0, 0, 0)
        }

        info.addView(
            TextView(this).apply {
                text = movie.title
                typeface = MfDesign.fonteDisplay(this@DetailsActivity)
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.tituloDetalhe(this@DetailsActivity))
                letterSpacing = 0.01f
                maxLines = 2
                ellipsize = android.text.TextUtils.TruncateAt.END
                setShadowLayer(8f, 0f, 3f, Color.BLACK)
            },
        )

        // Chips de metadados (tipo • ano • gênero • nota • qualidade • idioma)
        val chips = MfUi.FlowLayout(this).apply {
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
                    (MfMetrics.altura(this@DetailsActivity) * 0.032f).coerceIn(24f, 60f).toInt(),
                ),
            )
        }
        info.addView(chips)

        info.addView(
            TextView(this).apply {
                text = movie.description.ifBlank { "Sem descrição disponível." }
                setTextColor(MfDesign.GRAY_LIGHT)
                setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.textoDetalhe(this@DetailsActivity))
                maxLines = 9
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
        // Os dois botões DIVIDEM a largura por weight 1f. É a correção direta do
        // defeito "botões cortados dependendo da resolução": em vez de larguras
        // fixas (que estouravam em 720p), cada botão recebe metade do espaço
        // disponível e o rótulo nunca é cortado em 720p, 1080p ou 4K.
        val alturaBtn = (MfMetrics.altura(this) * 0.052f).coerceIn(36f, 96f)
        val btnAssistir = MfUi.botaoCor(
            this@DetailsActivity, "\u25B6  Assistir", R.drawable.bg_pill_primary, Color.WHITE,
            alturaBtn, 0, 1f,
        ) { abrirPlayer() }
        btnLista = MfUi.botaoCor(
            this@DetailsActivity, "\u2661  Favoritos", R.drawable.bg_pill_secondary, Color.WHITE,
            alturaBtn, 0, 1f,
        ) { alternarLista() }
        linhaBotoes.addView(btnAssistir)
        linhaBotoes.addView(
            btnLista,
            LinearLayout.LayoutParams(0, MfDesign.dp(this@DetailsActivity, alturaBtn)).apply {
                weight = 1f
                marginStart = MfDesign.dp(this@DetailsActivity, 14f)
            },
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
            setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.tituloSecaoPx(this@DetailsActivity))
            typeface = Typeface.DEFAULT_BOLD
        }
        chipsTemporada = MfUi.FlowLayout(this).apply {
            setPadding(0, MfDesign.dp(this@DetailsActivity, 8f), 0, 0)
        }
        blocoEpisodios.addView(lblTemporada)
        blocoEpisodios.addView(chipsTemporada)

        lblEpisodio = TextView(this).apply {
            setTextColor(MfDesign.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.tituloSecaoPx(this@DetailsActivity))
            typeface = Typeface.DEFAULT_BOLD
        }
        chipsEpisodio = MfUi.FlowLayout(this).apply {
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
            setTextSize(TypedValue.COMPLEX_UNIT_PX, MfMetrics.textoChip(this@DetailsActivity))
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
            // O espaçamento entre chips agora é do FlowLayout (espacoH): antes
            // havia um marginEnd fixo que, somado à linha única, empurrava os
            // chips para fora da tela.
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            setOnFocusChangeListener { v, temFoco -> v.background = fundoChip(selecionado, temFoco) }
        }

    private fun fundoChip(selecionado: Boolean, focado: Boolean): GradientDrawable =
        GradientDrawable().apply {
            cornerRadius = (MfMetrics.altura(this@DetailsActivity) * 0.019f).coerceIn(12f, 40f)
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

    // (O helper `botao()` foi removido: os botões de ação agora vêm de
    //  MfUi.botaoCor, que divide a largura por weight e nunca corta o rótulo.)

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
        // Feedback IMEDIATO do estado: o rótulo, a cor e o fundo mudam no mesmo
        // instante do clique. O estado visual NÃO deixa dúvida — não é apenas uma
        // borda branca:
        //   · não favoritado → "♡  Favoritos", texto branco, fundo secundário;
        //   · favoritado     → "♥  Remover dos Favoritos", texto AMARELO (GOLD, o
        //                      mesmo da nota ★ do MovieFlix) e fundo destacado.
        // A regra vive em FavoritesLogic.estadoBotao (coberta por FavoritesLogicTest).
        val estado = FavoritesLogic.estadoBotao(
            favoritado = naLista,
            corNormal = Color.WHITE,
            corAtivo = MfDesign.GOLD,
            fundoAtivo = 0,
        )
        btnLista.text = estado.rotulo
        btnLista.setTextColor(estado.cor)
        btnLista.setBackgroundResource(
            if (naLista) R.drawable.bg_pill_fav else R.drawable.bg_pill_secondary,
        )
    }

    /**
     * Guarda anti-duplo-toque do botão Favoritos.
     *
     * O controle remoto dispara OK várias vezes por segundo. Antes, cada clique
     * iniciava uma corrotina e a decisão era tomada a partir da variável
     * `naLista` (estado da TELA, atualizado só DEPOIS da resposta chegar): vários
     * OKs rápidos liam `naLista == false` e cada um INSERIA uma linha igual na
     * tabela `favorites`. Era essa a causa das duplicatas.
     */
    private var trabalhandoLista = false

    /**
     * Alterna Favoritos usando o ESTADO REAL do servidor.
     *
     * Comportamento obrigatório (1º clique adiciona, 2º remove, 3º adiciona,
     * 4º remove…), sempre com UMA única ocorrência do conteúdo:
     *  1. pergunta ao servidor se o título já está salvo (não à tela);
     *  2. FavoritesLogic.decidir() devolve ADICIONAR / REMOVER / IGNORAR;
     *  3. a escrita só acontece depois de a trava ser obtida — um segundo toque
     *     durante a requisição é IGNORADO em vez de virar outra linha;
     *  4. ao terminar, o botão é repintado a partir do estado REAL relido.
     */
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
        // Trava obtida ANTES de qualquer suspensão: é isso que impede o INSERT duplo.
        if (trabalhandoLista) return
        trabalhandoLista = true
        val tipo = if (movie.ehSerie) "tv" else "movie"
        scope.launch {
            val resultado = withContext(Dispatchers.IO) {
                val jaNoServidor = FavoritesRepository.contem(this@DetailsActivity, tmdb, tipo)
                val acao = FavoritesLogic.decidir(
                    jaNoServidor = jaNoServidor,
                    travado = false,
                    podeEscrever = true,
                )
                val ok = when (acao) {
                    FavoritesLogic.Acao.REMOVER ->
                        FavoritesRepository.remover(this@DetailsActivity, tmdb)
                    FavoritesLogic.Acao.ADICIONAR ->
                        // Metadados REAIS do catálogo (mesmos campos que o site grava).
                        FavoritesRepository.adicionar(
                            this@DetailsActivity,
                            tmdb,
                            tipo,
                            movieId = movie.id,
                            titulo = movie.title,
                            posterPath = movie.poster_url,
                            backdropPath = movie.backdrop_url,
                        )
                    FavoritesLogic.Acao.IGNORAR -> jaNoServidor
                }
                // Relê o estado REAL para pintar o botão — nunca supõe.
                val agora = FavoritesRepository.contem(this@DetailsActivity, tmdb, tipo)
                ok to agora
            }
            trabalhandoLista = false
            val (ok, agoraNoServidor) = resultado
            if (ok || agoraNoServidor != naLista) {
                naLista = agoraNoServidor
                atualizarBotaoLista()
            } else {
                // NUNCA fingir que salvou: se o Supabase recusou (sessão, RLS,
                // rede), avisamos e o botão continua refletindo o estado real.
                android.widget.Toast.makeText(
                    this@DetailsActivity,
                    if (naLista) "Não foi possível remover dos Favoritos. Tente de novo."
                    else "Não foi possível salvar nos Favoritos. Tente de novo.",
                    android.widget.Toast.LENGTH_LONG,
                ).show()
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
