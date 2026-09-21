package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.widget.FrameLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * HOME do MovieFlix TV — reconstruída para controle remoto, com MUITO mais
 * conteúdo do que antes e mantendo EXATAMENTE as mesmas regras de dados do
 * mobile/site:
 *
 *  - catálogo lido de CatalogRepository (mesmos filmes.light.json /
 *    series.light.json do site — agora o catálogo COMPLETO, não o subconjunto
 *    antigo);
 *  - HERO = destaques de maior nota (navegação ← / → entre 4 títulos);
 *  - linhas por NOTA ("em alta"), ANO ("Lançamentos"), POPULARIDADE
 *    ("Populares") e por GÊNERO — a MESMA estrutura de seções do site;
 *  - atualização silenciosa do catálogo (1x/dia) em background.
 *
 * Nada aqui inventa dado: tudo sai do catálogo e da API pública do MovieFlix.
 */
class MainActivity : SidebarHostActivity() {

    override val itemAtivo: String = "inicio"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var rows: MfRowsView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        rows = MfRowsView(this)
        content.addView(
            rows,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        // Atualização do catálogo: background, nunca bloqueia a UI.
        scope.launch {
            withContext(Dispatchers.IO) { CatalogRepository.atualizarSeNecessario(this@MainActivity) }
        }

        carregarCatalogo()
    }

    private fun carregarCatalogo() {
        scope.launch {
            val filmes = withContext(Dispatchers.IO) { CatalogRepository.filmes(this@MainActivity) }
            val series = withContext(Dispatchers.IO) { CatalogRepository.series(this@MainActivity) }
            val categorias = withContext(Dispatchers.IO) { CatalogRepository.categorias(this@MainActivity) }
            Log.i("MovieFlixHome", "Catálogo carregado: filmes=${filmes.size} series=${series.size}")

            rows.limpar()
            montarHero(filmes)

            if (filmes.isEmpty() && series.isEmpty()) {
                rows.definirHero(
                    MfDesign.erro(
                        this@MainActivity,
                        "Não foi possível carregar o catálogo.",
                        "Verifique a conexão da TV e tente novamente.",
                    ) { carregarCatalogo() },
                )
                return@launch
            }

            val abrirDetalhes = { m: Movie ->
                startActivity(
                    Intent(this@MainActivity, DetailsActivity::class.java).putExtra("movie_id", m.id),
                )
            }

            // ── Linhas principais (mesmos critérios de ordenação do site) ──
            rows.adicionarLinha(
                "Filmes em alta",
                filmes.sortedByDescending { it.vote_average }.take(40),
                abrirDetalhes,
            )
            rows.adicionarLinha(
                "Séries em alta",
                series.sortedByDescending { it.vote_average }.take(40),
                abrirDetalhes,
            )
            rows.adicionarLinha(
                "Lançamentos",
                filmes.sortedByDescending { it.anoNumerico }.take(40),
                abrirDetalhes,
            )
            rows.adicionarLinha(
                "Populares",
                filmes.sortedByDescending { it.popularity }.take(40),
                abrirDetalhes,
            )
            rows.adicionarLinha(
                "Séries mais recentes",
                series.sortedByDescending { it.anoNumerico }.take(40),
                abrirDetalhes,
            )

            // ── Linhas por GÊNERO ──
            // Os nomes vêm da API pública de gêneros do MovieFlix (a mesma que o
            // site usa); os TÍTULOS vêm do mesmo catálogo. Nada é inventado.
            val generos = withContext(Dispatchers.IO) { CatalogRepository.generosFilme(this@MainActivity) }
            for (g in generos) {
                val pt = Movie.CATEGORIAS[g] ?: continue
                val itens = filmes.filter { m -> m.categorias.any { it.equals(pt, true) } }
                    .sortedByDescending { it.popularity }
                    .take(40)
                if (itens.size >= 5) rows.adicionarLinha(pt, itens, abrirDetalhes)
            }

            // ── Carrosséis por categoria do próprio catálogo ──
            for (cat in categorias.take(14)) {
                val itens = filmes.filter { it.categorias.contains(cat) }
                    .sortedByDescending { it.vote_average }
                    .take(40)
                if (itens.size >= 5) {
                    // Evita repetir a linha de gênero já criada acima.
                    if (generos.any { Movie.CATEGORIAS[it] == cat }) continue
                    rows.adicionarLinha(cat, itens, abrirDetalhes)
                }
            }

            rows.focarPrimeiraLinha()
        }
    }

    /**
     * HERO no topo: destaque principal + navegação lateral entre os 4 melhores
     * títulos (setas ESQUERDA/DIREITA quando o foco está nos botões do banner).
     */
    private fun montarHero(filmes: List<Movie>) {
        val destaques = filmes.sortedByDescending { it.vote_average }.take(4)
        if (destaques.isEmpty()) return

        val banner = DropBannerPresenter.BannerView(this)
        var indice = 0

        fun mostrar(i: Int) {
            indice = ((i % destaques.size) + destaques.size) % destaques.size
            banner.bind(destaques[indice])
            banner.definirPaginas(destaques.size, indice)
        }

        banner.onAssistir = {
            val m = destaques[indice]
            startActivity(
                Intent(this, PlaybackActivity::class.java)
                    .putExtra("movie_id", m.id)
                    .putExtra("season", 1)
                    .putExtra("episode", 1),
            )
        }
        banner.onDetalhes = {
            startActivity(
                Intent(this, DetailsActivity::class.java)
                    .putExtra("movie_id", destaques[indice].id),
            )
        }

        mostrar(0)

        banner.setOnKeyListener { _, keyCode, event ->
            if (event.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> { mostrar(indice - 1); true }
                KeyEvent.KEYCODE_DPAD_RIGHT -> { mostrar(indice + 1); true }
                else -> false
            }
        }

        rows.definirHero(banner)
        rows.focarHero = { banner.focarAcaoPrincipal() }
    }

    /** SEARCH do controle abre a busca; MENU/SETTINGS abrem as configurações. */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_SEARCH) {
            startActivity(Intent(this, SearchActivity::class.java))
            return true
        }
        if (keyCode == KeyEvent.KEYCODE_SETTINGS || keyCode == KeyEvent.KEYCODE_MENU) {
            startActivity(Intent(this, SettingsActivity::class.java))
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
