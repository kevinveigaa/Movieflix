package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Modelo do catalogo: tipos, categorias, id do TMDb e nota. */
class MovieTest {

    @Test
    fun identificaSerie() {
        assertTrue(Movie(id = "1", title = "S", type = "series").ehSerie)
        assertTrue(Movie(id = "1", title = "S", type = "serie").ehSerie)
        assertTrue(Movie(id = "1", title = "S", type = "tv").ehSerie)
        assertFalse(Movie(id = "1", title = "F", type = "movie").ehSerie)
    }

    @Test
    fun tmdbIdUsaOCampoOuOIdTextual() {
        assertEquals(550L, Movie(id = "1", title = "a", tmdb_id = 550L).tmdbIdNumerico)
        assertEquals(123L, Movie(id = "123", title = "a").tmdbIdNumerico)
        assertEquals(null, Movie(id = "abc", title = "a").tmdbIdNumerico)
    }

    @Test
    fun categoriasSeparadasPorVirgula() {
        val m = Movie(id = "1", title = "a", category = "Acao, Drama ,")
        assertEquals(listOf("Acao", "Drama"), m.categorias)
    }

    @Test
    fun categoriasVaziasViramOutros() {
        assertEquals(listOf("Outros"), Movie(id = "1", title = "a").categorias)
    }

    @Test
    fun notaFormatada() {
        assertEquals("7.5", Movie(id = "1", title = "a", vote_average = 7.54).nota)
        assertEquals("—", Movie(id = "1", title = "a").nota)
    }

    @Test
    fun anoVemDoCampoOuDaDataDeLancamento() {
        assertEquals(2021, Movie(id = "1", title = "a", year = "2021").anoNumerico)
        assertEquals(2019, Movie(id = "1", title = "a", release_date = "2019-05-01").anoNumerico)
        assertEquals(0, Movie(id = "1", title = "a").anoNumerico)
    }

    @Test
    fun qualidadeTemFallback() {
        assertEquals("4K", Movie(id = "1", title = "a", quality = "4K").qualidade())
        assertEquals("Serie", Movie(id = "1", title = "a", type = "series").qualidade())
        assertEquals("Filme", Movie(id = "1", title = "a").qualidade())
    }

    @Test
    fun embedUrlPrefereVideoUrl() {
        val m = Movie(id = "1", title = "a", video_url = "https://x/v.m3u8", player = "https://y/p")
        assertEquals("https://x/v.m3u8", m.embedUrl)
        assertEquals("https://y/p", Movie(id = "1", title = "a", player = "https://y/p").embedUrl)
    }
}
