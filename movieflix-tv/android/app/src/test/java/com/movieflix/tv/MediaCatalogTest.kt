package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Temporadas/episodios a partir de `episodes_available` e URL do embed. */
class MediaCatalogTest {

    private val serie = Movie(
        id = "1",
        title = "Serie Teste",
        type = "series",
        tmdb_id = 1399L,
        episodes_available = listOf("1/1", "1/2", "2/1"),
    )

    private val filme = Movie(id = "2", title = "Filme Teste", type = "movie", tmdb_id = 550L)

    @Test
    fun temporadasOrdenadasEDistintas() {
        assertEquals(listOf(1, 2), MediaCatalog.temporadas(serie))
    }

    @Test
    fun episodiosDaTemporada() {
        assertEquals(listOf(1, 2), MediaCatalog.episodios(serie, 1))
        assertEquals(listOf(1), MediaCatalog.episodios(serie, 2))
    }

    @Test
    fun fallbackQuandoNaoHaEpisodios() {
        val semEps = serie.copy(episodes_available = emptyList())
        assertEquals(listOf(1), MediaCatalog.temporadas(semEps))
        assertEquals(listOf(1), MediaCatalog.episodios(semEps, 1))
    }

    @Test
    fun embedDeSerieApontaParaStreambetterComTemporadaEEpisodio() {
        val url = MediaCatalog.embedUrl(serie, 2, 3)
        assertTrue(url.contains("/serie/1399/2/3"))
        assertTrue(url.contains("key=sb_pk_"))
    }

    @Test
    fun embedDeFilmeApontaParaStreambetter() {
        val url = MediaCatalog.embedUrl(filme, null, null)
        assertTrue(url.contains("/filme/550"))
        assertTrue(url.contains("key=sb_pk_"))
    }

    @Test
    fun chaveNaoEDuplicadaQuandoJaPresente() {
        val ja = "https://streambetter.shop/filme/550?key=sb_pk_x"
        assertEquals(ja, AppConfig.comChaveStreamBetter(ja))
    }

    @Test
    fun rotuloEpisodio() {
        assertEquals("T2 • E3", MediaCatalog.rotuloEpisodio(2, 3))
        // Sem temporada/episodio (ex.: filme) nao ha rotulo a exibir.
        assertEquals("", MediaCatalog.rotuloEpisodio(null, null))
        // Com apenas um dos dois, completa com 1.
        assertEquals("T4 • E1", MediaCatalog.rotuloEpisodio(4, null))
        assertEquals("T1 • E7", MediaCatalog.rotuloEpisodio(null, 7))
    }
}
