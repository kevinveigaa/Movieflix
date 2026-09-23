package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes da PAGINACAO do catalogo na TV (causa raiz do bug de catalogo).
 *
 * O catalogo real tem ~18.000 filmes e ~8.000 series. Estes testes garantem
 * que a TV NUNCA monte mais do que uma pagina por vez e que a paginacao percorra
 * a lista inteira sem pular nem repetir item.
 */
class CatalogoJanelaTest {

    @Test
    fun `a pagina tem no maximo o tamanho configurado`() {
        val catalogo = (1..18_080).toList()
        val p0 = CatalogoJanela.pagina(catalogo, 0)
        assertEquals(CatalogoJanela.TAMANHO_PAGINA, p0.size)
        assertEquals(1, p0.first())
        assertEquals(CatalogoJanela.TAMANHO_PAGINA.toLong(), p0.last().toLong())
    }

    @Test
    fun `percorre o catalogo inteiro sem pular nem repetir`() {
        val catalogo = (1..18_080).toList()
        val vistos = ArrayList<Int>(catalogo.size)
        var pagina = 0
        while (true) {
            val fatia = CatalogoJanela.pagina(catalogo, pagina)
            if (fatia.isEmpty()) break
            vistos.addAll(fatia)
            pagina++
        }
        assertEquals("todos os itens devem ser exibidos uma unica vez", catalogo, vistos)
    }

    @Test
    fun `a ultima pagina e parcial e para corretamente`() {
        val catalogo = (1..130).toList() // 3 paginas: 60 + 60 + 10
        assertEquals(60, CatalogoJanela.pagina(catalogo, 0).size)
        assertEquals(60, CatalogoJanela.pagina(catalogo, 1).size)
        assertEquals(10, CatalogoJanela.pagina(catalogo, 2).size)
        assertTrue("nao ha pagina depois do fim", CatalogoJanela.pagina(catalogo, 3).isEmpty())
    }

    @Test
    fun `temMais indica quando ainda ha itens`() {
        assertTrue(CatalogoJanela.temMais(18_080, 60))
        assertTrue(CatalogoJanela.temMais(18_080, 18_000))
        assertFalse(CatalogoJanela.temMais(18_080, 18_080))
        assertFalse(CatalogoJanela.temMais(0, 0))
    }

    @Test
    fun `302 paginas cobrem os 18080 filmes`() {
        // 18080 / 60 = 301.33 -> 302 paginas no total (indice 0..301)
        val catalogo = (1..18_080).toList()
        var paginas = 0
        var exibidos = 0
        while (true) {
            val fatia = CatalogoJanela.pagina(catalogo, paginas)
            if (fatia.isEmpty()) break
            exibidos += fatia.size
            paginas++
        }
        assertEquals(18_080, exibidos)
        assertEquals(302, paginas)
    }

    @Test
    fun `a grade calcula colunas para 720p 1080p e 4K`() {
        val card = 168 // dp real das dimensoes, convertido em px abaixo
        // 720p (1280), 1080p (1920) e 4K (3840) em densidade 1x.
        assertEquals(6, CatalogoJanela.colunas(1280, card, 14, 34 * 2))
        assertTrue(CatalogoJanela.colunas(1920, card, 14, 34 * 2) in 3..8)
        assertEquals(8, CatalogoJanela.colunas(3840, card, 14, 34 * 2))
    }

    @Test
    fun `a grade nunca fica sem colunas com valores degenerados`() {
        assertEquals(6, CatalogoJanela.colunas(0, 0, 0, 0))
        assertEquals(3, CatalogoJanela.colunas(10, 500, 0, 0))
    }
}
