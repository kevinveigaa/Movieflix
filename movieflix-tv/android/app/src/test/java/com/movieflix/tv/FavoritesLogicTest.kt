package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes da lógica de FAVORITOS — a que decidiu o bug relatado.
 *
 * Cobre literalmente o comportamento obrigatório do pedido:
 *   1º clique adiciona, 2º remove, 3º adiciona, 4º remove — sempre UMA ocorrência.
 */
class FavoritesLogicTest {

    private fun linha(id: String, tmdb: Long, tipo: String) = FavoritesLogic.Linha(id, tmdb, tipo)

    @Test
    fun `primeiro clique adiciona, segundo remove, terceiro adiciona, quarto remove`() {
        // Simula o estado REAL do servidor ao longo de 4 toques seguidos no botão.
        var noServidor = false
        val acoes = ArrayList<FavoritesLogic.Acao>()
        repeat(4) {
            val a = FavoritesLogic.decidir(jaNoServidor = noServidor, travado = false, podeEscrever = true)
            acoes.add(a)
            noServidor = when (a) {
                FavoritesLogic.Acao.ADICIONAR -> true
                FavoritesLogic.Acao.REMOVER -> false
                FavoritesLogic.Acao.IGNORAR -> noServidor
            }
        }
        assertEquals(
            listOf(
                FavoritesLogic.Acao.ADICIONAR,
                FavoritesLogic.Acao.REMOVER,
                FavoritesLogic.Acao.ADICIONAR,
                FavoritesLogic.Acao.REMOVER,
            ),
            acoes,
        )
    }

    @Test
    fun `clique durante uma operacao em andamento e ignorado`() {
        // É esta regra que impediu o INSERT duplo: com a trava obtida, o segundo
        // OK do controle remoto não vira uma segunda linha.
        val a = FavoritesLogic.decidir(jaNoServidor = false, travado = true, podeEscrever = true)
        assertEquals(FavoritesLogic.Acao.IGNORAR, a)
    }

    @Test
    fun `sem sessao valida nada e escrito`() {
        val a = FavoritesLogic.decidir(jaNoServidor = false, travado = false, podeEscrever = false)
        assertEquals(FavoritesLogic.Acao.IGNORAR, a)
    }

    @Test
    fun `duplicatas antigas sao reduzidas a uma unica ocorrencia`() {
        val linhas = listOf(
            linha("a", 550, "movie"),
            linha("b", 550, "movie"),
            linha("c", 550, "movie"),
            linha("d", 1399, "tv"),
        )
        val unicas = FavoritesLogic.deduplicar(linhas)
        assertEquals(2, unicas.size)
        // Preserva a PRIMEIRA ocorrência (a mais recente, pois a lista vem por created_at desc).
        assertEquals("a", unicas[0].id)
        assertEquals("d", unicas[1].id)
    }

    @Test
    fun `filme e serie com o mesmo tmdb id nao colidem`() {
        val linhas = listOf(linha("a", 100, "movie"), linha("b", 100, "tv"))
        assertEquals(2, FavoritesLogic.deduplicar(linhas).size)
    }

    @Test
    fun `remocao encontra TODAS as linhas do titulo`() {
        val linhas = listOf(
            linha("a", 550, "movie"),
            linha("b", 550, "movie"),
            linha("c", 1399, "tv"),
        )
        val doTitulo = FavoritesLogic.linhasDoTitulo(linhas, 550, "movie")
        assertEquals(2, doTitulo.size)
        assertTrue(doTitulo.all { it.tmdbId == 550L })
    }

    @Test
    fun `estado visual do botao distingue favoritado de nao favoritado`() {
        val normal = FavoritesLogic.estadoBotao(false, 0xFFFFFFFF.toInt(), 0xFFFFC107.toInt(), 0)
        val ativo = FavoritesLogic.estadoBotao(true, 0xFFFFFFFF.toInt(), 0xFFFFC107.toInt(), 0)
        assertEquals("♡  Favoritos", normal.rotulo)
        assertEquals("♥  Remover dos Favoritos", ativo.rotulo)
        // O favoritado é AMARELO (o mesmo GOLD da nota ★), não uma borda branca.
        assertEquals(0xFFFFC107.toInt(), ativo.cor)
        assertFalse(ativo.cor == normal.cor)
    }

    @Test
    fun `chave normaliza maiusculas do media type`() {
        assertEquals(FavoritesLogic.chave("movie", 7), FavoritesLogic.chave("MOVIE", 7))
    }
}
