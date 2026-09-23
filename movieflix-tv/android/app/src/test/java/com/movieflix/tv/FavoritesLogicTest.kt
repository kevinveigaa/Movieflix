package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Regras de favoritos: sem duplicatas e anti-duplo-toque. */
class FavoritesLogicTest {

    @Test
    fun adicionarQuandoNaoExisteNoServidor() {
        assertEquals(
            FavoritesLogic.Acao.ADICIONAR,
            FavoritesLogic.decidir(jaNoServidor = false, travado = false, podeEscrever = true),
        )
    }

    @Test
    fun removerQuandoJaExisteNoServidor() {
        assertEquals(
            FavoritesLogic.Acao.REMOVER,
            FavoritesLogic.decidir(jaNoServidor = true, travado = false, podeEscrever = true),
        )
    }

    @Test
    fun ignoraQuandoTravado() {
        assertEquals(
            FavoritesLogic.Acao.IGNORAR,
            FavoritesLogic.decidir(jaNoServidor = false, travado = true, podeEscrever = true),
        )
    }

    @Test
    fun ignoraQuandoNaoPodeEscrever() {
        assertEquals(
            FavoritesLogic.Acao.IGNORAR,
            FavoritesLogic.decidir(jaNoServidor = false, travado = false, podeEscrever = false),
        )
    }

    @Test
    fun deduplicacaoMantemUmaLinhaPorTitulo() {
        val linhas = listOf(
            FavoritesLogic.Linha("a", 550L, "movie"),
            FavoritesLogic.Linha("b", 550L, "movie"),
            FavoritesLogic.Linha("c", 550L, "tv"),
            FavoritesLogic.Linha("d", 1399L, "tv"),
        )
        val unicas = FavoritesLogic.deduplicar(linhas)
        assertEquals(3, unicas.size)
        assertEquals("a", unicas[0].id)
        assertEquals("c", unicas[1].id)
        assertEquals("d", unicas[2].id)
    }

    @Test
    fun linhasDoTituloFiltraPorTipo() {
        val linhas = listOf(
            FavoritesLogic.Linha("a", 550L, "movie"),
            FavoritesLogic.Linha("b", 550L, "tv"),
        )
        assertEquals(1, FavoritesLogic.linhasDoTitulo(linhas, 550L, "tv").size)
        assertEquals(2, FavoritesLogic.linhasDoTitulo(linhas, 550L, null).size)
    }

    @Test
    fun chaveNormalizaOTipo() {
        assertTrue(FavoritesLogic.chave("TV", 10L) == FavoritesLogic.chave("tv", 10L))
    }
}
