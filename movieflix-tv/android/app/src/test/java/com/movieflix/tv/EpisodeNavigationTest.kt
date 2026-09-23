package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Navegacao de episodios: dentro da temporada, virada de temporada e limites. */
class EpisodeNavigationTest {

    private val t1e1 = listOf(1, 2, 3)
    private val t2 = listOf(1, 2)

    @Test
    fun proximoDentroDaMesmaTemporada() {
        val r = EpisodeNavigation.proximo(listOf(1, 2), t1e1, season = 1, episode = 1)
        assertEquals(EpisodeNavigation.Par(1, 2), r)
    }

    @Test
    fun proximoViraParaPrimeiroEpisodioDaProximaTemporada() {
        val r = EpisodeNavigation.proximo(listOf(1, 2), listOf(7), season = 1, episode = 7, epsDestino = t2)
        assertEquals(EpisodeNavigation.Par(2, 1), r)
    }

    @Test
    fun proximoEscolheAMenorTemporadaSeguinte() {
        val r = EpisodeNavigation.proximo(listOf(1, 3, 5), listOf(1), season = 1, episode = 1, epsDestino = listOf(1, 2))
        assertEquals(EpisodeNavigation.Par(3, 1), r)
    }

    @Test
    fun semProximoNoFimDaSerie() {
        assertNull(EpisodeNavigation.proximo(listOf(1), listOf(1), season = 1, episode = 1))
    }

    @Test
    fun anteriorVoltaParaOEpisodioAnterior() {
        val r = EpisodeNavigation.anterior(listOf(1), t1e1, season = 1, episode = 3)
        assertEquals(EpisodeNavigation.Par(1, 2), r)
    }

    @Test
    fun anteriorVoltaParaOUltimoEpisodioDaTemporadaAnterior() {
        val r = EpisodeNavigation.anterior(listOf(1, 2), listOf(1), season = 2, episode = 1, epsDestino = listOf(4, 5, 6))
        assertEquals(EpisodeNavigation.Par(1, 6), r)
    }

    @Test
    fun semAnteriorNoComeco() {
        assertNull(EpisodeNavigation.anterior(listOf(1), listOf(1), season = 1, episode = 1))
    }
}
