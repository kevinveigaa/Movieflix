package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Testes da navegação entre episódios (EpisodeNavigation).
 *
 * Cobrem os casos que o player precisa acertar com o controle remoto:
 *  - próximo dentro da mesma temporada;
 *  - virada de temporada escolhendo o PRIMEIRO episódio (nunca o último);
 *  - fim da série (sem próximo) e início da série (sem anterior);
 *  - episódio anterior dentro da temporada e virada para a temporada
 *    anterior escolhendo o ÚLTIMO episódio dela.
 *
 * São testes JVM puros: não dependem de Android nem de emulador.
 */
class EpisodeNavigationTest {

    // Série de exemplo: T1 com episódios 1..3, T2 com 1..2.
    private val temporadas = listOf(1, 2)
    private val epsT1 = listOf(1, 2, 3)
    private val epsT2 = listOf(1, 2)

    @Test
    fun proximoDentroDaMesmaTemporada() {
        val r = EpisodeNavigation.proximo(temporadas, epsT1, season = 1, episode = 1, epsDestino = epsT2)
        assertEquals(EpisodeNavigation.Par(1, 2), r)
    }

    @Test
    fun proximoDoMeioDaTemporada() {
        val r = EpisodeNavigation.proximo(temporadas, epsT1, season = 1, episode = 2, epsDestino = epsT2)
        assertEquals(EpisodeNavigation.Par(1, 3), r)
    }

    @Test
    fun proximoViraTemporadaEscolhendoPrimeiroEpisodio() {
        // Último episódio da T1 (3) → primeiro episódio da T2 (1), nunca o último.
        val r = EpisodeNavigation.proximo(temporadas, epsT1, season = 1, episode = 3, epsDestino = epsT2)
        assertEquals(EpisodeNavigation.Par(2, 1), r)
    }

    @Test
    fun proximoSemListaDestinoUSAConvencaoUm() {
        val r = EpisodeNavigation.proximo(temporadas, epsT1, season = 1, episode = 3)
        assertEquals(EpisodeNavigation.Par(2, 1), r)
    }

    @Test
    fun proximoNoFimDaSerieEhNulo() {
        val r = EpisodeNavigation.proximo(temporadas, epsT2, season = 2, episode = 2, epsDestino = emptyList())
        assertNull(r)
    }

    @Test
    fun anteriorDentroDaMesmaTemporada() {
        val r = EpisodeNavigation.anterior(temporadas, epsT2, season = 2, episode = 2, epsDestino = epsT1)
        assertEquals(EpisodeNavigation.Par(2, 1), r)
    }

    @Test
    fun anteriorViraTemporadaEscolhendoUltimoEpisodio() {
        // Primeiro episódio da T2 (1) → último episódio da T1 (3).
        val r = EpisodeNavigation.anterior(temporadas, epsT2, season = 2, episode = 1, epsDestino = epsT1)
        assertEquals(EpisodeNavigation.Par(1, 3), r)
    }

    @Test
    fun anteriorNoInicioDaSerieEhNulo() {
        val r = EpisodeNavigation.anterior(temporadas, epsT1, season = 1, episode = 1, epsDestino = emptyList())
        assertNull(r)
    }

    @Test
    fun seriesComEpisodiosForaDeOrdemNaoEngana() {
        // O catálogo pode trazer ["1/8","1/7",...]. A lista chega ordenada para
        // MediaCatalog, mas garantimos que a decisão usa min/max e não a posição.
        val fora = listOf(8, 7, 6)
        val r = EpisodeNavigation.proximo(temporadas, fora, season = 1, episode = 7, epsDestino = epsT2)
        assertEquals(EpisodeNavigation.Par(1, 8), r)
        val a = EpisodeNavigation.anterior(temporadas, fora, season = 1, episode = 7, epsDestino = emptyList())
        assertEquals(EpisodeNavigation.Par(1, 6), a)
    }

    @Test
    fun serieDeUmaSoTemporadaNaoSaltaParaLugarNenhum() {
        val umaTemp = listOf(1)
        val eps = listOf(1, 2)
        assertNull(EpisodeNavigation.proximo(umaTemp, eps, 1, 2, emptyList()))
        assertNull(EpisodeNavigation.anterior(umaTemp, eps, 1, 1, emptyList()))
    }
}
