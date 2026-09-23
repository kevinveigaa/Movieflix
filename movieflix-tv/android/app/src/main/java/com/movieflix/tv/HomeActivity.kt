package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
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
 * HOME do MovieFlix TV.
 *
 * MESMA estrutura da Home do MovieFlix (site/Mobile):
 *   barra de navegacao SUPERIOR (Inicio / Filmes / Series / Minha Lista / Buscar)
 *   + HERO do destaque (banner, titulo, meta, sinopse, botoes Assitir/Favoritos/Mais informacoes)
 *   + linhas horizontais de cards do MESMO catalogo real.
 *
 * A adaptacao para TV muda apenas ORGANIZACAO e ESCALA (cards e titulos maiores,
 * navegacao por controle remoto, foco sempre visivel) — a identidade, o conteudo
 * e a logica de dados sao os mesmos do MovieFlix Mobile.
 *
 * Navegacao: ESQUERDA/DIREITA nas linhas, CIMA/BAIXO entre topbar, HERO e linhas,
 * OK/ENTER abre/confirma, VOLTAR sai da tela (e sai do app na Home).
 */
class HomeActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private val itensTopbar = ArrayList<TextView>()
    private var indiceTopbar = 0

    private lateinit var heroTitulo: TextView
    private lateinit var heroMeta: TextView
    private lateinit var heroDesc: TextView
    private lateinit var heroImagem: ImageView
    private lateinit var heroAssistir: TextView
    private lateinit var heroFavorito: TextView
    private lateinit var heroMais: TextView
    private lateinit var conteudoColuna: LinearLayout
    private var destaque: Movie? = null
    private var focoInicial: View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val raiz = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        raiz.addView(montarTopbar())

        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        scroll.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)

        conteudoColuna = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        conteudoColuna.addView(montarHero())

        scroll.addView(conteudoColuna)
        raiz.addView(scroll)

        conteudo(raiz)
    }

    // ── Barra de navegacao SUPERIOR (mesma navegacao do MovieFlix) ──

    private data class ItemNav(val rotulo: String, val acao: String)

    private val NAV = listOf(
        ItemNav("In\u00edcio", "home"),
        ItemNav("Filmes", "filmes"),
        ItemNav("S\u00e9ries", "series"),
        ItemNav("Minha Lista", "minha_lista"),
        ItemNav("Buscar", "buscar"),
    )

    private fun montarTopbar(): View {
        val barra = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(
                resources.getDimensionPixelSize(R.dimen.content_pad), 0,
                resources.getDimensionPixelSize(R.dimen.content_pad), 0,
            )
            setBackgroundColor(ContextCompat.getColor(this@HomeActivity, R.color.mf_black))
        }
        barra.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            resources.getDimensionPixelSize(R.dimen.topbar_height),
        )

        // Logo real do MovieFlix (mesma marca do Mobile)
        val logo = ImageView(this)
        logo.layoutParams = LinearLayout.LayoutParams(TvUi.dp(this, 148), TvUi.dp(this, 37)).apply {
            marginEnd = TvUi.dp(this@HomeActivity, 26)
        }
        logo.scaleType = ImageView.ScaleType.FIT_CENTER
        Glide.with(this).load(R.drawable.mf_wordmark).into(logo)
        barra.addView(logo)

        for ((i, item) in NAV.withIndex()) {
            val v = itemTopbar(item.rotulo, i)
            itensTopbar.add(v)
            barra.addView(v)
        }

        val espaco = View(this)
        barra.addView(espaco, LinearLayout.LayoutParams(1, 1, 1f))

        val conta = itemTopbar("Conta", itensTopbar.size)
        conta.setOnClickListener { startActivity(Intent(this, AccountActivity::class.java)) }
        itensTopbar.add(conta)
        barra.addView(conta)

        return barra
    }

    private fun itemTopbar(rotulo: String, indice: Int): TextView {
        val t = TvUi.texto(this, rotulo, 15f, ContextCompat.getColor(this, R.color.mf_gray_light), negrito = true)
        t.gravity = Gravity.CENTER
        t.isFocusable = true
        t.isFocusableInTouchMode = false
        t.setPadding(TvUi.dp(this, 16), TvUi.dp(this, 9), TvUi.dp(this, 16), TvUi.dp(this, 9))
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        lp.marginEnd = TvUi.dp(this, 6)
        t.layoutParams = lp

        val raio = 8
        val fundoNormal = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_transparent), raio, this)
        val fundoFoco = TvUi.fundo(
            ContextCompat.getColor(this, R.color.mf_surface_strong), raio, this,
            ContextCompat.getColor(this, R.color.mf_red), 2,
        )
        t.background = fundoNormal
        t.setOnFocusChangeListener { v, temFoco ->
            v.background = if (temFoco) fundoFoco else fundoNormal
            (v as TextView).setTextColor(
                ContextCompat.getColor(this, if (temFoco || indice == indiceTopbar) R.color.mf_white else R.color.mf_gray_light),
            )
            if (temFoco) indiceTopbar = indice
        }
        t.setOnClickListener { executarAcao(NAV.getOrNull(indice)?.acao ?: "conta") }

        // BAIXO: entra no conteudo (HERO). CIMA no HERO volta para a topbar.
        t.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                solicitarFocoConteudo(); true
            } else false
        }
        return t
    }

    private fun executarAcao(acao: String) {
        when (acao) {
            "home" -> { }
            "filmes" -> startActivity(Intent(this, CatalogActivity::class.java).putExtra("tipo", "filme"))
            "series" -> startActivity(Intent(this, CatalogActivity::class.java).putExtra("tipo", "serie"))
            "buscar" -> startActivity(Intent(this, SearchActivity::class.java))
            "minha_lista" -> startActivity(Intent(this, MyListActivity::class.java))
            "conta" -> startActivity(Intent(this, AccountActivity::class.java))
        }
    }

    private fun solicitarFocoConteudo() {
        val alvo = focoInicial ?: heroAssistir
        alvo?.requestFocus()
    }

    private fun focarTopbar() {
        (itensTopbar.getOrNull(indiceTopbar) ?: itensTopbar.firstOrNull())?.requestFocus()
    }

    // ── HERO (mesma estrutura do HeroBanner do site) ──

    private fun montarHero(): View {
        val hero = FrameLayout(this)
        hero.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            resources.getDimensionPixelSize(R.dimen.hero_height),
        )
        // Sobe do HERO -> topbar
        hero.isFocusable = true
        hero.isFocusableInTouchMode = false
        hero.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                focarTopbar(); true
            } else false
        }

        heroImagem = ImageView(this)
        heroImagem.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        heroImagem.scaleType = ImageView.ScaleType.CENTER_CROP
        heroImagem.setBackgroundColor(ContextCompat.getColor(this, R.color.mf_surface_light))
        hero.addView(heroImagem)

        val scrimEsq = View(this)
        scrimEsq.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        scrimEsq.background = TvUi.gradienteHorizontal(0xF2050505.toInt(), 0x33050505)
        hero.addView(scrimEsq)

        val scrimBaixo = View(this)
        scrimBaixo.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        scrimBaixo.background = TvUi.gradiente(0x00000000, 0xE6050505.toInt())
        hero.addView(scrimBaixo)

        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.BOTTOM
        }
        val lpInfo = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        val pad = resources.getDimensionPixelSize(R.dimen.hero_pad)
        lpInfo.leftMargin = pad; lpInfo.rightMargin = pad; lpInfo.bottomMargin = TvUi.dp(this, 30)
        info.layoutParams = lpInfo

        heroTitulo = TvUi.texto(
            this, "", resources.getDimension(R.dimen.hero_title), ContextCompat.getColor(this, R.color.mf_white),
            negrito = true, maxLinhas = 1,
        )
        info.addView(heroTitulo)

        heroMeta = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_purple_light), negrito = true, maxLinhas = 1)
        heroMeta.setPadding(0, TvUi.dp(this, 8), 0, TvUi.dp(this, 8))
        info.addView(heroMeta)

        heroDesc = TvUi.texto(this, "", resources.getDimension(R.dimen.hero_desc), ContextCompat.getColor(this, R.color.mf_gray_light), maxLinhas = 2)
        info.addView(heroDesc)

        val linhaBotoes = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        linhaBotoes.setPadding(0, TvUi.dp(this, 18), 0, 0)

        heroAssistir = TvUi.botao(this, "\u25b6  Assistir", primario = true)
        heroAssistir.setOnClickListener { destaque?.let { abrirDetalhes(it) } }
        linhaBotoes.addView(heroAssistir)

        heroFavorito = TvUi.botao(this, "+  Favoritos")
        heroFavorito.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { marginStart = TvUi.dp(this@HomeActivity, 12) }
        heroFavorito.setOnClickListener { destaque?.let { alternarFavorito(it) } }
        linhaBotoes.addView(heroFavorito)

        heroMais = TvUi.botao(this, "i  Mais informa\u00e7\u00f5es")
        heroMais.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { marginStart = TvUi.dp(this@HomeActivity, 12) }
        heroMais.setOnClickListener { destaque?.let { abrirDetalhes(it) } }
        linhaBotoes.addView(heroMais)

        // Botao primario do HERO: CIMA volta para a topbar
        heroAssistir.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                focarTopbar(); true
            } else false
        }

        info.addView(linhaBotoes)
        hero.addView(info)
        return hero
    }

    // ── Dados (mesmo catalogo real do MovieFlix) ──

    private fun carregar() {
        executor.execute {
            val lista = CatalogRepository.all(this)
            val continuar = WatchHistoryRepository.continuarAssistindo(this)
            val favoritos = FavoritesRepository.listarResultado(this)
            Handler(Looper.getMainLooper()).post {
                renderizar(lista, continuar, favoritos.itens.map { it.tmdbId to it.mediaType })
            }
        }
    }

    private fun renderizar(
        lista: List<Movie>,
        continuar: List<WatchHistoryRepository.Registro>,
        favoritos: List<Pair<Long, String>>,
    ) {
        var index = 1
        conteudoColuna.removeViews(1, (conteudoColuna.childCount - 1).coerceAtLeast(0))

        if (destaque == null && lista.isNotEmpty()) {
            destaque = lista.sortedByDescending { it.popularity }.firstOrNull() ?: lista.first()
            atualizarHero(destaque!!)
        }

        favoritosCache = favoritos.map { it.first }.toSet()

        if (continuar.isNotEmpty()) {
            val itens = continuar.mapNotNull { r ->
                r.tmdbId?.let { t -> CatalogRepository.porTmdb(this, t) }
            }
            if (itens.isNotEmpty()) {
                conteudoColuna.addView(secao("Continuar assistindo", itens, index++))
            }
        }

        val lancamentos = CatalogRepository.lancamentos(this)
        if (lancamentos.isNotEmpty()) conteudoColuna.addView(secao("Lan\u00e7amentos", lancamentos, index++))

        val populares = CatalogRepository.populares(this)
        if (populares.isNotEmpty()) conteudoColuna.addView(secao("Em alta no MovieFlix", populares, index++))

        val melhores = CatalogRepository.melhorAvaliados(this)
        if (melhores.isNotEmpty()) conteudoColuna.addView(secao("Melhor avaliados", melhores, index++))

        var linhasCategoria = 0
        for (cat in CatalogRepository.categorias(this)) {
            if (linhasCategoria >= CatalogoJanela.MAX_LINHAS_CATEGORIA) break
            val itens = CatalogRepository.porCategoria(this, cat)
            if (itens.size >= 4) {
                conteudoColuna.addView(secao(cat, itens, index++))
                linhasCategoria++
            }
        }

        if (focoInicial == null) {
            focoInicial = heroAssistir
            heroAssistir.post { heroAssistir.requestFocus() }
        }
    }

    private fun atualizarHero(m: Movie) {
        heroTitulo.text = m.title
        heroMeta.text = listOf(
            m.qualidade(),
            m.nota.takeIf { it != "\u2014" }?.let { "\u2605 $it" },
            m.anoNumerico.takeIf { it > 0 }?.toString(),
            if (m.dublado_ptbr == true) "Dublado PT-BR" else null,
        ).filterNotNull().joinToString("  \u2022  ")
        heroDesc.text = m.description.ifBlank { "Sem sinopse disponivel." }
        Glide.with(this).load(m.backdrop_url.ifBlank { m.poster_url })
            .placeholder(R.color.mf_surface_light).error(R.color.mf_surface_light).into(heroImagem)
        val f = favoritosCache.contains(m.tmdbIdNumerico)
        heroFavorito.text = if (f) "\u2665  Favorito" else "+  Favoritos"
    }

    private var favoritosCache: Set<Long> = emptySet()

    private fun secao(titulo: String, itens: List<Movie>, indice: Int): View {
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = resources.getDimensionPixelSize(R.dimen.row_spacing) }
        col.addView(TvUi.tituloSecao(this, titulo))

        val linha = TvUi.linha(this)
        for (m in itens.take(CatalogoJanela.MAX_POR_LINHA)) {
            val card = TvUi.card(this, m.poster_url.ifBlank { m.backdrop_url }, m.title, m.qualidade()) { abrirDetalhes(m) }
            card.setOnLongClickListener { alternarFavorito(m); true }
            linha.addView(card)
        }
        col.addView(TvUi.rolavel(this, linha))

        // CIMA a partir do 1o card volta ao HERO (foco nunca desaparece).
        val primeiro = linha.getChildAt(0)
        primeiro?.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_UP && indice == 1) {
                heroAssistir.requestFocus(); true
            } else false
        }
        return col
    }

    private fun abrirDetalhes(m: Movie) {
        startActivity(Intent(this, DetailsActivity::class.java).putExtra("movie_id", m.id))
    }

    private fun alternarFavorito(m: Movie) {
        executor.execute {
            val tmdb = m.tmdbIdNumerico
            if (tmdb == null) { runOnUiThread { TvUi.aviso(this, "Titulo sem identificador para favoritos.") }; return@execute }
            val ja = FavoritesRepository.contem(this, tmdb)
            val ok = if (ja) FavoritesRepository.remover(this, tmdb) else FavoritesRepository.adicionar(this, m)
            runOnUiThread {
                if (!ok) TvUi.aviso(this, "Nao foi possivel atualizar os favoritos.")
                else {
                    TvUi.aviso(this, if (ja) "Removido dos favoritos" else "Adicionado aos favoritos")
                    favoritosCache = if (ja) favoritosCache - tmdb else favoritosCache + tmdb
                    destaque?.let { if (it.id == m.id) atualizarHero(it) }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        executor.execute {
            val favs = FavoritesRepository.listarResultado(this).itens.map { it.tmdbId }.toSet()
            runOnUiThread {
                favoritosCache = favs
                destaque?.let { atualizarHero(it) }
            }
        }
        garantirFocoAposLayout(raizView())
    }

    override fun focoPadrao(): View? = focoInicial ?: heroAssistir
}
