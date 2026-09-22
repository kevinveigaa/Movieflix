package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.widget.FrameLayout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Favoritos — conteúdo salvo pelo usuário (mesma tabela `favorites` do site).
 *
 * Regras idênticas ao mobile:
 *  - sem login → orienta a entrar com a mesma conta;
 *  - com login → carrega os favoritos e cruza com o catálogo;
 *  - lista vazia → explica como salvar.
 */
class MyListActivity : SidebarHostActivity() {

    override val itemAtivo: String = "favoritos"

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


        carregar()
    }

    /**
     * Recarrega os favoritos ao VOLTAR para esta tela.
     *
     * Correção de um bug real de sincronização: a lista só era montada no
     * onCreate. Como Detalhes abre por cima, ao adicionar/remover um título e
     * apertar BACK o usuário voltava para a lista ANTIGA — dando a impressão de
     * que o botão Favoritos não tinha funcionado. Agora qualquer retorno à tela
     * relê a mesma tabela `favorites` do site.
     */
    override fun onResume() {
        super.onResume()
        if (::rows.isInitialized) carregar()
    }

    private fun carregar() {
        rows.limpar()

        val token = AuthRepository.loadToken(this)
        if (token.isNullOrBlank()) {
            rows.definirHero(
                MfUi.cabecalho(this, "Favoritos", null).apply {
                    addView(
                        MfDesign.texto(this@MyListActivity, "Entre com a sua conta MovieFlix (a mesma do site e do celular) para ver seus Favoritos.")
                            .apply {
                                setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, MfMetrics.textoSecundario(this@MyListActivity))
                                maxLines = 6
                                setTextColor(MfDesign.GRAY_LIGHT)
                            },
                        android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                        ).apply { topMargin = MfDesign.dp(this@MyListActivity, 12f) },
                    )
                },
            )
            return
        }

        scope.launch {
            val res = withContext(Dispatchers.IO) { FavoritesRepository.listarResultado(this@MyListActivity) }
            val catalogo = withContext(Dispatchers.IO) { CatalogRepository.all(this@MyListActivity) }
            // ── UMA ÚNICA OCORRÊNCIA por título (pedido explícito) ──
            //
            // Deduplicamos ANTES de cruzar com o catálogo: se o banco ainda guarda
            // linhas repetidas de um mesmo título (criadas por cliques no controle
            // antes desta correção), o cruzamento devolveria o MESMO Movie várias
            // vezes e a tela mostraria o título duplicado. A regra é pura e testada
            // (FavoritesLogic.deduplicar / FavoritesLogicTest).
            val favoritosUnicos = FavoritesLogic.deduplicar(
                res.itens.map { FavoritesLogic.Linha(it.id, it.tmdbId, it.mediaType) },
            )
            val lista = favoritosUnicos.mapNotNull { fav ->
                catalogo.firstOrNull { (it.tmdbIdNumerico ?: 0L) == fav.tmdbId }
            }

            rows.limpar()

            // ── ERRO REAL DO SUPABASE ─────────────────────────────────────────
            // Antes, qualquer falha (sessão expirada, RLS, rede) chegava aqui como
            // lista vazia e o usuário via "sua lista está vazia" — indistinguível
            // de uma lista realmente vazia. Agora o motivo é mostrado.
            if (res.erro != null) {
                rows.definirHero(
                    mensagem("Favoritos", "Não foi possível carregar seus Favoritos agora.\n\n${res.erro}"),
                )
                return@launch
            }

            if (lista.isEmpty()) {
                // Favoritos salvos em outro aparelho como títulos sem TMDb não são
                // casáveis aqui (a TV casa por tmdb_id, igual ao site). Em vez de
                // dizer "vazia" e esconder o dado, explicamos.
                val texto = if (res.semTmdb > 0) {
                    "Você tem ${res.semTmdb} título(s) salvo(s) sem TMDb, que não podem ser abertos na TV.\n\n" +
                        "Abra um filme ou série e use o botão \"Favoritos\" nos detalhes para salvar aqui."
                } else {
                    "Sua lista de favoritos está vazia.\n\nAbra um filme ou série e use o botão \"Favoritos\" nos detalhes para salvar aqui."
                }
                rows.definirHero(mensagem("Favoritos", texto))
                return@launch
            }

            rows.definirHero(mensagem("Favoritos", "${lista.size} título(s) nos seus favoritos. Use o botão Favoritos na tela de detalhes para adicionar ou remover."))
            val abrir = { m: Movie ->
                startActivity(
                    Intent(this@MyListActivity, DetailsActivity::class.java).putExtra("movie_id", m.id),
                )
            }
            lista.chunked(60).forEachIndexed { i, itens ->
                rows.adicionarLinha(
                    if (i == 0) "Meus favoritos" else "Mais dos meus favoritos",
                    itens,
                    abrir,
                )
            }
            rows.focarPrimeiraLinha()
        }
    }

    /** Bloco de cabeçalho + mensagem, usado nos estados sem login / lista vazia. */
    private fun mensagem(titulo: String, texto: String): android.view.View {
        val raiz = MfUi.cabecalho(this, titulo, null)
        raiz.addView(
            MfDesign.texto(this, texto).apply {
                setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, MfMetrics.textoSecundario(this@MyListActivity))
                maxLines = 6
                setTextColor(MfDesign.GRAY_LIGHT)
            },
            android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@MyListActivity, 12f) },
        )
        return raiz
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
