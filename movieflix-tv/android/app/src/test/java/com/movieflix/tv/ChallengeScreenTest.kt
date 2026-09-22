package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes da classificação da tela do provedor.
 *
 * Estes strings são os que o provedor REALMENTE publica (conferidos no corpo HTTP
 * da página de verificação do StreamBetter durante a investigação).
 */
class ChallengeScreenTest {

    private val paginaDesafio =
        "<html><head><title>Verificando...</title>" +
            "<script src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\"></script>" +
            "</head><body><div class=\"cf-turnstile\" data-sitekey=\"0x4AAAAAAEjS65cFP05h6kps\"></div>" +
            "<p>Confirmando que você é uma pessoa de verdade antes de carregar o vídeo...</p>" +
            "</body></html>"

    private val paginaPlayer =
        "<html><body><video id=\"v\" src=\"https://cdn.exemplo/api/proxy?t=abc&ext=m3u8\">" +
            "</video></body></html>"

    private val paginaEnquadramento = "<html><body>Este link só funciona dentro de um iframe</body></html>"

    @Test
    fun `pagina de verificacao e classificada como desafio`() {
        assertEquals(
            ChallengeScreen.DESAFIO,
            ChallengeScreen.classificar(paginaDesafio, iframeLegivel = false, htmlInterno = null, temVideoTopo = false),
        )
    }

    @Test
    fun `desafio dentro do iframe legivel tambem e reconhecido`() {
        assertEquals(
            ChallengeScreen.DESAFIO,
            ChallengeScreen.classificar("<html></html>", iframeLegivel = true, htmlInterno = paginaDesafio, temVideoTopo = false),
        )
    }

    @Test
    fun `video visivel e classificada como player`() {
        assertEquals(
            ChallengeScreen.PLAYER,
            ChallengeScreen.classificar(paginaPlayer, iframeLegivel = false, htmlInterno = null, temVideoTopo = true),
        )
    }

    @Test
    fun `video dentro do iframe legivel e classificado como player`() {
        assertEquals(
            ChallengeScreen.PLAYER,
            ChallengeScreen.classificar("<html></html>", iframeLegivel = true, htmlInterno = paginaPlayer, temVideoTopo = false),
        )
    }

    @Test
    fun `iframe cross-origin sem desafio NAO e erro nem player`() {
        // Caminho NORMAL: o conteúdo real vive dentro de um iframe cross-origin que
        // não podemos ler. Classificar isto como erro era o que fazia o app mostrar
        // mensagem antes da hora. Sem desafio e sem vídeo, é apenas "iframe".
        assertEquals(
            ChallengeScreen.IFRAME,
            ChallengeScreen.classificar("<html><body><iframe src=\"x\"></iframe></body></html>", iframeLegivel = false, htmlInterno = null, temVideoTopo = false),
        )
    }

    @Test
    fun `wrapper pronto sem desafio e sem video e controles`() {
        assertEquals(
            ChallengeScreen.CONTROLES,
            ChallengeScreen.classificar("<html><body><iframe src=\"x\"></iframe></body></html>", iframeLegivel = true, htmlInterno = "<html><body>carregando</body></html>", temVideoTopo = false),
        )
    }

    @Test
    fun `html ausente nao derruba a classificacao`() {
        assertEquals(
            ChallengeScreen.IFRAME,
            ChallengeScreen.classificar(null, iframeLegivel = false, htmlInterno = null, temVideoTopo = false),
        )
    }

    @Test
    fun `desafio tem prioridade sobre video escondido de anuncio`() {
        // A página de verificação do provedor pode esconder um <video> de anúncio.
        // Olhar o player antes do desafio classificaria errado e o watchdog nunca
        // avisaria o usuário.
        val html = paginaDesafio + "<video src=\"https://ads.exemplo/a.mp4\"></video>"
        assertEquals(
            ChallengeScreen.DESAFIO,
            ChallengeScreen.classificar(html, iframeLegivel = false, htmlInterno = null, temVideoTopo = true),
        )
    }

    @Test
    fun `erro de enquadramento e detectado`() {
        assertTrue(ChallengeScreen.ehErroDeEnquadramento(paginaEnquadramento))
        assertTrue(ChallengeScreen.ehErroDeEnquadramento("Este link so funciona dentro de um iframe"))
        assertFalse(ChallengeScreen.ehErroDeEnquadramento(paginaPlayer))
        assertFalse(ChallengeScreen.ehErroDeEnquadramento(null))
    }
}
