package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Classificacao da tela do embed: desafio tem prioridade sobre video escondido. */
class ChallengeScreenTest {

    @Test
    fun detectaTurnstile() {
        assertTrue(ChallengeScreen.ehDesafio("<div class=\"cf-turnstile\"></div>"))
        assertTrue(ChallengeScreen.ehDesafio("https://challenges.cloudflare.com/turnstile"))
    }

    @Test
    fun detectaRecaptcha() {
        assertTrue(ChallengeScreen.ehDesafio("g-recaptcha"))
        assertFalse(ChallengeScreen.ehDesafio("<video src=\"a.m3u8\"></video>"))
    }

    @Test
    fun detectaErroDeEnquadramento() {
        assertTrue(ChallengeScreen.ehErroDeEnquadramento("Este conteudo so funciona dentro de um iframe"))
        assertTrue(ChallengeScreen.ehErroDeEnquadramento("Only works inside an iframe"))
        assertFalse(ChallengeScreen.ehErroDeEnquadramento("ok"))
    }

    @Test
    fun videoNoTopoEhPlayer() {
        assertEquals(
            ChallengeScreen.PLAYER,
            ChallengeScreen.classificar("<video></video>", iframeLegivel = false, htmlInterno = null, temVideoTopo = true),
        )
    }

    @Test
    fun desafioTemPrioridadeSobreVideo() {
        assertEquals(
            ChallengeScreen.DESAFIO,
            ChallengeScreen.classificar("cf-turnstile", iframeLegivel = true, htmlInterno = "<video></video>", temVideoTopo = true),
        )
    }

    @Test
    fun iframeLegivelComVideoInternoEhPlayer() {
        assertEquals(
            ChallengeScreen.PLAYER,
            ChallengeScreen.classificar(null, iframeLegivel = true, htmlInterno = "<video src='x.m3u8'></video>", temVideoTopo = false),
        )
    }

    @Test
    fun iframeLegivelSemVideoEhControles() {
        assertEquals(
            ChallengeScreen.CONTROLES,
            ChallengeScreen.classificar(null, iframeLegivel = true, htmlInterno = "<div>controles</div>", temVideoTopo = false),
        )
    }

    @Test
    fun semIframeLegivelEhIframe() {
        assertEquals(
            ChallengeScreen.IFRAME,
            ChallengeScreen.classificar("<html></html>", iframeLegivel = false, htmlInterno = null, temVideoTopo = false),
        )
    }

    @Test
    fun htmlVazioNaoQuebra() {
        assertFalse(ChallengeScreen.ehDesafio(null))
        assertFalse(ChallengeScreen.ehDesafio(""))
    }
}
