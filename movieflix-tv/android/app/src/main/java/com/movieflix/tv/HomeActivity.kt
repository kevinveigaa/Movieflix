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
 * HOME da TV: menu lateral + HERO do destaque + linhas horizontais.
 *
 * Tudo navegavel apenas pelo controle remoto: o menu lateral recebe foco a
 * qualquer momento pressionando ESQUERDA na borda, e cada linha rola com
 * ESQUERDA/DIREITA. O foco e sempre visivel.
 */
class HomeActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var menu: LinearLayout
    private lateinit var heroTitulo: TextView
    private lateinit var heroMeta: TextView
    private lateinit var heroDesc: TextView
    private lateinit var heroImagem: ImageView
    private lateinit var heroAssistir: TextView
    private lateinit var heroDetalhes: TextView
    private lateinit var conteudoColuna: LinearLayout
    private var destaque: Movie? = null
    private var focoInicial: View? = null

    private var itemMenuFocado = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val raiz = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

        // ── Menu lateral ──
        menu = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(TvUi.dp(this@HomeActivity, 12), TvUi.dp(this@HomeActivity, 40), TvUi.dp(this@HomeActivity, 12), TvUi.dp(this@HomeActivity, 20))
            setBackgroundColor(ContextCompat.getColor(this@HomeActivity, R.color.mf_surface))
        }
        val lpMenu = LinearLayout.LayoutParams(TvUi.dp(this, 216), ViewGroup.LayoutParams.MATCH_PARENT)
        menu.layoutParams = lpMenu

        val marca = TvUi.texto(this, "MOVIEFLIX", 20f, ContextCompat.getColor(this, R.color.mf_purple), negrito = true)
        marca.setPadding(TvUi.dp(this, 12), 0, 0, TvUi.dp(this, 22))
        menu.addView(marca)

        for ((i, item) in ITENS.withIndex()) {
            val v = itemMenu(item.rotulo, item.acao, i)
            menu.addView(v)
        }

        val espaco = View(this)
        menu.addView(espaco, LinearLayout.LayoutParams(1, 0, 1f))

        val conta = TvUi.botao(this, "Conta / Plano")
        conta.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        conta.setOnClickListener { startActivity(Intent(this, AccountActivity::class.java)) }
        menu.addView(conta)

        val sair = TvUi.botao(this, "Sair")
        sair.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        sair.setOnClickListener {
            AuthRepository.clearSession(this)
            ProfilesRepository.setPerfilAtivo(this, null)
            startActivity(Intent(this, LoginActivity::class.java)); finish()
        }
        menu.addView(sair)

        raiz.addView(menu)

        // ── Area de conteudo ──
        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        val lpScroll = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f)
        scroll.layoutParams = lpScroll

        conteudoColuna = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        conteudoColuna.addView(montarHero())

        scroll.addView(conteudoColuna)
        raiz.addView(scroll)

        conteudo(raiz)
    }

    private fun montarHero(): View {
        val hero = FrameLayout(this)
        hero.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, resources.getDimensionPixelSize(R.dimen.hero_height))

        heroImagem = ImageView(this)
        heroImagem.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        heroImagem.scaleType = ImageView.ScaleType.CENTER_CROP
        heroImagem.setBackgroundColor(ContextCompat.getColor(this, R.color.mf_surface_light))
        hero.addView(heroImagem)

        val scrim = View(this)
        scrim.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        scrim.background = TvUi.gradienteHorizontal(0xF2050505.toInt(), 0x33050505)
        hero.addView(scrim)

        val scrimBaixo = View(this)
        scrimBaixo.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        scrimBaixo.background = TvUi.gradiente(0x00000000, 0xCC050505.toInt())
        hero.addView(scrimBaixo)

        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.BOTTOM
        }
        val lpInfo = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        lpInfo.leftMargin = TvUi.dp(this, 40); lpInfo.bottomMargin = TvUi.dp(this, 30); lpInfo.rightMargin = TvUi.dp(this, 40)
        info.layoutParams = lpInfo

        heroTitulo = TvUi.texto(this, "", resources.getDimension(R.dimen.hero_title).toInt().toFloat(), ContextCompat.getColor(this, R.color.mf_white), negrito = true, maxLinhas = 1)
        info.addView(heroTitulo)

        heroMeta = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_purple_light), negrito = true, maxLinhas = 1)
        heroMeta.setPadding(0, TvUi.dp(this, 6), 0, TvUi.dp(this, 6))
        info.addView(heroMeta)

        heroDesc = TvUi.texto(this, "", 14f, ContextCompat.getColor(this, R.color.mf_gray_light), maxLinhas = 2)
        info.addView(heroDesc)

        val linhaBotoes = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        linhaBotoes.setPadding(0, TvUi.dp(this, 16), 0, 0)

        heroAssistir = TvUi.botao(this, "▶  Assistir", primario = true)
        heroAssistir.setOnClickListener { destaque?.let { abrirDetalhes(it) } }
        linhaBotoes.addView(heroAssistir)

        heroDetalhes = TvUi.botao(this, "+  Favoritos")
        heroDetalhes.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@HomeActivity, 12) }
        heroDetalhes.setOnClickListener { destaque?.let { alternarFavorito(it) } }
        linhaBotoes.addView(heroDetalhes)

        val verMais = TvUi.botao(this, "ⓘ  Mais informacoes")
        verMais.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@HomeActivity, 12) }
        verMais.setOnClickListener { destaque?.let { abrirDetalhes(it) } }
        linhaBotoes.addView(verMais)

        info.addView(linhaBotoes)
        hero.addView(info)
        return hero
    }

    private data class ItemMenu(val rotulo: String, val acao: String)

    private val ITENS = listOf(
        ItemMenu("Inicio", "home"),
        ItemMenu("Filmes", "filmes"),
        ItemMenu("Series", "series"),
        ItemMenu("Buscar", "buscar"),
        ItemMenu("Minha Lista", "minha_lista"),
        ItemMenu("Historico", "historico"),
        ItemMenu("Configuracoes", "config"),
    )

    private fun itemMenu(rotulo: String, acao: String, indice: Int): TextView {
        val t = TvUi.texto(this, rotulo, 15f, ContextCompat.getColor(this, R.color.mf_gray_light), negrito = true)
        t.gravity = Gravity.CENTER_VERTICAL
        t.isFocusable = true
        t.setPadding(TvUi.dp(this, 14), TvUi.dp(this, 12), TvUi.dp(this, 14), TvUi.dp(this, 12))
        val fundoNormal = TvUi.fundo(0x00000000, 8, this)
        val fundoFoco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_strong), 8, this, ContextCompat.getColor(this, R.color.mf_purple), 2)
        t.background = fundoNormal
        t.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = TvUi.dp(this@HomeActivity, 2) }
        t.setOnFocusChangeListener { v, temFoco ->
            v.background = if (temFoco) fundoFoco else fundoNormal
            v.animate().translationX(if (temFoco) TvUi.dp(this, 6).toFloat() else 0f).setDuration(110).start()
            if (temFoco) itemMenuFocado = indice
        }
        t.setOnClickListener { executarAcao(acao) }
        t.setOnKeyListener { v, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                focarConteudo(); true
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
            "historico" -> startActivity(Intent(this, HistoryActivity::class.java))
            "config" -> startActivity(Intent(this, SettingsActivity::class.java))
        }
    }

    private fun focarConteudo() {
        val alvo = focoInicial ?: heroAssistir
        alvo?.requestFocus()
    }

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
        if (lancamentos.isNotEmpty()) conteudoColuna.addView(secao("Lancamentos", lancamentos, index++))

        val populares = CatalogRepository.populares(this)
        if (populares.isNotEmpty()) conteudoColuna.addView(secao("Em alta no MovieFlix", populares, index++))

        val melhores = CatalogRepository.melhorAvaliados(this)
        if (melhores.isNotEmpty()) conteudoColuna.addView(secao("Melhor avaliados", melhores, index++))

        for (cat in CatalogRepository.categorias(this).take(10)) {
            val itens = CatalogRepository.porCategoria(this, cat)
            if (itens.size >= 4) conteudoColuna.addView(secao(cat, itens, index++))
        }

        if (focoInicial == null) {
            focoInicial = heroAssistir
            heroAssistir.post { heroAssistir.requestFocus() }
        }
    }

    private fun atualizarHero(m: Movie) {
        heroTitulo.text = m.title
        heroMeta.text = listOf(
            m.qualidade(), m.nota.takeIf { it != "—" }?.let { "★ $it" }, 
            m.anoNumerico.takeIf { it > 0 }?.toString(),
            if (m.dublado_ptbr == true) "Dublado PT-BR" else null,
        ).filterNotNull().joinToString("  •  ")
        heroDesc.text = m.description.ifBlank { "Sem sinopse disponivel." }
        Glide.with(this).load(m.backdrop_url.ifBlank { m.poster_url }).placeholder(R.color.mf_surface_light).error(R.color.mf_surface_light).into(heroImagem)
        val f = favoritados().contains(m.tmdbIdNumerico)
        heroDetalhes.text = if (f) "♥  Favorito" else "+  Favoritos"
    }

    private var favoritosCache: Set<Long> = emptySet()
    private fun favoritados(): Set<Long> = favoritosCache

    private fun secao(titulo: String, itens: List<Movie>, indice: Int): View {
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = resources.getDimensionPixelSize(R.dimen.row_spacing)
        }
        col.addView(TvUi.tituloSecao(this, titulo))

        val linha = TvUi.linha(this)
        for (m in itens) {
            val selo = m.qualidade()
            val card = TvUi.card(this, m.poster_url.ifBlank { m.backdrop_url }, m.title, selo) { abrirDetalhes(m) }
            card.setOnLongClickListener { alternarFavorito(m); true }
            linha.addView(card)
        }
        col.addView(TvUi.rolavel(this, linha))

        // Sobe do primeiro card vai ao menu/HERO; desce continua na proxima linha.
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
