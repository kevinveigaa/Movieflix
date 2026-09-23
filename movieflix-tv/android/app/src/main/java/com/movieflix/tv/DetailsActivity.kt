package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import java.util.concurrent.Executors

/**
 * DETALHES do titulo: sinopse, favoritos, temporadas/episodios e ASSISTIR.
 * Para SERIES, monta a lista de temporadas e a grade de episodios a partir de
 * `episodes_available` (dado real do catalogo).
 */
class DetailsActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private var movie: Movie? = null
    private lateinit var fundo: ImageView
    private lateinit var titulo: TextView
    private lateinit var meta: TextView
    private lateinit var sinopse: TextView
    private lateinit var botaoAssistir: TextView
    private lateinit var botaoFavorito: TextView
    private lateinit var areaTemporadas: LinearLayout
    private lateinit var areaEpisodios: LinearLayout
    private lateinit var chipsGeneros: LinearLayout
    private var temporadaAtual = 1
    private var favoritado = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra("movie_id")
        movie = id?.let { CatalogRepository.porId(this, it) }
        if (movie == null) {
            val tvdb = intent.getLongExtra("tmdb_id", 0L)
            if (tvdb > 0) movie = CatalogRepository.porTmdb(this, tvdb)
        }
        montarTela()
        if (movie != null) atualizar()
        verificarFavorito()
    }

    private fun montarTela() {
        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        val raiz = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        // ── Cabecalho com backdrop ──
        val cabecalho = FrameLayout(this)
        cabecalho.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, TvUi.dp(this, 300))

        fundo = ImageView(this)
        fundo.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        fundo.scaleType = ImageView.ScaleType.CENTER_CROP
        fundo.setBackgroundColor(ContextCompat.getColor(this, R.color.mf_surface_light))
        cabecalho.addView(fundo)

        val scrim = View(this)
        scrim.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        scrim.background = TvUi.gradiente(0x22050505, 0xFF050505.toInt())
        cabecalho.addView(scrim)

        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.BOTTOM
        }
        val lpInfo = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        lpInfo.leftMargin = TvUi.dp(this, 44); lpInfo.rightMargin = TvUi.dp(this, 44); lpInfo.bottomMargin = TvUi.dp(this, 22)
        info.layoutParams = lpInfo

        titulo = TvUi.texto(this, "", 34f, ContextCompat.getColor(this, R.color.mf_white), negrito = true, maxLinhas = 2)
        info.addView(titulo)

        meta = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_red_light), negrito = true)
        meta.setPadding(0, TvUi.dp(this, 6), 0, TvUi.dp(this, 8))
        info.addView(meta)

        chipsGeneros = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        info.addView(chipsGeneros)

        val linhaBotoes = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        linhaBotoes.setPadding(0, TvUi.dp(this, 16), 0, 0)

        botaoAssistir = TvUi.botao(this, "▶  Assistir", primario = true)
        botaoAssistir.setOnClickListener { assistir() }
        linhaBotoes.addView(botaoAssistir)

        botaoFavorito = TvUi.botao(this, "♡  Favoritos")
        botaoFavorito.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@DetailsActivity, 14) }
        botaoFavorito.setOnClickListener { alternarFavorito() }
        linhaBotoes.addView(botaoFavorito)

        info.addView(linhaBotoes)
        cabecalho.addView(info)
        raiz.addView(cabecalho)

        sinopse = TvUi.texto(this, "", 14f, ContextCompat.getColor(this, R.color.mf_gray_light), maxLinhas = 10)
        sinopse.setPadding(TvUi.dp(this, 44), TvUi.dp(this, 20), TvUi.dp(this, 44), TvUi.dp(this, 10))
        raiz.addView(sinopse)

        areaTemporadas = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(TvUi.dp(this@DetailsActivity, 44), TvUi.dp(this@DetailsActivity, 14), TvUi.dp(this@DetailsActivity, 44), TvUi.dp(this@DetailsActivity, 6))
        }
        raiz.addView(areaTemporadas)

        areaEpisodios = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(TvUi.dp(this@DetailsActivity, 44), 0, TvUi.dp(this@DetailsActivity, 44), TvUi.dp(this@DetailsActivity, 34))
        }
        raiz.addView(areaEpisodios)

        scroll.addView(raiz)
        conteudo(scroll)
        garantirFocoAposLayout(scroll, botaoAssistir)
    }

    private fun atualizar() {
        val m = movie ?: return
        titulo.text = m.title
        meta.text = listOf(
            m.qualidade(),
            m.nota.takeIf { it != "—" }?.let { "★ $it" },
            m.anoNumerico.takeIf { it > 0 }?.toString(),
            m.duration?.takeIf { it > 0 }?.let { "${it} min" },
            m.seasons?.takeIf { it > 0 }?.let { "$it temporada(s)" },
            if (m.dublado_ptbr == true) "Dublado PT-BR" else null,
        ).filterNotNull().joinToString("  •  ")
        if (m.description.isNotBlank()) sinopse.text = m.description else sinopse.visibility = View.GONE
        chipsGeneros.removeAllViews()
        for (c in m.categorias) chipsGeneros.addView(TvUi.chip(this, c))
        Glide.with(this).load(m.backdrop_url.ifBlank { m.poster_url }).placeholder(R.color.mf_surface_light).error(R.color.mf_surface_light).into(fundo)

        if (m.ehSerie) {
            montarTemporadas(m)
        } else {
            areaTemporadas.visibility = View.GONE
            areaEpisodios.visibility = View.GONE
        }
    }

    private fun montarTemporadas(m: Movie) {
        val temporadas = MediaCatalog.temporadas(m)
        if (temporadas.size <= 1) { areaTemporadas.visibility = View.GONE }
        areaTemporadas.removeAllViews()
        for (t in temporadas) {
            val chip = TvUi.botao(this, "Temporada $t", primario = t == temporadaAtual)
            chip.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = TvUi.dp(this@DetailsActivity, 10) }
            chip.setOnClickListener { temporadaAtual = t; montarTemporadas(m); montarEpisodios(m) }
            areaTemporadas.addView(chip)
        }
        montarEpisodios(m)
    }

    private fun montarEpisodios(m: Movie) {
        val eps = MediaCatalog.episodios(m, temporadaAtual)
        areaEpisodios.removeAllViews()
        if (eps.isEmpty()) { areaEpisodios.visibility = View.GONE; return }
        areaEpisodios.visibility = View.VISIBLE

        val rotulo = TvUi.texto(this, "Episodios", 17f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        rotulo.setPadding(0, TvUi.dp(this, 8), 0, TvUi.dp(this, 10))
        areaEpisodios.addView(rotulo)

        for (e in eps) {
            val linha = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                isFocusable = true
                setPadding(TvUi.dp(this@DetailsActivity, 18), TvUi.dp(this@DetailsActivity, 14), TvUi.dp(this@DetailsActivity, 18), TvUi.dp(this@DetailsActivity, 14))
            }
            linha.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = TvUi.dp(this@DetailsActivity, 8) }
            val normal = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface), 10, this, ContextCompat.getColor(this, R.color.mf_border), 1)
            val foco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_strong), 10, this, ContextCompat.getColor(this, R.color.mf_red), 3)
            linha.background = normal
            linha.setOnFocusChangeListener { v, temFoco ->
                v.background = if (temFoco) foco else normal
                v.animate().scaleX(if (temFoco) 1.02f else 1f).scaleY(if (temFoco) 1.02f else 1f).setDuration(110).start()
            }

            val num = TvUi.texto(this, "E${String.format("%02d", e)}", 16f, ContextCompat.getColor(this, R.color.mf_red_light), negrito = true)
            num.width = TvUi.dp(this, 70)
            linha.addView(num)

            val desc = TvUi.texto(this, "Episodio $e", 15f, ContextCompat.getColor(this, R.color.mf_white))
            linha.addView(desc, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            val play = TvUi.texto(this, "▶", 16f, ContextCompat.getColor(this, R.color.mf_gray_light), negrito = true)
            linha.addView(play)

            linha.setOnClickListener { iniciarPlayer(temporadaAtual, e) }
            areaEpisodios.addView(linha)
        }
    }

    private fun verificarFavorito() {
        val m = movie ?: return
        val tmdb = m.tmdbIdNumerico ?: return
        executor.execute {
            val ja = FavoritesRepository.contem(this, tmdb)
            runOnUiThread {
                favoritado = ja
                botaoFavorito.text = if (ja) "♥  Remover" else "♡  Favoritos"
            }
        }
    }

    private fun alternarFavorito() {
        val m = movie ?: return
        val tmdb = m.tmdbIdNumerico ?: run { TvUi.aviso(this, "Titulo sem identificador para favoritos."); return }
        executor.execute {
            val ja = FavoritesRepository.contem(this, tmdb)
            val ok = if (ja) FavoritesRepository.remover(this, tmdb) else FavoritesRepository.adicionar(this, m)
            runOnUiThread {
                if (!ok) TvUi.aviso(this, "Nao foi possivel atualizar os favoritos.")
                else {
                    favoritado = !ja
                    botaoFavorito.text = if (!ja) "♥  Remover" else "♡  Favoritos"
                    TvUi.aviso(this, if (!ja) "Adicionado aos Favoritos" else "Removido dos Favoritos")
                }
            }
        }
    }

    private fun assistir() {
        val m = movie ?: return
        if (m.ehSerie) {
            val eps = MediaCatalog.episodios(m, temporadaAtual)
            iniciarPlayer(temporadaAtual, eps.firstOrNull() ?: 1)
        } else {
            iniciarPlayer(null, null)
        }
    }

    private fun iniciarPlayer(season: Int?, episode: Int?) {
        val m = movie ?: return
        val embed = MediaCatalog.embedUrl(m, season, episode)
        if (embed.isBlank()) { TvUi.aviso(this, "Este titulo nao possui fonte de video configurada."); return }
        startActivity(
            Intent(this, PlayerActivity::class.java)
                .putExtra("movie_id", m.id)
                .putExtra("embed_url", embed)
                .putExtra("season", season ?: -1)
                .putExtra("episode", episode ?: -1),
        )
    }

    override fun focoPadrao(): View? = botaoAssistir
    override fun aoPlayPause(): Boolean { assistir(); return true }
}
