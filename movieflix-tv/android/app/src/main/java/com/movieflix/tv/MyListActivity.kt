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

    override val itemAtivo: String = "minhalista"

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

        val token = AuthRepository.loadToken(this)
        if (token.isNullOrBlank()) {
            rows.definirHero(mensagem("Favoritos", "Entre com a sua conta MovieFlix (a mesma do site) para ver seus Favoritos.\n\nUse o app do celular ou o site para criar a conta e assinar."))
            return
        }

        scope.launch {
            val favoritos = withContext(Dispatchers.IO) { FavoritesRepository.listar(this@MyListActivity) }
            val catalogo = withContext(Dispatchers.IO) { CatalogRepository.all(this@MyListActivity) }
            val lista = favoritos.mapNotNull { (tmdb, _) ->
                catalogo.firstOrNull { (it.tmdbIdNumerico ?: 0L) == tmdb }
            }

            rows.limpar()
            if (lista.isEmpty()) {
                rows.definirHero(
                    mensagem(
                        "Favoritos",
                        "Sua lista de favoritos está vazia.\n\nAbra um filme ou série e use o botão \"Favoritos\" nos detalhes para salvar aqui.",
                    ),
                )
                return@launch
            }

            rows.definirHero(mensagem("Favoritos", "${lista.size} título(s) nos seus favoritos."))
            val abrir = { m: Movie ->
                startActivity(
                    Intent(this@MyListActivity, DetailsActivity::class.java).putExtra("movie_id", m.id),
                )
            }
            lista.chunked(24).forEachIndexed { i, itens ->
                rows.adicionarLinha(
                    if (i == 0) "Meus favoritos" else "Mais dos meus favoritos",
                    itens,
                    abrir,
                )
            }
            rows.focarPrimeiraLinha()
        }
    }

    /** Bloco de título + mensagem, usado nos estados sem login / lista vazia. */
    private fun mensagem(titulo: String, texto: String): android.view.View =
        android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(context, 22f),
                MfDesign.dp(context, 26f),
                MfDesign.dp(context, 22f),
                MfDesign.dp(context, 10f),
            )
            addView(MfDesign.tituloTela(context, titulo))
            addView(
                MfDesign.texto(context, texto).apply {
                    textSize = 16f
                    maxLines = 6
                    setTextColor(MfDesign.GRAY_LIGHT)
                },
                android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                    android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = MfDesign.dp(context, 10f) },
            )
        }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
