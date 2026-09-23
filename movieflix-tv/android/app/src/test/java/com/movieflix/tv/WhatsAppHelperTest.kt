package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Mensagem e links do WhatsApp: numero oficial, mensagem com os dados reais e
 * URL-encoding correto (mesmo comportamento de `encodeURIComponent`).
 */
class WhatsAppHelperTest {

    @Test
    fun numeroOficial() {
        assertEquals("5511943750307", AppConfig.WHATSAPP_NUMBER)
    }

    @Test
    fun mensagemContemEmailPlanoValorEDuracao() {
        val msg = WhatsAppHelper.mensagem(
            email = "cliente@exemplo.com",
            planoNome = "Premium",
            valorFormatado = "R$ 39,90",
            duracaoDias = 30,
        )
        assertTrue(msg.contains("cliente@exemplo.com"))
        assertTrue(msg.contains("Premium"))
        assertTrue(msg.contains("R$ 39,90"))
        assertTrue(msg.contains("30 dias"))
        assertTrue(msg.contains("Quero contratar o plano"))
    }

    @Test
    fun mensagemToleraDadosAusentes() {
        val msg = WhatsAppHelper.mensagem(null, null, null, null)
        assertTrue(msg.contains("(nao informado)"))
        assertTrue(msg.contains("(a definir)"))
    }

    @Test
    fun deepLinkUsaPhoneENumero() {
        val url = WhatsAppHelper.urlDeepLink("Ola")
        assertTrue(url.startsWith("whatsapp://send?phone=5511943750307&text="))
    }

    @Test
    fun waMeUsaONumeroOficial() {
        val url = WhatsAppHelper.urlWhatsAppWeb("Ola")
        assertTrue(url.startsWith("https://wa.me/5511943750307?text="))
    }

    @Test
    fun acentuacaoEEspacosSaoCodificados() {
        val msg = WhatsAppHelper.mensagem("a@b.com", "Premium", "R$ 39,90", 30)
        val deep = WhatsAppHelper.urlDeepLink(msg)
        // Sem caracteres crus que quebram a URL: espaco, acento e quebra de linha.
        assertTrue(!deep.contains(" "))
        assertTrue(!deep.contains("\n"))
        // A quebra de linha do texto original vira %0A.
        assertTrue(deep.contains("%0A"))
    }
}
