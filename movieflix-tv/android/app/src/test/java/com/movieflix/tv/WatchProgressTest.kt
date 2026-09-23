package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Regras de "Continuar assistindo" (src/lib/watchProgress.ts). */
class WatchProgressTest {

    @Test
    fun posicaoLongaContaComoProgesso() {
        assertTrue(WatchHistoryRepository.temProgressoReal(700, 7200))
    }

    @Test
    fun posicaoCurtaMasAcimaDe30PorCentoConta() {
        assertTrue(WatchHistoryRepository.temProgressoReal(400, 1000))
    }

    @Test
    fun posicaoCurtaAbaixoDe30PorCentoNaoConta() {
        assertFalse(WatchHistoryRepository.temProgressoReal(120, 7200))
    }

    @Test
    fun quaseNoFimNaoEntraEmContinuarAssistindo() {
        assertFalse(WatchHistoryRepository.temProgressoReal(7100, 7200))
    }

    @Test
    fun progressoInvalidoEhLixo() {
        assertTrue(WatchHistoryRepository.ehProgressoLixo(0, 7200))
        assertTrue(WatchHistoryRepository.ehProgressoLixo(100, 0))
        assertFalse(WatchHistoryRepository.ehProgressoLixo(100, 7200))
    }

    @Test
    fun percentualCalculado() {
        assertEquals(50, WatchHistoryRepository.progressoPercentual(500, 1000))
        assertEquals(0, WatchHistoryRepository.progressoPercentual(500, 0))
        assertEquals(100, WatchHistoryRepository.progressoPercentual(5000, 1000))
    }
}
